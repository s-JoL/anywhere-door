import type { WorldSeed, WorldState, WorldInstance, ChatMessage, Message, Memory, TurnSnapshot, InputChannel, TimelineBranch, TimelineBranchSnapshot } from "../types";
import type { Repository } from "../storage";
import type { Delta, DeltaLogEntry } from "../world/delta";
import { commit, type GateCtx, type ProposalSource } from "./write-gate";
import { instanceLock, type LockToken } from "./lock";
import { TraceCollector, emitTrace } from "./trace";
import { consistencyGuard, guardSnapshot } from "./guard";
import { presentCharacters } from "./prompt";
import { runActiveAgents } from "./agent-runtime";
import { DEFAULT_ENGINE_CONFIG } from "./config";
import { newId } from "../id";
import { nextTime } from "../clock";
import { buildConsequenceObservations, buildObservations, buildSelfMemory } from "../memory/observe";
import { propagateGossip } from "../memory/gossip";
import { shouldReflect, reflect } from "../memory/reflect";
import { updateTension, maybeDirect, castTurn, decideSurfacing } from "./director";
import { introductionBeat } from "./introduce";
import { react } from "./reactor";
import { evolveWhileAway } from "../world/offscreen";
import { fleshStubCharacter, fleshStubLocation, fleshStubObject } from "../world/flesh";
import { deriveSettlement, composeReturnEcho } from "../world/settlement";
import { recordFunnel } from "../taste/funnel";
import { routeInput } from "./input-router";
import { parseGodEditDeltas } from "./god-edit";
import { reconcileGodEditMemories } from "./reconcile";

/** Minimum offstage duration to trigger a return echo (§5.6): same tier as offstage evolution, 1 hour. */
export const RETURN_ECHO_MS = 3_600_000;

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
  inputChannel?: InputChannel;
  deltas?: Delta[];
  llm: LlmFn;
  onEvent?: (e: TurnEvent) => void;
}

export interface MarkInstanceSeenArgs {
  repo: Repository;
  instanceId: string;
  now?: number;
}

export interface MaybeReflectArgs {
  repo: Repository;
  instanceId: string;
  charIds: string[];
  characterNameById: (id: string) => string;
  llm: LlmFn;
  branchId?: string;
}

/** Refresh read-only player presence without mutating the world. */
export async function markInstanceSeen({ repo, instanceId, now = Date.now() }: MarkInstanceSeenArgs): Promise<void> {
  const lockToken = await instanceLock.acquire(instanceId);
  try {
    const inst = await repo.getInstance(instanceId);
    if (!inst) return;
    await repo.upsertInstance({
      ...inst,
      lastSeenAt: now,
      settlement: deriveSettlement(inst.state),
    });
  } finally {
    instanceLock.release(lockToken);
  }
}

function mentionsEntity(text: string, name: string | undefined): boolean {
  const trimmed = name?.trim();
  return !!trimmed && text.includes(trimmed);
}

async function fleshAttentionStubEntities(seed: WorldSeed, state: WorldState, text: string, llm: LlmFn): Promise<Delta[]> {
  const here = state.locations[state.currentLocationId];
  if (!here) return [];
  const deltas: Delta[] = [];

  for (const objectId of here.objectIds) {
    const object = state.objects[objectId];
    if (!object || object.archived || object.detail !== "stub") continue;
    if (!mentionsEntity(text, object.name)) continue;
    const delta = await fleshStubObject(seed, state, object, llm);
    if (delta) deltas.push(delta);
  }

  for (const characterId of here.presentCharacterIds) {
    const character = state.characters?.[characterId];
    if (!character || character.archived || character.detail !== "stub") continue;
    if (!mentionsEntity(text, state.roster[characterId]?.name ?? character.name)) continue;
    const delta = await fleshStubCharacter(seed, state, character, llm);
    if (delta) deltas.push(delta);
  }

  return deltas;
}

async function fleshActiveStubCharacters(seed: WorldSeed, state: WorldState, activeCharacterIds: string[], llm: LlmFn): Promise<Delta[]> {
  const deltas: Delta[] = [];
  for (const characterId of activeCharacterIds) {
    const character = state.characters?.[characterId];
    if (!character || character.archived || character.detail !== "stub") continue;
    const delta = await fleshStubCharacter(seed, state, character, llm);
    if (delta) deltas.push(delta);
  }
  return deltas;
}

function causallyTouchedObjectIds(deltas: Delta[]): string[] {
  const ids = new Set<string>();
  for (const delta of deltas) {
    switch (delta.kind) {
      case "setObjectState":
      case "moveObject":
      case "setObjectLocked":
        ids.add(delta.objectId);
        break;
      case "setFact":
        if (delta.entityId && delta.entityId.startsWith("o-")) ids.add(delta.entityId);
        break;
    }
  }
  return [...ids];
}

function causallyTouchedCharacterIds(deltas: Delta[]): string[] {
  const ids = new Set<string>();
  for (const delta of deltas) {
    switch (delta.kind) {
      case "moveCharacter":
        ids.add(delta.characterId);
        break;
      case "setCondition":
        ids.add(delta.entityId);
        break;
      case "setRelationship":
        ids.add(delta.fromId);
        ids.add(delta.toId);
        break;
      case "openThread":
        for (const characterId of delta.relatedCharacterIds ?? []) ids.add(characterId);
        break;
      case "setFact":
        if (delta.entityId) ids.add(delta.entityId);
        break;
    }
  }
  return [...ids];
}

