import type { WorldSeed, WorldState, WorldInstance, ChatMessage, Message, TurnSnapshot } from "../types";
import type { Repository } from "../storage";
import type { Delta, DeltaSource } from "../world/delta";
import { validateDelta, applyDelta } from "../world/delta";
import { buildCharacterPrompt, presentCharacters, stripSpeakerPrefix } from "./prompt";
import { decideIntent } from "./intent";
import { selectSpeakers, type Candidate } from "./select";
import { DEFAULT_ENGINE_CONFIG } from "./config";
import { newId } from "../id";
import { nextTime } from "../clock";
import { scoreMemories } from "../memory/retrieve";
import { keywordsOf } from "../memory/keywords";
import { buildObservations, buildSelfMemory } from "../memory/observe";
import { shouldReflect, reflect } from "../memory/reflect";
import { updateTension, maybeDirect } from "./director";
import { offstageCharacterIds, introduceCharacter, introductionBeat } from "./introduce";
import { react } from "./reactor";
import { evolveWhileAway } from "../world/offscreen";
import { fleshStubLocation } from "../world/flesh";

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

/** 多发言者自由发言回合：用户消息 → 校验并应用 delta → 写用户观察 → 在场角色按意图轮流发言（witness 作用域上下文）。 */
export async function runTurn({ seed, repo, instanceId, input, deltas = [], llm, onEvent }: RunTurnArgs): Promise<void> {
  let inst = await repo.getInstance(instanceId);
  if (!inst) throw new Error(`实例 ${instanceId} 不存在`);

  // 确保玩家 "you" 在名册中（供 reactor/prompts 使用），但绝不加入 presentCharacterIds
  if (!inst.state.roster["you"]) {
    inst = { ...inst, state: { ...inst.state, roster: { ...inst.state.roster, you: { name: "你" } } } };
  }

  let state = inst.state;

  // 事件日志:本回合号 + 把每条落库 delta 追加到 per-instance 日志(归因 source/cause/世界时间)
  const turn = (inst.turn ?? 0) + 1;
  const logDelta = (delta: Delta, source: DeltaSource) =>
    repo.appendDeltaLog({
      id: newId("dl"), instanceId, turn, source, cause: input,
      gameDay: state.time.day, gameClock: state.time.clock, at: nextTime(), delta,
    });

  // 离场演化:玩家回来时,按离开时长懒补这段时间里合理发生的平静变化(交互驱动:离开即冻结)
  const msAway = inst.lastSeenAt ? Math.max(0, Date.now() - inst.lastSeenAt) : 0;
  const awayDeltas = await evolveWhileAway({ seed, state, rules: seed.rules, msAway, llm });
  for (const d of awayDeltas) {
    const v = validateDelta(state, seed.rules, d);
    if (v.ok) { state = applyDelta(state, d); await logDelta(d, "offscreen"); }
    else console.warn(`[offscreen] 丢弃非法 delta: ${v.reason}`);
  }

  const snapshot = await captureTurnSnapshot(repo, instanceId, input, state);

  try {
    const userMsg: Message = { id: newId("m"), instanceId, role: "user", speakerId: null, content: input, createdAt: nextTime() };
    await repo.appendMessage(userMsg);

    for (const d of deltas) {
      const v = validateDelta(state, seed.rules, d);
      if (v.ok) { state = applyDelta(state, d); await logDelta(d, "user"); }
      else console.warn(`[turn] 丢弃非法 delta: ${v.reason}`);
    }

    // 用户这句作为观察写给当前在场者（witness 作用域）
    const userName = "你";
    for (const obs of buildObservations(state, { speakerName: userName, text: input })) await repo.appendMemory(obs);

    const config = DEFAULT_ENGINE_CONFIG;
    let budget = config.maxConsecutiveAiTurns;
    let lastSpeakerId: string | null = null;
    const speakerIds: string[] = [];

    while (budget > 0) {
      const present = presentCharacters(seed, state);
      const candidates = present.filter((c) => c.id !== lastSpeakerId);
      if (candidates.length === 0) break;

      // 并行意图判断（各用自身近段观察作上下文）
      const cands: Candidate[] = await Promise.all(candidates.map(async (c) => {
        const recent = (await repo.listMemories(c.id)).slice(-8);
        const intent = await decideIntent({ seed, state, character: c, recent, llm });
        return { id: c.id, ...intent };
      }));

      const sel = selectSpeakers(cands, config.maxSpeakersPerRound);
      if (sel.ids.length === 0) break;

      for (const id of sel.ids) {
        if (budget <= 0) break;
        const speaker = present.find((c) => c.id === id);
        if (!speaker) continue;
        const own = await repo.listMemories(speaker.id);
        const memories = scoreMemories(own, keywordsOf(input), { topK: 6 });
        const recent = own.slice(-8); // witness 作用域：只用该角色自己的观察
        const msgs = buildCharacterPrompt(seed, state, speaker, { memories, recent });

        const replyId = newId("m");
        onEvent?.({ type: "speaker-start", id: replyId, speakerId: speaker.id, speakerName: speaker.name });
        const { content } = await llm(msgs, (d) => onEvent?.({ type: "delta", id: replyId, text: d }));
        const clean = stripSpeakerPrefix(speaker.name, content);
        onEvent?.({ type: "speaker-end", id: replyId, content: clean });

        const reply: Message = { id: replyId, instanceId, role: "assistant", speakerId: speaker.id, content: clean, createdAt: nextTime() };
        await repo.appendMessage(reply);
        // 该发言作为观察写给当前在场者（含后续发言者，从而看到刚说的话）
        for (const obs of buildObservations(state, { speakerName: speaker.name, text: clean })) await repo.appendMemory(obs);
        if (!speakerIds.includes(speaker.id)) speakerIds.push(speaker.id);
        lastSpeakerId = speaker.id;
        budget--;
      }
      if (sel.forced) break; // 破冰只破一次，随即交回用户
    }

    // 导演：按本回合最后一句更新张力，必要时插一条世界旁白
    const allMsgs = await repo.listMessages(instanceId);
    const spokenLines = allMsgs.filter((m) => m.role !== "system").slice(-6).map((m) => m.content);
    const lastLine = spokenLines[spokenLines.length - 1] ?? input;
    const tensionBefore = state.tension ?? 0;
    const tensionAfter = updateTension(tensionBefore, lastLine);
    state = { ...state, tension: tensionAfter };
    const beat = await maybeDirect({ instanceId, state, recentLines: spokenLines, tensionBefore, tensionAfter, llm });
    if (beat) {
      await repo.appendMessage(beat);
      onEvent?.({ type: "narration", id: beat.id, content: beat.content });
    }

    // 张力攒高且有幕后角色时，God 拉一个入场制造转折（每回合至多一次）
    if (tensionAfter >= 6) {
      const off = offstageCharacterIds(seed, state);
      if (off.length > 0) {
        const enterId = off[0];
        const enterName = state.roster[enterId]?.name ?? seed.characters.find((c) => c.id === enterId)?.name ?? "某人";
        state = introduceCharacter(state, enterId, state.currentLocationId);
        const introBeat = introductionBeat(instanceId, enterName);
        await repo.appendMessage(introBeat);
        onEvent?.({ type: "narration", id: introBeat.id, content: introBeat.content });
      }
    }

    // 世界反应器：LLM 提议结构化 delta，逐条验证后应用，持久化到 state
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
    for (const d of reactorDeltas) {
      const v = validateDelta(state, seed.rules, d);
      if (!v.ok) { console.warn(`[reactor] 丢弃非法 delta: ${v.reason}`); continue; }
      state = applyDelta(state, d);
      await logDelta(d, "reactor");
      // evidence→记忆:关系调整的"凭什么"也成为当事人(fromId)的一条主观观察,进入检索与反思
      if (d.kind === "setRelationship" && d.reason?.trim()) {
        await repo.appendMemory(buildSelfMemory(d.fromId, `（我记下）${d.reason.trim()}`, 6));
      }
    }

    // stub→fleshed:玩家踏入的当前地点若仍是 stub,世界当场把它充实为 fleshed
    const here = state.locations[state.currentLocationId];
    if (here?.detail === "stub") {
      const fd = await fleshStubLocation(seed, here, llm);
      if (fd) {
        const v = validateDelta(state, seed.rules, fd);
        if (v.ok) { state = applyDelta(state, fd); await logDelta(fd, "flesh"); }
      }
    }

    await repo.upsertInstance({ ...inst, state, turn, lastTurnSnapshot: snapshot, updatedAt: nextTime(), lastSeenAt: Date.now() });

    // 反思：为本回合发言的角色触发记忆提炼（有足够新观察时才生成）
    await maybeReflect({
      repo,
      charIds: speakerIds,
      characterNameById: (id) => state.roster[id]?.name ?? seed.characters.find((c) => c.id === id)?.name ?? id,
      llm,
    });
  } catch (e) {
    await restoreTurnSnapshot(repo, instanceId, inst, snapshot, inst.lastTurnSnapshot);
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
