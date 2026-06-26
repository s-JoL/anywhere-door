import type { Delta } from "@/lib/world/delta";
import type { WorldState, WorldRules, WorldSeed, ChatMessage } from "@/lib/types";
import type { LlmFn } from "@/lib/engine/turn";
import { parseDeltas } from "@/lib/engine/reactor";
import { classifyPrecision, boundOffstageDeltas } from "@/lib/world/offstage";

/**
 * Offstage evolution (axis 5).
 *
 * Consistent with "interaction-driven evolution: leaving freezes" — the world
 * doesn't advance in real time while you're away; instead, when you **return**,
 * it **lazily backfills** the calm changes that would reasonably have happened over
 * that span. Proposes Delta[] (same currency as the World Reactor); the caller
 * ([`turn.ts`]) runs them with source="offscreen" through the single write gate
 * WriteGate (§4.1): validate → apply → log.
 */
export interface OffscreenContext {
  seed: WorldSeed;
  state: WorldState;
  rules: WorldRules;
  msAway: number; // real milliseconds since the player's last interaction (0 means unknown/just arrived)
  llm?: LlmFn;
}

const HOUR_MS = 3_600_000;
const MIN_AWAY_MS = HOUR_MS;   // less than 1 hour away → no evolution
const MAX_HOURS = 72;          // cap on evolution intensity (no runaway changes no matter how long away)

const OFFSCREEN_SYSTEM =
  "你是世界的**离场演化器**。玩家离开了这个世界一段时间,期间世界继续平静地存在。" +
  "提出**少量、保守、符合世界逻辑**的状态变化——这段时间里合理会发生的:角色可能挪了位置或改变外显状态、" +
  "时间推移、物态自然变化、关系因时间略微淡化。**不要制造重大剧情事件**(那要玩家在场才发生),不要引入新命名角色,不要替玩家做任何事。" +
  "若推进玩家尚不知情的压力线,必须在同一个 advanceThread 里给出玩家可见的 nextSign;没有 nextSign 就不要推进或揭示该线。" +
  "只输出 Delta JSON 数组(可为空[]),只用这些类型:" +
  '{"kind":"moveCharacter",...} {"kind":"setObjectState",...} {"kind":"advanceTime",...} {"kind":"setCondition",...} {"kind":"setRelationship",...} ' +
  '{"kind":"advanceThread","id":"...","intensityDelta":1}(让已有压力线随时间小幅推进)。';

export function buildOffscreenPrompt(seed: WorldSeed, state: WorldState, hoursAway: number): ChatMessage[] {
  const roster = Object.entries(state.roster).map(([id, o]) => `  ${id}: ${o.name}${o.condition ? `（${o.condition}）` : ""}`).join("\n");
  const loc = state.locations[state.currentLocationId];
  // Offstage evolution reads active pressure lines (§4.6): let "what reasonably happened over this span" advance along existing suspense threads, not out of thin air.
  const active = (state.pressureLines ?? []).filter((p) => p.status !== "resolved");
  const threads = active.map((p) => `  ${p.id}（强度${p.intensity}）: ${p.summary}`).join("\n");
  // Three precision tiers (§5.5): only near/related characters can evolve, far is frozen. Tell the model the evolvable scope.
  const evolvable = Object.keys(state.roster)
    .filter((id) => id !== "you" && classifyPrecision(state, id) !== "far")
    .map((id) => `  ${id}: ${state.roster[id]?.name ?? id}（${classifyPrecision(state, id)}）`)
    .join("\n");
  const user =
    `【世界观】${seed.worldview}\n` +
    `【当前地点】${loc?.name ?? state.currentLocationId}\n` +
    `【时间】第${state.time.day}天 ${state.time.clock}\n` +
    `【角色名册】\n${roster || "（无）"}\n` +
    `【进行中的压力线】\n${threads || "（无）"}\n` +
    `【可演化范围(仅这些角色可变,其余冻结)】\n${evolvable || "（无）"}\n\n` +
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
    // Three-tier precision hard constraint: drop any proposal acting on a far (frozen) entity; world-level deltas (time/threads) pass through.
    return boundOffstageDeltas(state, parseDeltas(content));
  } catch {
    return [];
  }
}