function isClearlyPlayerCaused(cause: string): boolean {
  const text = cause.trim();
  return (
    /^(我|（我|玩家|你)/.test(text) ||
    /^(I|you|player)\b/i.test(text) ||
    /我(把|将|拿|掰|打|砸|放|藏|推|开|关|锁|解|移动|挪|撕|烧|弄|碰|偷|交|递)/.test(text) ||
    /^(把|将)?(拿|掰|打|砸|放|藏|推|打开|关上|锁上|解开|移动|挪|撕|烧|弄|碰|偷|交|递)/.test(text) ||
    /\b(I|you)\s+(take|took|hide|hid|put|push|pushed|open|opened|close|closed|lock|locked|unlock|unlocked|move|moved|break|broke|burn|burned|steal|stole|hand|handed|give|gave)\b/i.test(text)
  );
}

function isNonAmbientSetFact(delta: Delta): delta is Extract<Delta, { kind: "setFact" }> {
  return delta.kind === "setFact" && (delta.hardness ?? "ambient") !== "ambient";
}

function isPlayerConsequenceEntry(entry: DeltaLogEntry): boolean {
  if (!isNonAmbientSetFact(entry.delta)) return false;
  if (entry.source === "god" || entry.source === "offscreen" || entry.source === "flesh" || entry.source === "materializer") return false;
  return isClearlyPlayerCaused(entry.cause);
}

function firstConsequenceFactDeltas(state: WorldState, committed: Delta[], cause: string, turn: number): Delta[] {
  if (!isClearlyPlayerCaused(cause) || committed.some(isNonAmbientSetFact)) return [];

  for (const delta of committed) {
    if (delta.kind === "setObjectState" && delta.state.trim()) {
      const objectName = state.objects[delta.objectId]?.name ?? delta.objectId;
      return [{
        kind: "setFact",
        id: `f-first-consequence-${turn}-${delta.objectId}`,
        entityId: delta.objectId,
        field: "state",
        value: `${objectName}${delta.state}`,
        hardness: "anchored",
        playerKnown: true,
      }];
    }
    if (delta.kind === "setObjectLocked") {
      const objectName = state.objects[delta.objectId]?.name ?? delta.objectId;
      return [{
        kind: "setFact",
        id: `f-first-consequence-${turn}-${delta.objectId}-locked`,
        entityId: delta.objectId,
        field: "locked",
        value: `${objectName}${delta.locked ? "被锁上" : "被打开"}`,
        hardness: "anchored",
        playerKnown: true,
      }];
    }
    if (delta.kind === "setCondition" && delta.condition.trim()) {
      const entityName = state.roster[delta.entityId]?.name ?? delta.entityId;
      return [{
        kind: "setFact",
        id: `f-first-consequence-${turn}-${delta.entityId}-condition`,
        entityId: delta.entityId,
        field: "condition",
        value: `${entityName}${delta.condition}`,
        hardness: "anchored",
        playerKnown: true,
      }];
    }
  }

  return [];
}

function ownedObjectRelationshipDeltas(state: WorldState, committed: Delta[], cause: string): Delta[] {
  if (!isClearlyPlayerCaused(cause)) return [];
  const deltas: Delta[] = [];
  const alreadyRelated = new Set(
    committed
      .filter((delta): delta is Extract<Delta, { kind: "setRelationship" }> => delta.kind === "setRelationship")
      .map((delta) => `${delta.fromId}->${delta.toId}`),
  );
  const seen = new Set<string>();

  for (const delta of committed) {
    let objectId: string | undefined;
    let reasonDetail = "";
    let affinityDelta = -8;
    switch (delta.kind) {
      case "setObjectState":
        objectId = delta.objectId;
        reasonDetail = `改变了${state.objects[objectId]?.name ?? objectId}：${delta.state}`;
        if (/碎|破|坏|弯|毁|打翻|砸|烧/.test(delta.state)) affinityDelta = -14;
        break;
      case "moveObject":
        objectId = delta.objectId;
        reasonDetail = `拿走或挪动了${state.objects[objectId]?.name ?? objectId}`;
        affinityDelta = -12;
        break;
      case "setObjectLocked":
        objectId = delta.objectId;
        reasonDetail = `${delta.locked ? "锁上" : "打开"}了${state.objects[objectId]?.name ?? objectId}`;
        break;
      case "setFact":
        if (delta.entityId && state.objects[delta.entityId]) {
          objectId = delta.entityId;
          reasonDetail = `让${state.objects[objectId]?.name ?? objectId}的${delta.field}成为事实：${delta.value}`;
        }
        break;
    }
    if (!objectId) continue;
    const object = state.objects[objectId];
    const ownerId = typeof object?.props?.owner === "string" ? object.props.owner : "";
    if (!ownerId || ownerId === "you" || !state.roster[ownerId]) continue;
    const key = `${ownerId}->you`;
    if (alreadyRelated.has(key) || seen.has(key)) continue;
    seen.add(key);
    deltas.push({
      kind: "setRelationship",
      fromId: ownerId,
      toId: "you",
      affinityDelta,
      disposition: "对你更戒备",
      reason: `你${reasonDetail}`,
    });
  }

  return deltas;
}

