import type { WorldSeed, WorldState, WorldInstance, ChatMessage, Message, Memory, TurnSnapshot } from "../types";
import type { Repository } from "../storage";
import type { Delta } from "../world/delta";
import { commit, type GateCtx, type ProposalSource } from "./write-gate";
import { instanceLock, type LockToken } from "./lock";
import { TraceCollector, emitTrace } from "./trace";
import { consistencyGuard, guardSnapshot } from "./guard";
import { presentCharacters } from "./prompt";
import { runActiveAgents } from "./agent-runtime";
import { DEFAULT_ENGINE_CONFIG } from "./config";
import { newId } from "../id";
import { nextTime } from "../clock";
import { buildObservations, buildSelfMemory } from "../memory/observe";
import { propagateGossip } from "../memory/gossip";
import { shouldReflect, reflect } from "../memory/reflect";
import { updateTension, maybeDirect, castTurn, decideSurfacing } from "./director";
import { introduceCharacter, introductionBeat } from "./introduce";
import { react } from "./reactor";
import { evolveWhileAway } from "../world/offscreen";
import { fleshStubLocation } from "../world/flesh";
import { deriveSettlement, composeReturnEcho } from "../world/settlement";
import { recordFunnel } from "../taste/funnel";

/** Minimum offstage duration to trigger a return echo (§5.6): same tier as offstage evolution, 1 hour. */
const RETURN_ECHO_MS = 3_600_000;

export type LlmFn = (messages: ChatMessage[], onContent?: (delta: string) => void) => Promise<{ content: string }>;

export type TurnEvent =
  | { type: "speaker-start"; id: string; speakerId: string; speakerName: string }
  | { type: "delta"; id: string; text: string }
  | { type: "speaker-end"; id: string; content: string }
  | { type: "narration"; id: string; content: string };

export interface RunTurnArgs {
  seed: WorldSeed;
  repo: Repository;
  instanceId: string;
  input: string;
  deltas?: Delta[];
  llm: LlmFn;
  onEvent?: (e: TurnEvent) => void;
}

export interface MaybeReflectArgs {
  repo: Repository;
  charIds: string[];
  characterNameById: (id: string) => string;
  llm: LlmFn;
}

function cloneState(state: WorldState): WorldState {
  return JSON.parse(JSON.stringify(state)) as WorldState;
}

async function captureTurnSnapshot(
  repo: Repository,
  instanceId: string,
  input: string,
  state: WorldState,
): Promise<TurnSnapshot> {
  const [messages, memories] = await Promise.all([
    repo.listMessages(instanceId),
    repo.listAllMemories(),
  ]);
  return {
    input,
    state: cloneState(state),
    messageIds: messages.map((m) => m.id),
    memoryIds: memories.map((m) => m.id),
    createdAt: nextTime(),
  };
}

async function restoreTurnSnapshot(
  repo: Repository,
  instanceId: string,
  inst: WorldInstance,
  snapshot: TurnSnapshot,
  lastTurnSnapshot: TurnSnapshot | undefined,
): Promise<void> {
  const [messages, memories] = await Promise.all([
    repo.listMessages(instanceId),
    repo.listAllMemories(),
  ]);
  const keepMessages = new Set(snapshot.messageIds);
  const keepMemories = new Set(snapshot.memoryIds);
  await Promise.all([
    repo.deleteMessages(messages.filter((m) => !keepMessages.has(m.id)).map((m) => m.id)),
    repo.deleteMemories(memories.filter((m) => !keepMemories.has(m.id)).map((m) => m.id)),
  ]);
  await repo.upsertInstance({
    ...inst,
    state: cloneState(snapshot.state),
    lastTurnSnapshot,
    updatedAt: nextTime(),
  });
}

/**
 * For each character who spoke this turn: load their memories, and if
 * shouldReflect passes, synthesize reflection memories and persist them.
 */
