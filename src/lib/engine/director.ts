import type { WorldSeed, WorldState, Message, PressureLine, DirectorNote, SceneContract, WorldRules, Memory } from "../types";
import type { LlmFn } from "./turn";
import { newId } from "../id";
import { nextTime } from "../clock";
import { presentCharacters } from "./prompt";
import { offstageCharacterIds } from "./introduce";
import { formatNarrationSourceSnapshot, resolveNarrationRule } from "../world/narration";
import { effectiveAffinity } from "../world/relationship";
import { keywordsOf, relevance } from "../memory/keywords";
import { assembleBeliefGraph } from "./belief";

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
  directorNotes?: DirectorNote[];
  sceneContract?: SceneContract;
  query?: string;
  memoriesByCharacter?: Record<string, Memory[]>;
}

const DEFAULT_MAX_ACTIVE = 4;

function pressureSalience(state: WorldState, characterId: string): number {
  return (state.pressureLines ?? [])
    .filter((line) => line.status === "active" && (line.relatedCharacterIds ?? []).includes(characterId))
    .reduce((sum, line) => sum + Math.max(0, line.intensity), 0);
}

function relationshipSalience(state: WorldState, characterId: string): number {
  const loc = state.locations[state.currentLocationId];
  const present = new Set([...(loc?.presentCharacterIds ?? []), "you"]);
  const rels = state.relationships?.[characterId];
  if (!rels) return 0;
  let strongest = 0;
  for (const [targetId, relationship] of Object.entries(rels)) {
    if (!present.has(targetId)) continue;
    strongest = Math.max(strongest, Math.abs(effectiveAffinity(relationship, state.time.day)));
  }
  return strongest / 10;
}

function controlSalience(name: string, notes?: DirectorNote[], contract?: SceneContract): number {
  if (!name) return 0;
  const haystack = [
    ...(notes ?? []).slice(-3).map((note) => note.text),
    contract?.text ?? "",
  ].join("\n");
  return haystack.includes(name) ? 50 : 0;
}

function controlText(notes?: DirectorNote[], contract?: SceneContract): string {
  return [
    ...(notes ?? []).slice(-3).map((note) => note.text),
    contract?.text ?? "",
  ].join("\n");
}

function memorySalience(characterId: string, queryKw: string[], memoriesByCharacter?: Record<string, Memory[]>): number {
  if (queryKw.length === 0) return 0;
  const memories = memoriesByCharacter?.[characterId] ?? [];
  let strongest = 0;
  for (const memory of memories) {
    const overlap = relevance(queryKw, memory.keywords.length > 0 ? memory.keywords : keywordsOf(memory.text));
    if (overlap <= 0) continue;
    strongest = Math.max(strongest, overlap * (memory.importance / 10) * (memory.confidence ?? 1));
  }
  return strongest * 5;
}

function beliefSalience(state: WorldState, characterId: string, memoriesByCharacter?: Record<string, Memory[]>): number {
  const facts = state.facts ?? [];
  if (facts.length === 0) return 0;
  const edges = assembleBeliefGraph({ facts, observers: [characterId], memoriesByObserver: memoriesByCharacter ?? {} });
  let score = 0;
  for (const edge of edges) {
    if (edge.stance === "wrong") score = Math.max(score, 45 * edge.confidence);
    else if (edge.stance === "believes") score = Math.max(score, 8 * edge.confidence);
    else if (edge.stance === "suspects") score = Math.max(score, 4 * edge.confidence);
  }
  return score;
}

function castingSalience(
  state: WorldState,
  characterId: string,
  controls: Pick<CastTurnArgs, "directorNotes" | "sceneContract" | "memoriesByCharacter"> & { queryKw: string[] },
): number {
  const name = state.roster[characterId]?.name ?? characterId;
  return (
    pressureSalience(state, characterId) * 10 +
    controlSalience(name, controls.directorNotes, controls.sceneContract) +
    memorySalience(characterId, controls.queryKw, controls.memoriesByCharacter) +
    beliefSalience(state, characterId, controls.memoriesByCharacter) +
    relationshipSalience(state, characterId)
  );
}

/**
 * Decide the active/ambient split for the turn. The hard cap is the invariant; within
 * that cap, pressure-line salience gets first claim on context, then stable scene order
 * fills the remaining slots. Relationship heat is a secondary signal within the same
 * budget.
 */