async function fleshCausalStubObjects(seed: WorldSeed, state: WorldState, committed: Delta[], llm: LlmFn): Promise<Delta[]> {
  const deltas: Delta[] = [];
  for (const objectId of causallyTouchedObjectIds(committed)) {
    const object = state.objects[objectId];
    if (!object || object.archived || object.detail !== "stub") continue;
    const delta = await fleshStubObject(seed, state, object, llm);
    if (delta) deltas.push(delta);
  }
  return deltas;
}

async function fleshCausalStubCharacters(seed: WorldSeed, state: WorldState, committed: Delta[], llm: LlmFn): Promise<Delta[]> {
  const deltas: Delta[] = [];
  for (const characterId of causallyTouchedCharacterIds(committed)) {
    const character = state.characters?.[characterId];
    if (!character || character.archived || character.detail !== "stub") continue;
    const delta = await fleshStubCharacter(seed, state, character, llm);
    if (delta) deltas.push(delta);
  }
  return deltas;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneState(state: WorldState): WorldState {
  return cloneJson(state);
}

function stampMemoryBranch(memory: Memory, branchId?: string): Memory {
  const cloned = cloneJson(memory);
  return branchId && !cloned.branchId ? { ...cloned, branchId } : cloned;
}

function stampDeltaBranch(entry: DeltaLogEntry, branchId?: string): DeltaLogEntry {
  const cloned = cloneJson(entry);
  return branchId && !cloned.branchId ? { ...cloned, branchId } : cloned;
}

function ensureActiveBranchId(inst: WorldInstance): string {
  return inst.activeBranchId ?? newId("br");
}

async function captureTurnSnapshot(
  repo: Repository,
  instanceId: string,
  input: string,
  inputChannel: InputChannel | undefined,
  inst: WorldInstance,
  state: WorldState,
): Promise<TurnSnapshot> {
  const [messages, memories, deltaLog] = await Promise.all([
    repo.listMessages(instanceId),
    repo.listAllMemories(instanceId),
    repo.listDeltaLog(instanceId),
  ]);
  return {
    input,
    inputChannel,
    state: cloneState(state),
    activeBranchId: inst.activeBranchId,
    messageIds: messages.map((m) => m.id),
    memoryIds: memories.map((m) => m.id),
    deltaLogIds: deltaLog.map((e) => e.id),
    previousSnapshot: inst.lastTurnSnapshot,
    turn: inst.turn,
    lastSeenAt: inst.lastSeenAt,
    returnEchoedForLastSeenAt: inst.returnEchoedForLastSeenAt,
    settlement: inst.settlement ? cloneJson(inst.settlement) : undefined,
    createdAt: nextTime(),
  };
}

async function captureTimelineBranchSnapshot(repo: Repository, instanceId: string, inst: WorldInstance): Promise<TimelineBranchSnapshot> {
  const [messages, memories, deltaLog] = await Promise.all([
    repo.listMessages(instanceId),
    repo.listAllMemories(instanceId),
    repo.listDeltaLog(instanceId),
  ]);
  return {
    state: cloneState(inst.state),
    activeBranchId: inst.activeBranchId,
    messages: cloneJson(messages),
    memories: memories.map((memory) => stampMemoryBranch(memory, inst.activeBranchId)),
    deltaLog: deltaLog.map((entry) => stampDeltaBranch(entry, inst.activeBranchId)),
    lastTurnSnapshot: inst.lastTurnSnapshot ? cloneJson(inst.lastTurnSnapshot) : undefined,
    turn: inst.turn,
    lastSeenAt: inst.lastSeenAt,
    returnEchoedForLastSeenAt: inst.returnEchoedForLastSeenAt,
    settlement: inst.settlement ? cloneJson(inst.settlement) : undefined,
    directorNotes: inst.directorNotes ? cloneJson(inst.directorNotes) : undefined,
    sceneContract: inst.sceneContract ? cloneJson(inst.sceneContract) : undefined,
  };
}

async function archiveCurrentTimelineBranch(repo: Repository, instanceId: string, inst: WorldInstance, title?: string): Promise<TimelineBranch> {
  const branchId = ensureActiveBranchId(inst);
  const branchedInst = { ...inst, activeBranchId: branchId };
  const at = nextTime();
  const branch: TimelineBranch = {
    id: branchId,
    instanceId,
    seedId: inst.seedId,
    title: title?.trim() || `T${inst.turn ?? 0} branch`,
    createdAt: at,
    updatedAt: at,
    forkedFromTurn: inst.turn,
    snapshot: await captureTimelineBranchSnapshot(repo, instanceId, branchedInst),
  };
  await repo.upsertTimelineBranch(branch);
  return branch;
}

async function restoreTimelineBranchSnapshot(
  repo: Repository,
  instanceId: string,
  inst: WorldInstance,
  snapshot: TimelineBranchSnapshot,
  activeBranchId = snapshot.activeBranchId ?? inst.activeBranchId,
): Promise<void> {
  const [messages, memories, deltaLog] = await Promise.all([
    repo.listMessages(instanceId),
    repo.listAllMemories(instanceId),
    repo.listDeltaLog(instanceId),
  ]);
  await Promise.all([
    repo.deleteMessages(messages.map((m) => m.id)),
    repo.deleteMemories(memories.map((m) => m.id)),
    repo.deleteDeltaLog(deltaLog.map((e) => e.id)),
  ]);
  await Promise.all([
    ...snapshot.messages.map((message) => repo.appendMessage(cloneJson(message))),
    ...snapshot.memories.map((memory) => repo.appendMemory(stampMemoryBranch(memory, activeBranchId))),
    ...snapshot.deltaLog.map((entry) => repo.appendDeltaLog(stampDeltaBranch(entry, activeBranchId))),
  ]);
  await repo.upsertInstance({
    ...inst,
    state: cloneState(snapshot.state),
    activeBranchId,
    turn: snapshot.turn,
    lastSeenAt: snapshot.lastSeenAt,
    returnEchoedForLastSeenAt: snapshot.returnEchoedForLastSeenAt,
    settlement: snapshot.settlement ? cloneJson(snapshot.settlement) : undefined,
    directorNotes: snapshot.directorNotes ? cloneJson(snapshot.directorNotes) : undefined,
    sceneContract: snapshot.sceneContract ? cloneJson(snapshot.sceneContract) : undefined,
    lastTurnSnapshot: snapshot.lastTurnSnapshot ? cloneJson(snapshot.lastTurnSnapshot) : undefined,
    updatedAt: nextTime(),
  });
}

async function restoreTurnSnapshot(
  repo: Repository,
  instanceId: string,
  inst: WorldInstance,
  snapshot: TurnSnapshot,
  lastTurnSnapshot: TurnSnapshot | undefined,
  activeBranchId = snapshot.activeBranchId ?? inst.activeBranchId,
): Promise<void> {
  const [messages, memories, deltaLog] = await Promise.all([
    repo.listMessages(instanceId),
    repo.listAllMemories(instanceId),
    repo.listDeltaLog(instanceId),
  ]);
  const keepMessages = new Set(snapshot.messageIds);
  const keepMemories = new Set(snapshot.memoryIds);
  const keepDeltaLog = new Set(snapshot.deltaLogIds ?? []);
  await Promise.all([
    repo.deleteMessages(messages.filter((m) => !keepMessages.has(m.id)).map((m) => m.id)),
    repo.deleteMemories(memories.filter((m) => !keepMemories.has(m.id)).map((m) => m.id)),
    repo.deleteDeltaLog(deltaLog.filter((e) => !keepDeltaLog.has(e.id)).map((e) => e.id)),
  ]);
  await repo.upsertInstance({
    ...inst,
    state: cloneState(snapshot.state),
    activeBranchId,
    turn: snapshot.turn,
    lastSeenAt: snapshot.lastSeenAt,
    returnEchoedForLastSeenAt: snapshot.returnEchoedForLastSeenAt,
    settlement: snapshot.settlement,
    lastTurnSnapshot,
    updatedAt: nextTime(),
  });
}

export interface EmitReturnOpenBeatArgs {
  repo: Repository;
  instanceId: string;
  onEvent?: (e: TurnEvent) => void;
  now?: number;
}

export interface ReconcileReturnOpenBeatArgs extends EmitReturnOpenBeatArgs {
  seed: WorldSeed;
  llm: LlmFn;
}

async function appendReturnOpenBeat({
  repo,
  instanceId,
  inst,
  msAway,
  onEvent,
  seenAt,
}: {
  repo: Repository;
  instanceId: string;
  inst: WorldInstance;
  msAway: number;
  onEvent?: (e: TurnEvent) => void;
  seenAt?: number;
}): Promise<{ beat: Message; instance: WorldInstance } | null> {
  const lastSeenAt = inst.lastSeenAt;
  if (!lastSeenAt || msAway < RETURN_ECHO_MS || !inst.settlement) return null;
  if (inst.returnEchoedForLastSeenAt === lastSeenAt) return null;

  const echo = composeReturnEcho(inst.settlement, Math.round(msAway / 3_600_000));
  if (!echo) return null;

  const beat: Message = {
    id: newId("n"),
    instanceId,
    role: "system",
    speakerId: null,
    content: echo,
    narration: true,
    createdAt: nextTime(),
  };
  const updated = { ...inst, returnEchoedForLastSeenAt: lastSeenAt, ...(seenAt !== undefined ? { lastSeenAt: seenAt } : {}), updatedAt: nextTime() };
  await repo.appendMessage(beat);
  await repo.upsertInstance(updated);
  onEvent?.({ type: "narration", id: beat.id, content: echo });
  return { beat, instance: updated };
}

function deriveReturnSettlement(state: WorldState, previous?: WorldInstance["settlement"], committedDeltas: Delta[] = []): WorldInstance["settlement"] {
  const fresh = deriveSettlement(state, committedDeltas);
  if (!previous) return fresh;
  return {
    trace: fresh.trace.length > 0 ? fresh.trace : previous.trace,
    unresolved: fresh.unresolved.length > 0 ? fresh.unresolved : previous.unresolved,
    candidates: fresh.candidates.length > 0 ? fresh.candidates : previous.candidates,
    bond: fresh.bond ?? previous.bond,
    atDay: fresh.atDay,
  };
}

export async function emitReturnOpenBeat({ repo, instanceId, onEvent, now = Date.now() }: EmitReturnOpenBeatArgs): Promise<Message | null> {
  const inst = await repo.getInstance(instanceId);
  if (!inst) throw new Error(`实例 ${instanceId} 不存在`);
  const msAway = inst.lastSeenAt ? Math.max(0, now - inst.lastSeenAt) : 0;
  const result = await appendReturnOpenBeat({ repo, instanceId, inst, msAway, onEvent });
  return result?.beat ?? null;
}

export async function reconcileReturnOpenBeat({ seed, repo, instanceId, llm, onEvent, now = Date.now() }: ReconcileReturnOpenBeatArgs): Promise<Message | null> {
  const lockToken = await instanceLock.acquire(instanceId);
  try {
    const inst = await repo.getInstance(instanceId);
    if (!inst) throw new Error(`实例 ${instanceId} 不存在`);
    const activeBranchId = inst.activeBranchId ?? newId("br");
    const msAway = inst.lastSeenAt ? Math.max(0, now - inst.lastSeenAt) : 0;
    const turn = (inst.turn ?? 0) + 1;
    const awayDeltas = await evolveWhileAway({ seed, state: inst.state, rules: seed.rules, msAway, llm });
    const res = await commit(
      { state: inst.state, rules: seed.rules, instanceId, branchId: activeBranchId, turn, repo },
      awayDeltas.map((delta) => ({ delta, source: "offscreen" as const, cause: "return-open" })),
    );
    const reconciled: WorldInstance = {
      ...inst,
      activeBranchId,
      state: res.state,
      settlement: deriveReturnSettlement(res.state, inst.settlement, res.committed),
      updatedAt: nextTime(),
    };
    const result = await appendReturnOpenBeat({ repo, instanceId, inst: reconciled, msAway, onEvent, seenAt: now });
    if (result) return result.beat;
    await repo.upsertInstance({ ...reconciled, lastSeenAt: now, updatedAt: nextTime() });
    return null;
  } finally {
    instanceLock.release(lockToken);
  }
}

/**
 * For each character who spoke this turn: load their memories, and if
 * shouldReflect passes, synthesize reflection memories and persist them.
 */
export async function maybeReflect({ repo, instanceId, charIds, characterNameById, llm, branchId }: MaybeReflectArgs): Promise<void> {
  for (const charId of charIds) {
    const memories = await repo.listMemories(instanceId, charId);
    if (!shouldReflect(memories)) continue;
    const reflections = await reflect({
      instanceId,
      characterName: characterNameById(charId),
      charId,
      memories,
      llm,
      now: nextTime(),
      branchId,
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
  if (args.inputChannel === "god-edit") instanceLock.supersede(args.instanceId);
  const lockToken = await instanceLock.acquire(args.instanceId);
  try {
    await runTurnBody(args, lockToken);
  } finally {
    instanceLock.release(lockToken);
  }
}

/** Turn body: user message → WriteGate commits deltas → write user observation → onstage characters take turns speaking by intent (witness-scoped context). */
async function runTurnBody(
  { seed, repo, instanceId, input, inputChannel, deltas = [], llm, onEvent }: RunTurnArgs,
  lockToken: LockToken,
): Promise<void> {
  let inst = await repo.getInstance(instanceId);
  if (!inst) throw new Error(`实例 ${instanceId} 不存在`);
  if (!inst.activeBranchId) inst = { ...inst, activeBranchId: newId("br") };
  const activeBranchId = inst.activeBranchId;
  const turn = (inst.turn ?? 0) + 1;
  const trace = new TraceCollector(instanceId, turn);

  const routed = routeInput(input, inputChannel);

  if (!routed.isWorldFacing) {
    const at = nextTime();
    if (routed.godEdit !== null) {
      const snapshot = await captureTurnSnapshot(repo, instanceId, input, inputChannel, inst, inst.state);
      try {
        const godDeltas = parseGodEditDeltas(routed.godEdit);
        const res = await commit(
          { state: inst.state, rules: seed.rules, instanceId, branchId: activeBranchId, turn, repo, trace },
          godDeltas.map((delta) => ({ delta, source: "god", cause: routed.cause })),
        );
        const reconciliationMemories = reconcileGodEditMemories({
          before: inst.state,
          committed: res.committed,
          memories: await repo.listAllMemories(instanceId),
          branchId: activeBranchId,
        });
        const content =
          `【上帝编辑】已提交 ${res.committed.length} 条变更` +
          (res.rejected.length > 0 ? `，拒绝 ${res.rejected.length} 条` : "") +
          (reconciliationMemories.length > 0 ? `，校正 ${reconciliationMemories.length} 条记忆。` : "。");
        const beat: Message = {
          id: newId("n"),
          instanceId,
          role: "system",
          speakerId: null,
          content,
          narration: true,
          createdAt: at,
        };
        await repo.appendMessage(beat);
        for (const memory of reconciliationMemories) await repo.appendMemory(memory);
        await repo.upsertInstance({
          ...inst,
          state: res.state,
          turn: res.committed.length > 0 ? turn : inst.turn,
          updatedAt: nextTime(),
          lastSeenAt: Date.now(),
          settlement: deriveSettlement(res.state),
        });
        onEvent?.({ type: "narration", id: beat.id, content: beat.content });
        emitTrace(trace.finish("completed"));
        return;
      } catch (e) {
        await restoreTurnSnapshot(repo, instanceId, inst, snapshot, snapshot.previousSnapshot, activeBranchId);
        emitTrace(trace.finish("rolled-back"));
        throw e;
      }
    }

    if (routed.sceneContract !== null) {
      await repo.upsertInstance({
        ...inst,
        sceneContract: { id: newId("sc"), text: routed.sceneContract, createdAt: at },
        updatedAt: nextTime(),
        lastSeenAt: Date.now(),
      });
    } else {
      const note = { id: newId("dn"), text: routed.directorNote ?? routed.raw, createdAt: at };
      await repo.upsertInstance({
        ...inst,
        directorNotes: [...(inst.directorNotes ?? []), note],
        updatedAt: nextTime(),
        lastSeenAt: Date.now(),
      });
    }
    return;
  }

  // Ensure the player "you" is in the roster (for reactor/prompts), but never add to presentCharacterIds
  if (!inst.state.roster["you"]) {
    inst = { ...inst, state: { ...inst.state, roster: { ...inst.state.roster, you: { name: "你" } } } };
  }

  let state = inst.state;

  // Studio trace (§4.7): this turn's out-of-world diagnostic stream (commits/rejections/casting/triggered pressure lines).
  // In-memory only, not persisted, never enters a projection (§4.2 assertion guard).

  // WriteGate (§4.1): the single durable write entry. Each batch of proposals carries source/cause, validate → apply in order → log,
  // returning the new state and rejection records. Here ctx is built from the current state on the spot, and state is written back after commit.
  const gateCommit = async (proposals: Delta[], source: ProposalSource) => {
    const ctx: GateCtx = { state, rules: seed.rules, instanceId, branchId: activeBranchId, turn, repo, trace };
    const res = await commit(ctx, proposals.map((delta) => ({ delta, source, cause: routed.cause })));
    state = res.state;
    return res;
  };

  // Offstage evolution: when the player returns, lazily backfill the plausible calm changes over the away duration (interaction-driven: leaving freezes the world)
  const msAway = inst.lastSeenAt ? Math.max(0, Date.now() - inst.lastSeenAt) : 0;
  const awayDeltas = await evolveWhileAway({ seed, state, rules: seed.rules, msAway, llm });
  const offscreenRes = await gateCommit(awayDeltas, "offscreen");

  // Return echo (§5.6): when away long enough and a prior settlement record exists, insert a player-visible "return opening" beat
  // (consuming one candidate hook + bond beat). Appended before the snapshot — the offstage changes it reflects are already persisted and should not be rolled back.
  const returnEchoSource: WorldInstance = { ...inst, state, settlement: deriveReturnSettlement(state, inst.settlement, offscreenRes.committed) };
  const returnEcho = await appendReturnOpenBeat({ repo, instanceId, inst: returnEchoSource, msAway, onEvent });
  if (returnEcho) inst = returnEcho.instance;
  else inst = returnEchoSource;

  const snapshot = await captureTurnSnapshot(repo, instanceId, input, inputChannel, inst, state);

  try {
    const userMsg: Message = { id: newId("m"), instanceId, role: "user", speakerId: null, content: routed.transcriptText, createdAt: nextTime() };
    await repo.appendMessage(userMsg);

    await gateCommit(deltas, "user");

    // The user's perceivable line/action is written to onstage characters. Act/observe inputs keep their full
    // text for Director/Reactor adjudication, but character memory receives only what an in-world observer could know.
    const userName = "你";
    for (const obs of buildObservations(instanceId, state, { speakerName: userName, text: routed.observerText }, undefined, activeBranchId)) await repo.appendMemory(obs);

    // Materializer (§13): when the player explicitly pays attention to a visible stub entity,
    // crystallize it before perception so later context sees the richer world state.
    const attentionFleshDeltas = await fleshAttentionStubEntities(seed, state, routed.characterText, llm);
    if (attentionFleshDeltas.length > 0) await gateCommit(attentionFleshDeltas, "flesh");

    const config = DEFAULT_ENGINE_CONFIG;

    // Director casting (§4.3): who is an active agent this turn (runs the full intent→speak→memory loop), and who is an ambient
    // extra (does not run the agent loop). Hard cap = config.maxActiveAgents; the rest are ambient.
    const presentCast = presentCharacters(seed, state);
    const castingMemoriesByCharacter: Record<string, Memory[]> = {};
    for (const character of presentCast) castingMemoriesByCharacter[character.id] = await repo.listMemories(instanceId, character.id);
    const casting = castTurn({
      seed,
      state,
      maxActive: config.maxActiveAgents,
      directorNotes: inst.directorNotes,
      sceneContract: inst.sceneContract,
      query: routed.characterText,
      memoriesByCharacter: castingMemoriesByCharacter,
    });
    trace.setCasting(casting);
    let activeChars = presentCast.filter((c) => casting.active.includes(c.id));

    // First active casting is itself an earned-persistence signal: before a stub
    // character enters the agent loop, crystallize its description/goal through the gate.
    const activeCharacterFleshDeltas = await fleshActiveStubCharacters(seed, state, casting.active, llm);
    if (activeCharacterFleshDeltas.length > 0) {
      await gateCommit(activeCharacterFleshDeltas, "flesh");
      activeChars = presentCharacters(seed, state).filter((c) => casting.active.includes(c.id));
    }

    // AgentRuntime (§4.4): active characters run perceive→intent→speak→remember; prose only, no world-state mutation.
    const { speakerIds } = await runActiveAgents({ seed, state, repo, instanceId, input: routed.characterText, llm, onEvent, branchId: activeBranchId, activeChars, config, trace });

    // Director: update tension from this turn's last line, and insert a world narration if needed
    const allMsgs = await repo.listMessages(instanceId);
    const spokenLines = allMsgs.filter((m) => m.role !== "system").slice(-6).map((m) => m.content);
    const lastLine = spokenLines[spokenLines.length - 1] ?? routed.characterText;
    const tensionBefore = state.tension ?? 0;
    const tensionAfter = updateTension(tensionBefore, lastLine);
    if (tensionAfter !== tensionBefore) await gateCommit([{ kind: "setTension", value: tensionAfter }], "director");
    const beat = await maybeDirect({
      instanceId,
      state,
      recentLines: spokenLines,
      tensionBefore,
      tensionAfter,
      directorNotes: inst.directorNotes,
      sceneContract: inst.sceneContract,
      rules: seed.rules,
      llm,
    });
    if (beat) {
      // §5.8 cheap consistency guard: drop narration that leaks off-snapshot entities,
      // contradicts visible state, or attributes knowledge outside a character's own projection.
      const memoriesByCharacter: Record<string, Memory[]> = {};
      const characterIds = new Set([
        ...seed.characters.map((character) => character.id),
        ...Object.keys(state.characters ?? {}),
        ...Object.keys(state.roster).filter((id) => id !== "you"),
      ]);
      for (const charId of characterIds) memoriesByCharacter[charId] = await repo.listMemories(instanceId, charId);
      const guard = consistencyGuard(beat.content, guardSnapshot(state, { memoriesByCharacter, narrationRule: seed.rules.narrationRule }));
      if (guard.ok) {
        await repo.appendMessage(beat);
        onEvent?.({ type: "narration", id: beat.id, content: beat.content });
      } else {
        trace.recordGuardRejection({
          surface: "director",
          slips: guard.slips,
          reason: "guard rejected director narration",
        });
        trace.note(`旁白漏陷,已丢弃:点到不在场的 ${guard.slips.join("、")}`);
      }
    }

    // Director decides whether to surface an offstage character for a twist (§4.3: whether/whom/how, world-consistent, never through the player's door)
    const surfacing = decideSurfacing(seed, state, tensionAfter);
    if (surfacing) {
      const enterName = state.roster[surfacing.who]?.name ?? seed.characters.find((c) => c.id === surfacing.who)?.name ?? "某人";
      const surfaced = await gateCommit([{ kind: "moveCharacter", characterId: surfacing.who, toLocationId: state.currentLocationId }], "director");
      if (surfaced.committed.length > 0) {
        const introBeat = introductionBeat(instanceId, enterName);
        await repo.appendMessage(introBeat);
        onEvent?.({ type: "narration", id: introBeat.id, content: introBeat.content });
      }
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
    const consequenceWitnessState = state;
    const reactorRes = await gateCommit(reactorDeltas, "reactor");
    const firstConsequenceLog = await repo.listDeltaLog(instanceId);
    const priorPlayerAnchored = firstConsequenceLog.some((entry) => entry.turn < turn && isPlayerConsequenceEntry(entry));
    const firstConsequenceFloor = !priorPlayerAnchored && !reactorRes.committed.some(isNonAmbientSetFact)
      ? await gateCommit(firstConsequenceFactDeltas(state, reactorRes.committed, routed.characterText, turn), "director")
      : { committed: [] as Delta[] };
    for (const obs of buildConsequenceObservations(instanceId, consequenceWitnessState, reactorRes.committed, routed.characterText, activeBranchId, state)) await repo.appendMemory(obs);
    const ownershipRelationshipDeltas = ownedObjectRelationshipDeltas(state, reactorRes.committed, routed.characterText);
    const ownershipRelationshipRes = ownershipRelationshipDeltas.length > 0
      ? await gateCommit(ownershipRelationshipDeltas, "reactor")
      : { committed: [] as Delta[] };
    const causalFleshDeltas = [
      ...(await fleshCausalStubObjects(seed, state, reactorRes.committed, llm)),
      ...(await fleshCausalStubCharacters(seed, state, reactorRes.committed, llm)),
    ];
    if (causalFleshDeltas.length > 0) await gateCommit(causalFleshDeltas, "flesh");
    // Post hook (outside the gate, since it writes memory not world state): evidence→memory — the "why" behind a relationship adjustment
    // also becomes a subjective observation for the party (fromId), entering retrieval and reflection. Only triggers on **persisted** deltas.
    for (const d of [...reactorRes.committed, ...ownershipRelationshipRes.committed]) {
      if (d.kind === "setRelationship" && d.reason?.trim()) {
        await repo.appendMemory(buildSelfMemory(instanceId, d.fromId, `（我记下）${d.reason.trim()}`, 6, activeBranchId));
      }
    }

    // §5.9 funnel: the player's **first anchored fact** = first-consequence. Triggers once per instance only.
    const anchoredNow = [...reactorRes.committed, ...firstConsequenceFloor.committed].some(isNonAmbientSetFact);
    if (anchoredNow) {
      if (!priorPlayerAnchored) recordFunnel(repo, "first-consequence", seed);
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
        for (const g of presentNpcs) recentByChar[g.id] = (await repo.listMemories(instanceId, g.id)).slice(-12);
        for (const m of propagateGossip(presentNpcs, recentByChar, { instanceId, branchId: activeBranchId })) await repo.appendMemory(m);
      }
    }

    // Instance lock (§4.0): if this turn is superseded by regenerate/fork/god-edit while executing, discard its writes —
    // roll back to the turn-start snapshot, no persistence. Never hit in serial (single-tab) scenarios.
    if (instanceLock.isStale(lockToken)) {
      await restoreTurnSnapshot(repo, instanceId, inst, snapshot, snapshot.previousSnapshot);
      emitTrace(trace.finish("stale-dropped"));
      return;
    }

    // §5.6 exit settlement: derived and stored at every turn's end, ensuring whenever the player leaves there's an up-to-date settlement record for the return echo.
    await repo.upsertInstance({ ...inst, state, turn, lastTurnSnapshot: snapshot, updatedAt: nextTime(), lastSeenAt: Date.now(), settlement: deriveSettlement(state) });

    // Reflection: trigger memory distillation for characters who spoke this turn (only generated when there are enough new observations)
    await maybeReflect({
      repo,
      instanceId,
      charIds: speakerIds,
      characterNameById: (id) => state.roster[id]?.name ?? seed.characters.find((c) => c.id === id)?.name ?? id,
      llm,
      branchId: activeBranchId,
    });

    emitTrace(trace.finish("completed"));
  } catch (e) {
    await restoreTurnSnapshot(repo, instanceId, inst, snapshot, snapshot.previousSnapshot);
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
  // Supersede the turn still executing on this instance (§4.0), then wait for
  // the same instance lock before mutating timeline state.
  instanceLock.supersede(instanceId);
  const token = await instanceLock.acquire(instanceId);
  let snapshot: TurnSnapshot;
  try {
    const inst = await repo.getInstance(instanceId);
    if (!inst) throw new Error(`实例 ${instanceId} 不存在`);
    snapshot = inst.lastTurnSnapshot!;
    if (!snapshot) throw new Error("没有可重生成的上一回合");
    await restoreTurnSnapshot(repo, instanceId, inst, snapshot, snapshot.previousSnapshot);
  } finally {
    instanceLock.release(token);
  }

  await runTurn({
    seed,
    repo,
    instanceId,
    input: snapshot.input,
    inputChannel: snapshot.inputChannel,
    llm,
    onEvent,
  });
}

export interface RewindLastTurnArgs {
  repo: Repository;
  instanceId: string;
}

export async function rewindLastTurn({ repo, instanceId }: RewindLastTurnArgs): Promise<void> {
  // Supersede any turn still executing on this instance; then wait for it to
  // release the lock before rewriting the active timeline view.
  instanceLock.supersede(instanceId);
  const token = await instanceLock.acquire(instanceId);
  try {
    const inst = await repo.getInstance(instanceId);
    if (!inst) throw new Error(`实例 ${instanceId} 不存在`);
    const snapshot = inst.lastTurnSnapshot;
    if (!snapshot) throw new Error("没有可回退的上一回合");
    await restoreTurnSnapshot(repo, instanceId, inst, snapshot, snapshot.previousSnapshot);
  } finally {
    instanceLock.release(token);
  }
}

export interface ForkLastTurnArgs {
  repo: Repository;
  instanceId: string;
  title?: string;
}

export async function forkLastTurn({ repo, instanceId, title }: ForkLastTurnArgs): Promise<TimelineBranch> {
  // The current branch is preserved, then the active branch is moved back to the last-turn snapshot.
  instanceLock.supersede(instanceId);
  const token = await instanceLock.acquire(instanceId);
  try {
    const inst = await repo.getInstance(instanceId);
    if (!inst) throw new Error(`实例 ${instanceId} 不存在`);
    const snapshot = inst.lastTurnSnapshot;
    if (!snapshot) throw new Error("没有可分叉的上一回合");

    const archived = await archiveCurrentTimelineBranch(repo, instanceId, inst, title);
    await restoreTurnSnapshot(repo, instanceId, inst, snapshot, snapshot.previousSnapshot, newId("br"));
    return archived;
  } finally {
    instanceLock.release(token);
  }
}

export interface RestoreTimelineBranchArgs {
  repo: Repository;
  instanceId: string;
  branchId: string;
  title?: string;
}

export async function restoreTimelineBranch({ repo, instanceId, branchId, title }: RestoreTimelineBranchArgs): Promise<TimelineBranch> {
  instanceLock.supersede(instanceId);
  const token = await instanceLock.acquire(instanceId);
  try {
    const [inst, branch] = await Promise.all([
      repo.getInstance(instanceId),
      repo.getTimelineBranch(branchId),
    ]);
    if (!inst) throw new Error(`实例 ${instanceId} 不存在`);
    if (!branch || branch.instanceId !== instanceId) throw new Error("分支不存在");

    const archivedCurrent = await archiveCurrentTimelineBranch(repo, instanceId, inst, title);
    await restoreTimelineBranchSnapshot(repo, instanceId, inst, branch.snapshot, branch.id);
    return archivedCurrent;
  } finally {
    instanceLock.release(token);
  }
}