export async function maybeReflect({ repo, charIds, characterNameById, llm }: MaybeReflectArgs): Promise<void> {
  for (const charId of charIds) {
    const memories = await repo.listMemories(charId);
    if (!shouldReflect(memories)) continue;
    const reflections = await reflect({
      characterName: characterNameById(charId),
      charId,
      memories,
      llm,
      now: nextTime(),
    });
    for (const r of reflections) await repo.appendMemory(r);
  }
}

/**
 * Multi-speaker free-utterance turn (public entry). First acquires the per-instance
 * instance lock (§4.0), ensuring one world commits only one turn at a time; the real
 * turn body runs inside the lock, and the lock is released on completion or exception.
 */
export async function runTurn(args: RunTurnArgs): Promise<void> {
  const lockToken = await instanceLock.acquire(args.instanceId);
  try {
    await runTurnBody(args, lockToken);
  } finally {
    instanceLock.release(lockToken);
  }
}

/** Turn body: user message → WriteGate commits deltas → write user observation → onstage characters take turns speaking by intent (witness-scoped context). */
async function runTurnBody(
  { seed, repo, instanceId, input, deltas = [], llm, onEvent }: RunTurnArgs,
  lockToken: LockToken,
): Promise<void> {
  let inst = await repo.getInstance(instanceId);
  if (!inst) throw new Error(`实例 ${instanceId} 不存在`);

  // Ensure the player "you" is in the roster (for reactor/prompts), but never add to presentCharacterIds
  if (!inst.state.roster["you"]) {
    inst = { ...inst, state: { ...inst.state, roster: { ...inst.state.roster, you: { name: "你" } } } };
  }

  let state = inst.state;

  // This turn's number
  const turn = (inst.turn ?? 0) + 1;

  // Studio trace (§4.7): this turn's out-of-world diagnostic stream (commits/rejections/casting/triggered pressure lines).
  // In-memory only, not persisted, never enters a projection (§4.2 assertion guard).
  const trace = new TraceCollector(instanceId, turn);

  // WriteGate (§4.1): the single durable write entry. Each batch of proposals carries source/cause, validate → apply in order → log,
  // returning the new state and rejection records. Here ctx is built from the current state on the spot, and state is written back after commit.
  const gateCommit = async (proposals: Delta[], source: ProposalSource) => {
    const ctx: GateCtx = { state, rules: seed.rules, instanceId, turn, repo, trace };
    const res = await commit(ctx, proposals.map((delta) => ({ delta, source, cause: input })));
    state = res.state;
    return res;
  };

  // Offstage evolution: when the player returns, lazily backfill the plausible calm changes over the away duration (interaction-driven: leaving freezes the world)
  const msAway = inst.lastSeenAt ? Math.max(0, Date.now() - inst.lastSeenAt) : 0;
  const awayDeltas = await evolveWhileAway({ seed, state, rules: seed.rules, msAway, llm });
  await gateCommit(awayDeltas, "offscreen");

  // Return echo (§5.6): when away long enough and a prior settlement record exists, insert a player-visible "return opening" beat
  // (consuming one candidate hook + bond beat). Appended before the snapshot — the offstage changes it reflects are already persisted and should not be rolled back.
  if (msAway >= RETURN_ECHO_MS && inst.settlement) {
    const echo = composeReturnEcho(inst.settlement, Math.round(msAway / 3_600_000));
    if (echo) {
      const echoBeat: Message = { id: newId("n"), instanceId, role: "system", speakerId: null, content: echo, narration: true, createdAt: nextTime() };
      await repo.appendMessage(echoBeat);
      onEvent?.({ type: "narration", id: echoBeat.id, content: echo });
    }
  }

  const snapshot = await captureTurnSnapshot(repo, instanceId, input, state);

  try {
    const userMsg: Message = { id: newId("m"), instanceId, role: "user", speakerId: null, content: input, createdAt: nextTime() };
    await repo.appendMessage(userMsg);

    await gateCommit(deltas, "user");

    // The user's line is written as an observation to the currently onstage characters (witness-scoped)
    const userName = "你";
    for (const obs of buildObservations(state, { speakerName: userName, text: input })) await repo.appendMemory(obs);

    const config = DEFAULT_ENGINE_CONFIG;

    // Director casting (§4.3): who is an active agent this turn (runs the full intent→speak→memory loop), and who is an ambient
    // extra (does not run the agent loop). Hard cap = config.maxActiveAgents; the rest are ambient.
    const casting = castTurn({ seed, state, maxActive: config.maxActiveAgents });
    trace.setCasting(casting);
    const activeChars = presentCharacters(seed, state).filter((c) => casting.active.includes(c.id));

    // AgentRuntime (§4.4): active characters run perceive→intent→speak→remember; prose only, no world-state mutation.
    const { speakerIds } = await runActiveAgents({ seed, state, repo, instanceId, input, llm, onEvent, activeChars, config });

    // Director: update tension from this turn's last line, and insert a world narration if needed
    const allMsgs = await repo.listMessages(instanceId);
    const spokenLines = allMsgs.filter((m) => m.role !== "system").slice(-6).map((m) => m.content);
    const lastLine = spokenLines[spokenLines.length - 1] ?? input;
    const tensionBefore = state.tension ?? 0;
    const tensionAfter = updateTension(tensionBefore, lastLine);
    state = { ...state, tension: tensionAfter };
    const beat = await maybeDirect({ instanceId, state, recentLines: spokenLines, tensionBefore, tensionAfter, llm });
    if (beat) {
      // §5.8 cheap consistency guard: if an ambient narration names a character who is not onstage, treat it as a slip and discard the narration.
      const guard = consistencyGuard(beat.content, guardSnapshot(state));
      if (guard.ok) {
        await repo.appendMessage(beat);
        onEvent?.({ type: "narration", id: beat.id, content: beat.content });
      } else {
        trace.note(`旁白漏陷,已丢弃:点到不在场的 ${guard.slips.join("、")}`);
      }
    }

    // Director decides whether to surface an offstage character for a twist (§4.3: whether/whom/how, world-consistent, never through the player's door)
    const surfacing = decideSurfacing(seed, state, tensionAfter);
    if (surfacing) {
      const enterName = state.roster[surfacing.who]?.name ?? seed.characters.find((c) => c.id === surfacing.who)?.name ?? "某人";
      state = introduceCharacter(state, surfacing.who, state.currentLocationId);
      const introBeat = introductionBeat(instanceId, enterName);
      await repo.appendMessage(introBeat);
      onEvent?.({ type: "narration", id: introBeat.id, content: introBeat.content });
    }

    // World Reactor: LLM proposes structured deltas, validated one by one then applied, persisted to state
    const allMsgsForReactor = await repo.listMessages(instanceId);
    const recentLines = allMsgsForReactor
      .filter((m) => m.role !== "system")
      .slice(-8)
      .map((m) => {
        const speakerName = m.speakerId ? (state.roster[m.speakerId]?.name ?? m.speakerId) : "你";
        return `${speakerName}：${m.content}`;
      });
    const nameById: Record<string, string> = {};
    for (const [id, obj] of Object.entries(state.roster)) nameById[id] = obj.name;
    const reactorDeltas = await react({ state, recentLines, nameById, llm, rules: seed.rules });
    const reactorRes = await gateCommit(reactorDeltas, "reactor");
    // Post hook (outside the gate, since it writes memory not world state): evidence→memory — the "why" behind a relationship adjustment
    // also becomes a subjective observation for the party (fromId), entering retrieval and reflection. Only triggers on **persisted** deltas.
    for (const d of reactorRes.committed) {
      if (d.kind === "setRelationship" && d.reason?.trim()) {
        await repo.appendMemory(buildSelfMemory(d.fromId, `（我记下）${d.reason.trim()}`, 6));
      }
    }

    // §5.9 funnel: the player's **first anchored fact** = first-consequence. Triggers once per instance only.
    const anchoredNow = reactorRes.committed.some((d) => d.kind === "setFact" && (d.hardness ?? "ambient") !== "ambient");
    if (anchoredNow) {
      const log = await repo.listDeltaLog(instanceId);
      const priorAnchored = log.some((e) => e.turn < turn && e.delta.kind === "setFact" && ((e.delta as { hardness?: string }).hardness ?? "ambient") !== "ambient");
      if (!priorAnchored) recordFunnel(repo, "first-consequence", seed);
    }

    // stub→fleshed: if the current location the player steps into is still a stub, the world fleshes it out on the spot
    const here = state.locations[state.currentLocationId];
    if (here?.detail === "stub") {
      const fd = await fleshStubLocation(seed, here, llm);
      if (fd) await gateCommit([fd], "flesh");
    }

    // Gossip: co-located NPCs pass along their most salient recent first-hand observations by word of mouth → others present gain second-hand hearsay memories
    {
      const hereNow = state.locations[state.currentLocationId];
      const presentNpcs = (hereNow?.presentCharacterIds ?? [])
        .filter((id) => id !== "you")
        .map((id) => ({ id, name: state.roster[id]?.name ?? id }));
      if (presentNpcs.length >= 2) {
        const recentByChar: Record<string, Memory[]> = {};
        for (const g of presentNpcs) recentByChar[g.id] = (await repo.listMemories(g.id)).slice(-12);
        for (const m of propagateGossip(presentNpcs, recentByChar)) await repo.appendMemory(m);
      }
    }

    // Instance lock (§4.0): if this turn is superseded by regenerate/fork/god-edit while executing, discard its writes —
    // roll back to the turn-start snapshot, no persistence. Never hit in serial (single-tab) scenarios.
    if (instanceLock.isStale(lockToken)) {
      await restoreTurnSnapshot(repo, instanceId, inst, snapshot, inst.lastTurnSnapshot);
      emitTrace(trace.finish("stale-dropped"));
      return;
    }

    // §5.6 exit settlement: derived and stored at every turn's end, ensuring whenever the player leaves there's an up-to-date settlement record for the return echo.
    await repo.upsertInstance({ ...inst, state, turn, lastTurnSnapshot: snapshot, updatedAt: nextTime(), lastSeenAt: Date.now(), settlement: deriveSettlement(state) });

    // Reflection: trigger memory distillation for characters who spoke this turn (only generated when there are enough new observations)
    await maybeReflect({
      repo,
      charIds: speakerIds,
      characterNameById: (id) => state.roster[id]?.name ?? seed.characters.find((c) => c.id === id)?.name ?? id,
      llm,
    });

    emitTrace(trace.finish("completed"));
  } catch (e) {
    await restoreTurnSnapshot(repo, instanceId, inst, snapshot, inst.lastTurnSnapshot);
    emitTrace(trace.finish("rolled-back"));
    throw e;
  }
}

export interface RegenerateLastTurnArgs {
  seed: WorldSeed;
  repo: Repository;
  instanceId: string;
  llm: LlmFn;
  onEvent?: (e: TurnEvent) => void;
}

export async function regenerateLastTurn({ seed, repo, instanceId, llm, onEvent }: RegenerateLastTurnArgs): Promise<void> {
  // Supersede the turn still executing on this instance (§4.0): its writes will be judged stale and discarded.
  instanceLock.supersede(instanceId);

  const inst = await repo.getInstance(instanceId);
  if (!inst) throw new Error(`实例 ${instanceId} 不存在`);
  const snapshot = inst.lastTurnSnapshot;
  if (!snapshot) throw new Error("没有可重生成的上一回合");

  await restoreTurnSnapshot(repo, instanceId, inst, snapshot, undefined);

  await runTurn({
    seed,
    repo,
    instanceId,
    input: snapshot.input,
    llm,
    onEvent,
  });
}