export function castTurn({
  seed,
  state,
  maxActive = DEFAULT_MAX_ACTIVE,
  directorNotes,
  sceneContract,
  query,
  memoriesByCharacter,
}: CastTurnArgs): CastingDecision {
  const present = presentCharacters(seed, state).map((c) => c.id);
  const order = new Map(present.map((id, index) => [id, index]));
  const queryKw = keywordsOf([query ?? "", controlText(directorNotes, sceneContract)].filter(Boolean).join("\n"));
  const active = [...present]
    .sort((a, b) => {
      const diff =
        castingSalience(state, b, { directorNotes, sceneContract, queryKw, memoriesByCharacter }) -
        castingSalience(state, a, { directorNotes, sceneContract, queryKw, memoriesByCharacter });
      return diff !== 0 ? diff : (order.get(a) ?? 0) - (order.get(b) ?? 0);
    })
    .slice(0, maxActive);
  const activeSet = new Set(active);
  return { active, ambient: present.filter((id) => !activeSet.has(id)) };
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
  "你是世界环境导演。你要把【已提交事实快照】按【叙述规则】转述成一句简短的第三人称中文旁白，" +
  "描述此刻**外部可见**的环境/气氛微变化（光线、声音、天气、人群、物件）。" +
  "写得有活气，但只 against 快照里的事实; 不剧透任何人内心、不替角色说话、不下判断、不发明新实体。" +
  "只输出这一句旁白本身，不要引号、不要任何多余文字。";

export interface NarrateArgs {
  state: WorldState;
  recentLines: string[];
  directorNotes?: DirectorNote[];
  sceneContract?: SceneContract;
  rules?: WorldRules;
  llm: LlmFn;
}

function formatDirectorNotes(notes: DirectorNote[] | undefined): string {
  const lines = (notes ?? [])
    .slice(-3)
    .map((note) => note.text.trim())
    .filter(Boolean)
    .map((text) => `- ${text}`);
  if (lines.length === 0) return "";
  return `【导演笔记】（出世界控制：只影响导演节奏/边界，不是角色知识）\n${lines.join("\n")}`;
}

function formatSceneContract(contract: SceneContract | undefined): string {
  const text = contract?.text.trim();
  if (!text) return "";
  return `【场景合约】（出世界控制：当前场景的强度/边界/节奏，不是角色知识）\n- ${text}`;
}

/** Produce one line of world narration; failure/empty → null (degrade by inserting no narration). */
export async function directorNarrate({ state, recentLines, directorNotes, sceneContract, rules, llm }: NarrateArgs): Promise<string | null> {
  const user = [
    `【场景】${state.locations[state.currentLocationId]?.name ?? ""}（${state.time.clock}，${state.time.lighting}）`,
    `【叙述规则】${resolveNarrationRule(rules)}`,
    `【已提交事实快照】\n${formatNarrationSourceSnapshot(state)}`,
    `【最近】\n${recentLines.slice(-6).join("\n") || "（暂无）"}`,
    formatSceneContract(sceneContract),
    formatDirectorNotes(directorNotes),
  ].filter(Boolean).join("\n");
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
  directorNotes?: DirectorNote[];
  sceneContract?: SceneContract;
  rules?: WorldRules;
  llm: LlmFn;
}

/** Tension at or above this counts as "high". */
const HIGH_TENSION = 7;

/** Beat decision: insert a world narration when tension jumps clearly, or is already high and still climbing. Returns a narration Message or null. */
export async function maybeDirect(args: MaybeDirectArgs): Promise<Message | null> {
  const { instanceId, state, recentLines, tensionBefore, tensionAfter, directorNotes, sceneContract, rules, llm } = args;
  const rose = tensionAfter - tensionBefore >= 1.5;          // clear jump
  const climbingHigh = tensionAfter >= HIGH_TENSION && tensionAfter > tensionBefore; // high and still climbing
  if (!rose && !climbingHigh) return null; // high but flat/decaying turns insert nothing, naturally preventing spam
  const line = await directorNarrate({ state, recentLines, directorNotes, sceneContract, rules, llm });
  if (!line) return null;
  return { id: newId("n"), instanceId, role: "system", speakerId: null, content: line, narration: true, createdAt: nextTime() };
}
