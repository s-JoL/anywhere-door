import type { Delta } from "@/lib/world/delta";
import type { WorldState, WorldRules, WorldSeed, ChatMessage } from "@/lib/types";
import type { LlmFn } from "@/lib/engine/turn";
import { parseDeltas } from "@/lib/engine/reactor";

/**
 * 离场演化(轴5)。
 *
 * 与「交互驱动演化:离开即冻结」一致——世界不在你离开时实时推进,而是在你**回来**时,
 * 按离开时长**懒补**这段时间里合理会发生的平静变化。提议 Delta[](与 World Reactor 同币),
 * 调用方([`turn.ts`])以 source="offscreen" 经唯一写入口 WriteGate(§4.1)校验→应用→落日志。
 */
export interface OffscreenContext {
  seed: WorldSeed;
  state: WorldState;
  rules: WorldRules;
  msAway: number; // 距玩家上次交互的真实毫秒数(0 表示未知/刚来)
  llm?: LlmFn;
}

const HOUR_MS = 3_600_000;
const MIN_AWAY_MS = HOUR_MS;   // 离开不足 1 小时不演化
const MAX_HOURS = 72;          // 演化烈度的封顶(离开再久也不爆改)

const OFFSCREEN_SYSTEM =
  "你是世界的**离场演化器**。玩家离开了这个世界一段时间,期间世界继续平静地存在。" +
  "提出**少量、保守、符合世界逻辑**的状态变化——这段时间里合理会发生的:角色可能挪了位置或改变外显状态、" +
  "时间推移、物态自然变化、关系因时间略微淡化。**不要制造重大剧情事件**(那要玩家在场才发生),不要引入新命名角色,不要替玩家做任何事。" +
  "只输出 Delta JSON 数组(可为空[]),只用这些类型:" +
  '{"kind":"moveCharacter",...} {"kind":"setObjectState",...} {"kind":"advanceTime",...} {"kind":"setCondition",...} {"kind":"setRelationship",...} ' +
  '{"kind":"advanceThread","id":"...","intensityDelta":1}(让已有压力线随时间小幅推进)。';

export function buildOffscreenPrompt(seed: WorldSeed, state: WorldState, hoursAway: number): ChatMessage[] {
  const roster = Object.entries(state.roster).map(([id, o]) => `  ${id}: ${o.name}${o.condition ? `（${o.condition}）` : ""}`).join("\n");
  const loc = state.locations[state.currentLocationId];
  // 离场演化读取活跃压力线(§4.6):让"这段时间里合理发生的事"沿已有悬念线推进,而非凭空。
  const active = (state.pressureLines ?? []).filter((p) => p.status !== "resolved");
  const threads = active.map((p) => `  ${p.id}（强度${p.intensity}）: ${p.summary}`).join("\n");
  const user =
    `【世界观】${seed.worldview}\n` +
    `【当前地点】${loc?.name ?? state.currentLocationId}\n` +
    `【时间】第${state.time.day}天 ${state.time.clock}\n` +
    `【角色名册】\n${roster || "（无）"}\n` +
    `【进行中的压力线】\n${threads || "（无）"}\n\n` +
    `玩家离开了约 ${hoursAway} 小时。请只输出这段时间里**合理发生**的 Delta JSON 数组（没有合理变化就输出 []）：`;
  return [
    { role: "system", content: OFFSCREEN_SYSTEM },
    { role: "user", content: user },
  ];
}

export async function evolveWhileAway(ctx: OffscreenContext): Promise<Delta[]> {
  const { seed, state, msAway, llm } = ctx;
  if (!llm || msAway < MIN_AWAY_MS) return [];
  const hoursAway = Math.min(MAX_HOURS, Math.round(msAway / HOUR_MS));
  try {
    const { content } = await llm(buildOffscreenPrompt(seed, state, hoursAway));
    return parseDeltas(content);
  } catch {
    return [];
  }
}
