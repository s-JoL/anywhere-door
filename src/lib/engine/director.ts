import type { WorldSeed, WorldState, Message, PressureLine } from "../types";
import type { LlmFn } from "./turn";
import { newId } from "../id";
import { nextTime } from "../clock";
import { presentCharacters } from "./prompt";
import { offstageCharacterIds } from "./introduce";

/**
 * §4.3 Director casting. The omniscient Director (orchestration, not a character —
 * charter §9) chooses who is *active* this turn. "A bustling market is not thirty
 * agents" (§13.1): at most a hard cap run the full intent→speak→memory loop; the rest
 * are ambient, narrated as prose with no agent loop.
 */
export interface CastingDecision {
  active: string[]; // run the full agent loop (hard cap)
  ambient: string[]; // present but not run as agents this turn
}

export interface CastTurnArgs {
  seed: WorldSeed;
  state: WorldState;
  maxActive?: number;
}

const DEFAULT_MAX_ACTIVE = 4;

/**
 * Decide the active/ambient split for the turn. Phase 0 is deterministic: keep the
 * first `maxActive` present characters active (stable order), the rest ambient. The
 * salience-driven choice is Phase 1; the cap is the invariant that matters now.
 */
export function castTurn({ seed, state, maxActive = DEFAULT_MAX_ACTIVE }: CastTurnArgs): CastingDecision {
  const present = presentCharacters(seed, state).map((c) => c.id);
  return { active: present.slice(0, maxActive), ambient: present.slice(maxActive) };
}

/** How an offstage entity surfaces — world-consistently, never through the player's door. */
export type SurfaceHow = "present-unnoticed" | "adjacent" | "egress";
export interface Surfacing {
  who: string;
  how: SurfaceHow;
}

/** 张力到此即触发"该来个人了"。 */
const SURFACE_TENSION = 6;

/**
 * The Director's surfacing decision (whether / whom / how), replacing the old
 * hardcoded `tension ≥ 6 → off[0]` heuristic. Only an offstage character may surface,
 * and only from the adjacent world ("present-unnoticed"/"adjacent"/"egress") — never
 * "through the player's door" (charter: the player's door is unique).
 */
export function decideSurfacing(seed: WorldSeed, state: WorldState, tension: number): Surfacing | null {
  if (tension < SURFACE_TENSION) return null;
  const off = offstageCharacterIds(seed, state);
  if (off.length === 0) return null;
  return { who: off[0], how: "adjacent" };
}

/**
 * §5.2 The Director picks the 1–2 active pressure lines to lean on this turn —
 * highest-intensity active threads first. Read-only; advancing them is a gate commit.
 */
export function selectActiveThreads(state: WorldState, max = 2): PressureLine[] {
  return (state.pressureLines ?? [])
    .filter((p) => p.status === "active")
    .sort((a, b) => b.intensity - a.intensity)
    .slice(0, max);
}

/** 纯：根据最近一句更新张力（冲突/动作/强标点升，平淡衰减），钳 0–10。 */
export function updateTension(prev: number, lastLine: string): number {
  let t = prev;
  if (/[（(].*[)）]/.test(lastLine)) t += 0.5;          // 有动作
  if (/[！!?？]/.test(lastLine)) t += 1;                 // 情绪
  if (/枪|血|死|逃|打|抓|吼|威胁|危险|喊/.test(lastLine)) t += 2; // 冲突词
  if (lastLine.length <= 6) t -= 1;                      // 短促闲谈
  t -= 1;                                                // 自然衰减
  return Math.max(0, Math.min(10, t));
}

const DIRECTOR_SYSTEM =
  "你是世界环境导演。只用一句简短的第三人称中文旁白，描述此刻**外部可见**的环境/气氛微变化（光线、声音、天气、人群、物件），" +
  "推进临场感但不剧透任何人内心、不替角色说话、不下判断。只输出这一句旁白本身，不要引号、不要任何多余文字。";

export interface NarrateArgs { state: WorldState; recentLines: string[]; llm: LlmFn }

/** 产一句世界旁白；失败/空 → null（降级不插旁白）。 */
export async function directorNarrate({ state, recentLines, llm }: NarrateArgs): Promise<string | null> {
  const user =
    `【场景】${state.locations[state.currentLocationId]?.name ?? ""}（${state.time.clock}，${state.time.lighting}）\n` +
    `【最近】\n${recentLines.slice(-6).join("\n") || "（暂无）"}`;
  try {
    const { content } = await llm([{ role: "system", content: DIRECTOR_SYSTEM }, { role: "user", content: user }]);
    const line = content.trim();
    return line.length > 0 ? line : null;
  } catch {
    return null;
  }
}

export interface MaybeDirectArgs {
  instanceId: string;
  state: WorldState;
  recentLines: string[];
  tensionBefore: number;
  tensionAfter: number;
  llm: LlmFn;
}

/** 张力到此即算"高位"。 */
const HIGH_TENSION = 7;

/** 节拍决策：张力明显跃升、或已在高位且仍在上行时，插一条世界旁白。返回旁白 Message 或 null。 */
export async function maybeDirect(args: MaybeDirectArgs): Promise<Message | null> {
  const { instanceId, state, recentLines, tensionBefore, tensionAfter, llm } = args;
  const rose = tensionAfter - tensionBefore >= 1.5;          // 明显跃升
  const climbingHigh = tensionAfter >= HIGH_TENSION && tensionAfter > tensionBefore; // 高位仍在上行
  if (!rose && !climbingHigh) return null; // 高位但持平/衰减的回合不插，天然防刷屏
  const line = await directorNarrate({ state, recentLines, llm });
  if (!line) return null;
  return { id: newId("n"), instanceId, role: "system", speakerId: null, content: line, narration: true, createdAt: nextTime() };
}
