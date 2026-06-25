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
 * 多发言者自由发言回合(对外入口)。先取得 per-instance 实例锁(§4.0),保证同一世界一次
 * 只提交一个回合;真正的回合体在锁内执行,结束/异常都释放锁。
 */
export async function runTurn(args: RunTurnArgs): Promise<void> {
  const lockToken = await instanceLock.acquire(args.instanceId);
  try {
    await runTurnBody(args, lockToken);
  } finally {
    instanceLock.release(lockToken);
  }
}

/** 回合体:用户消息 → WriteGate 提交 delta → 写用户观察 → 在场角色按意图轮流发言（witness 作用域上下文）。 */
async function runTurnBody(
  { seed, repo, instanceId, input, deltas = [], llm, onEvent }: RunTurnArgs,
  lockToken: LockToken,
): Promise<void> {
  let inst = await repo.getInstance(instanceId);
  if (!inst) throw new Error(`实例 ${instanceId} 不存在`);

  // 确保玩家 "you" 在名册中（供 reactor/prompts 使用），但绝不加入 presentCharacterIds
  if (!inst.state.roster["you"]) {
    inst = { ...inst, state: { ...inst.state, roster: { ...inst.state.roster, you: { name: "你" } } } };
  }

  let state = inst.state;

  // 本回合号
  const turn = (inst.turn ?? 0) + 1;

  // Studio 追踪(§4.7):本回合的 out-of-world 诊断流(提交/拒绝/选角/触发的压力线)。
  // 仅内存、不持久化、绝不进投影(§4.2 断言守护)。
  const trace = new TraceCollector(instanceId, turn);

  // WriteGate(§4.1):唯一的持久化写入口。每批提议带来源/cause,校验→按序应用→落日志,
  // 返回新 state 与拒绝记录。这里以当前 state 现场构造 ctx,提交后回写 state。
  const gateCommit = async (proposals: Delta[], source: ProposalSource) => {
    const ctx: GateCtx = { state, rules: seed.rules, instanceId, turn, repo, trace };
    const res = await commit(ctx, proposals.map((delta) => ({ delta, source, cause: input })));
    state = res.state;
    return res;
  };

  // 离场演化:玩家回来时,按离开时长懒补这段时间里合理发生的平静变化(交互驱动:离开即冻结)
  const msAway = inst.lastSeenAt ? Math.max(0, Date.now() - inst.lastSeenAt) : 0;
  const awayDeltas = await evolveWhileAway({ seed, state, rules: seed.rules, msAway, llm });
  await gateCommit(awayDeltas, "offscreen");

  const snapshot = await captureTurnSnapshot(repo, instanceId, input, state);

  try {
    const userMsg: Message = { id: newId("m"), instanceId, role: "user", speakerId: null, content: input, createdAt: nextTime() };
    await repo.appendMessage(userMsg);

    await gateCommit(deltas, "user");

    // 用户这句作为观察写给当前在场者（witness 作用域）
    const userName = "你";
    for (const obs of buildObservations(state, { speakerName: userName, text: input })) await repo.appendMemory(obs);

    const config = DEFAULT_ENGINE_CONFIG;

    // 导演选角(§4.3):谁是本回合的 active agent(跑完整意图→发言→记忆回路),谁是 ambient
    // 群演(不跑 agent 回路)。硬上限 = config.maxActiveAgents;其余为 ambient。
    const casting = castTurn({ seed, state, maxActive: config.maxActiveAgents });
    trace.setCasting(casting);
    const activeChars = presentCharacters(seed, state).filter((c) => casting.active.includes(c.id));

    // AgentRuntime(§4.4):active 角色跑 perceive→intent→speak→remember;只产散文,不改世界态。
    const { speakerIds } = await runActiveAgents({ seed, state, repo, instanceId, input, llm, onEvent, activeChars, config });

    // 导演：按本回合最后一句更新张力，必要时插一条世界旁白
    const allMsgs = await repo.listMessages(instanceId);
    const spokenLines = allMsgs.filter((m) => m.role !== "system").slice(-6).map((m) => m.content);
    const lastLine = spokenLines[spokenLines.length - 1] ?? input;
    const tensionBefore = state.tension ?? 0;
    const tensionAfter = updateTension(tensionBefore, lastLine);
    state = { ...state, tension: tensionAfter };
    const beat = await maybeDirect({ instanceId, state, recentLines: spokenLines, tensionBefore, tensionAfter, llm });
    if (beat) {
      // §5.8 cheap consistency guard:环境旁白若点了一个并不在场的角色名,判定为漏陷并丢弃该旁白。
      const guard = consistencyGuard(beat.content, guardSnapshot(state));
      if (guard.ok) {
        await repo.appendMessage(beat);
        onEvent?.({ type: "narration", id: beat.id, content: beat.content });
      } else {
        trace.note(`旁白漏陷,已丢弃:点到不在场的 ${guard.slips.join("、")}`);
      }
    }

    // 导演决定是否让幕后角色登场制造转折(§4.3:whether/whom/how,世界一致,绝不经玩家之门)
    const surfacing = decideSurfacing(seed, state, tensionAfter);
    if (surfacing) {
      const enterName = state.roster[surfacing.who]?.name ?? seed.characters.find((c) => c.id === surfacing.who)?.name ?? "某人";
      state = introduceCharacter(state, surfacing.who, state.currentLocationId);
      const introBeat = introductionBeat(instanceId, enterName);
      await repo.appendMessage(introBeat);
      onEvent?.({ type: "narration", id: introBeat.id, content: introBeat.content });
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
    const reactorRes = await gateCommit(reactorDeltas, "reactor");
    // 后置钩子(在 gate 之外,因为它写记忆而非世界态):evidence→记忆——关系调整的"凭什么"
    // 也成为当事人(fromId)的一条主观观察,进入检索与反思。仅对**已落库**的 delta 触发。
    for (const d of reactorRes.committed) {
      if (d.kind === "setRelationship" && d.reason?.trim()) {
        await repo.appendMemory(buildSelfMemory(d.fromId, `（我记下）${d.reason.trim()}`, 6));
      }
    }

    // stub→fleshed:玩家踏入的当前地点若仍是 stub,世界当场把它充实为 fleshed
    const here = state.locations[state.currentLocationId];
    if (here?.detail === "stub") {
      const fd = await fleshStubLocation(seed, here, llm);
      if (fd) await gateCommit([fd], "flesh");
    }

    // 传话:同场 NPC 把最显著的近期一手观察口耳相传 → 在场他人获得二手 hearsay 记忆
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

    // 实例锁(§4.0):若本回合在执行期间被 regenerate/fork/god-edit 取代,丢弃其写入——
    // 回滚到回合起点快照,不持久化。串行(单标签页)场景下永不命中。
    if (instanceLock.isStale(lockToken)) {
      await restoreTurnSnapshot(repo, instanceId, inst, snapshot, inst.lastTurnSnapshot);
      emitTrace(trace.finish("stale-dropped"));
      return;
    }

    await repo.upsertInstance({ ...inst, state, turn, lastTurnSnapshot: snapshot, updatedAt: nextTime(), lastSeenAt: Date.now() });

    // 反思：为本回合发言的角色触发记忆提炼（有足够新观察时才生成）
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
  // 取代该实例上仍在执行的回合(§4.0):其写入将被判定为 stale 而丢弃。
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
