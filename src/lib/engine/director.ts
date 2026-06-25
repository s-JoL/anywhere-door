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

/** Tension at or above this triggers "someone should arrive". */
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

/** Pure: update tension from the last line (conflict/action/strong punctuation raise it, blandness decays it), clamped 0–10. */
export function updateTension(prev: number, lastLine: string): number {
  let t = prev;
  if (/[（(].*[)）]/.test(lastLine)) t += 0.5;          // has action
  if (/[！!?？]/.test(lastLine)) t += 1;                 // emotion
  if (/枪|血|死|逃|打|抓|吼|威胁|危险|喊/.test(lastLine)) t += 2; // conflict words
  if (lastLine.length <= 6) t -= 1;                      // brief small talk
  t -= 1;                                                // natural decay
  return Math.max(0, Math.min(10, t));
}

const DIRECTOR_SYSTEM =
  "你是世界环境导演。只用一句简短的第三人称中文旁白，描述此刻**外部可见**的环境/气氛微变化（光线、声音、天气、人群、物件），" +
  "推进临场感但不剧透任何人内心、不替角色说话、不下判断。只输出这一句旁白本身，不要引号、不要任何多余文字。";

export interface NarrateArgs { state: WorldState; recentLines: string[]; llm: LlmFn }

/** Produce one line of world narration; failure/empty → null (degrade by inserting no narration). */
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

/** Tension at or above this counts as "high". */
const HIGH_TENSION = 7;

/** Beat decision: insert a world narration when tension jumps clearly, or is already high and still climbing. Returns a narration Message or null. */
export async function maybeDirect(args: MaybeDirectArgs): Promise<Message | null> {
  const { instanceId, state, recentLines, tensionBefore, tensionAfter, llm } = args;
  const rose = tensionAfter - tensionBefore >= 1.5;          // clear jump
  const climbingHigh = tensionAfter >= HIGH_TENSION && tensionAfter > tensionBefore; // high and still climbing
  if (!rose && !climbingHigh) return null; // high but flat/decaying turns insert nothing, naturally preventing spam
  const line = await directorNarrate({ state, recentLines, llm });
  if (!line) return null;
  return { id: newId("n"), instanceId, role: "system", speakerId: null, content: line, narration: true, createdAt: nextTime() };
}
