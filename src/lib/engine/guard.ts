/**
 * §5.8 Narration consistency guard.
 *
 * Prose is still model-generated, so a *cheap, conservative* guard screens the
 * high-value slips that break immersion: ambient narration that names an entity
 * which is not on stage (a character who isn't here, an object that isn't visible,
 * or a far non-adjacent place). The guard is deliberately restrained — it flags
 * only known offstage names that appear verbatim — so it rarely false-positives;
 * the snapshot and guard are language-agnostic, while the narration *voice* lives
 * in the renderer (§15.14).
 *
 * Pure: no I/O, no state mutation.
 */

import type { Memory, WorldState } from "../types";
import type { CharacterProjection } from "./perception";

export interface VisibleObjectClaim {
  name: string;
  locked?: boolean;
  state?: string;
}

export interface GuardSnapshot {
  /** Names on stage right now: present characters, visible objects, the location. */
  presentNames: string[];
  /** Known entity names that are NOT on stage (offstage characters, hidden objects, far locations). */
  offstageNames: string[];
  /** Distortion media allowed by the world's narration rule, if any. */
  lawfulDistortionMedia?: string[];
  /** Cheap state claims for visible objects, used only for conservative contradiction checks. */
  visibleObjects: VisibleObjectClaim[];
  /** Known character names; used to catch narrator-side inner knowledge attribution. */
  characterNames: string[];
  /** Character-owned memories keyed by display name, when the caller can provide projection evidence. */
  characterMemoriesByName?: Record<string, Memory[]>;
}

export interface GuardSnapshotOpts {
  memoriesByCharacter?: Record<string, Memory[]>;
  narrationRule?: string;
}

export interface GuardResult {
  ok: boolean;
  /** Offstage names the prose mentioned as if present (the slips). */
  slips: string[];
}

/** Build the guard snapshot from the current scene. */
export function guardSnapshot(state: WorldState, opts: GuardSnapshotOpts = {}): GuardSnapshot {
  const loc = state.locations[state.currentLocationId];
  const presentIds = new Set(loc?.presentCharacterIds ?? []);
  const visibleObjectIds = new Set(loc?.objectIds ?? []);
  const adjacentLocationIds = new Set(loc?.connections ?? []);
  const presentNames: string[] = [];
  const visibleObjects: VisibleObjectClaim[] = [];
  const characterNames: string[] = [];
  const characterMemoriesByName: Record<string, Memory[]> = {};
  for (const id of presentIds) presentNames.push(state.roster[id]?.name ?? id);
  if (loc?.name) presentNames.push(loc.name);
  for (const oid of loc?.objectIds ?? []) {
    const o = state.objects[oid];
    if (o && !o.archived) {
      presentNames.push(o.name);
      visibleObjects.push({ name: o.name, locked: typeof o.props.locked === "boolean" ? o.props.locked : undefined, state: o.state });
    }
  }
  const offstageNames: string[] = [];
  for (const [id, o] of Object.entries(state.roster)) {
    if (id !== "you" && o.name) {
      characterNames.push(o.name);
      if (opts.memoriesByCharacter?.[id]) characterMemoriesByName[o.name] = opts.memoriesByCharacter[id];
    }
    if (id === "you" || presentIds.has(id)) continue;
    if (o.name) offstageNames.push(o.name);
  }
  for (const [id, o] of Object.entries(state.objects)) {
    if (visibleObjectIds.has(id) || o.archived) continue;
    if (o.name) offstageNames.push(o.name);
  }
  for (const [id, location] of Object.entries(state.locations)) {
    if (id === state.currentLocationId || adjacentLocationIds.has(id)) continue;
    if (location.name) offstageNames.push(location.name);
  }
  return {
    presentNames: presentNames.filter(Boolean),
    offstageNames: offstageNames.filter(Boolean),
    lawfulDistortionMedia: lawfulDistortionMedia(opts.narrationRule),
    visibleObjects: visibleObjects.filter((object) => Boolean(object.name)),
    characterNames: [...new Set(characterNames.filter(Boolean))],
    characterMemoriesByName,
  };
}

/**
 * Build a stricter character-output guard from the same world snapshot, narrowed by
 * what this character's projection can actually support. A character may mention an
 * offstage entity only if it appears in their visible scene, own memories, or
 * triggered lore.
 */
export function projectionGuardSnapshot(state: WorldState, projection: CharacterProjection): GuardSnapshot {
  const base = guardSnapshot(state);
  const evidence = [
    projection.visibleScene,
    ...projection.memories.map((memory) => memory.text),
    ...projection.recent.map((memory) => memory.text),
    ...projection.triggeredLore.flatMap((entry) => [entry.content, ...entry.keys]),
  ].join("\n");
  const supportedNames = new Set(base.presentNames);
  for (const name of base.offstageNames) {
    if (name && evidence.includes(name)) supportedNames.add(name);
  }
  const ownEvidence = [...projection.memories, ...projection.recent];
  return {
    ...base,
    offstageNames: base.offstageNames.filter((name) => !supportedNames.has(name)),
    characterMemoriesByName: Object.fromEntries(base.characterNames.map((name) => [name, ownEvidence])),
  };
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const DISTORTION_RULE_MARKERS = ["lawful distortion", "失真", "扭曲", "变形", "不可靠"];
const DISTORTION_MEDIA_GROUPS = [
  { ruleWords: ["镜", "镜子", "镜面", "倒影"], proseWords: ["镜子", "镜面", "镜中", "镜里", "倒影"] },
  { ruleWords: ["录音", "录像", "记录", "回放"], proseWords: ["录音", "录像", "记录", "回放"] },
  { ruleWords: ["门牌"], proseWords: ["门牌"] },
  { ruleWords: ["照片", "相机", "屏幕"], proseWords: ["照片", "相机", "屏幕"] },
];

function lawfulDistortionMedia(narrationRule?: string): string[] | undefined {
  const rule = narrationRule?.trim();
  if (!rule) return undefined;
  if (!DISTORTION_RULE_MARKERS.some((marker) => rule.toLowerCase().includes(marker.toLowerCase()))) return undefined;
  const media = DISTORTION_MEDIA_GROUPS.flatMap((group) =>
    group.ruleWords.some((word) => rule.includes(word)) ? group.proseWords : [],
  );
  return media.length > 0 ? media : undefined;
}

function mentionedThroughLawfulDistortion(prose: string, name: string, snapshot: GuardSnapshot): boolean {
  const media = snapshot.lawfulDistortionMedia ?? [];
  if (!name || media.length === 0) return false;
  const mediaPattern = media.map(escapeRegex).join("|");
  const namePattern = escapeRegex(name);
  const nearby = "[^。！？!?\\n]{0,18}";
  const pattern = new RegExp(`((${mediaPattern})${nearby}${namePattern})|(${namePattern}${nearby}(${mediaPattern}))`, "i");
  return pattern.test(prose);
}

function namesNearby(prose: string, name: string, words: string[]): boolean {
  if (!name) return false;
  const pattern = new RegExp(`${escapeRegex(name)}[^。！？!?\\n]{0,12}(${words.map(escapeRegex).join("|")})`, "i");
  return pattern.test(prose);
}

function contradictionSlip(prose: string, object: VisibleObjectClaim): boolean {
  if (object.locked === true && namesNearby(prose, object.name, ["打开", "敞开", "解锁", "没锁", "没有锁", "unlocked", "open"])) {
    return true;
  }
  if (object.locked === false && namesNearby(prose, object.name, ["锁住", "锁着", "上锁", "locked"])) {
    return true;
  }
  const state = object.state ?? "";
  if (/熄灭|灭着|无光|不亮/.test(state) && namesNearby(prose, object.name, ["亮起", "发亮", "点亮", "亮着", "燃起"])) {
    return true;
  }
  const statePairs: Array<{ state: RegExp; contradiction: string[] }> = [
    { state: /空|没有|无/, contradiction: ["满", "盛满", "装满", "倒满", "斟满", "full"] },
    { state: /满|盛满|装满|倒满|斟满/, contradiction: ["空", "没有", "无", "empty"] },
    { state: /破|碎|裂|坏|损毁/, contradiction: ["完好", "完整", "无损", "崭新", "intact"] },
    { state: /完好|完整|无损|崭新/, contradiction: ["破", "碎", "裂", "坏", "损毁", "broken"] },
    { state: /湿|潮|淋湿/, contradiction: ["干", "干燥", "dry"] },
    { state: /干|干燥/, contradiction: ["湿", "潮", "淋湿", "wet"] },
    { state: /关着|关闭|合上/, contradiction: ["打开", "敞开", "open"] },
    { state: /开着|打开|敞开/, contradiction: ["关着", "关闭", "合上", "closed"] },
  ];
  if (statePairs.some((pair) => pair.state.test(state) && namesNearby(prose, object.name, pair.contradiction))) {
    return true;
  }
  return false;
}

const INNER_KNOWLEDGE_VERBS = ["知道", "意识到", "明白", "想起", "记得", "决定", "相信", "怀疑", "心想", "心里"];

function innerKnowledgeClaim(prose: string, name: string): string | null {
  if (!name) return null;
  const pattern = new RegExp(`${escapeRegex(name)}[^。！？!?\\n]{0,12}(${INNER_KNOWLEDGE_VERBS.map(escapeRegex).join("|")})([^。！？!?\\n]{0,32})`, "i");
  const match = prose.match(pattern);
  return match ? match[2].trim() : null;
}

function projectionSupportsClaim(claim: string, memories: Memory[] | undefined): boolean {
  if (!memories || memories.length === 0) return false;
  const phrases = supportPhrasesForClaim(claim);
  if (phrases.length === 0) return false;
  return memories.some((memory) => {
    const memoryVariants = [normalizeSupportText(memory.text), normalizeSupportText(memory.text, true)];
    return phrases.some((phrase) => memoryVariants.some((text) => text.includes(phrase)));
  });
}

function normalizeSupportText(text: string, dropParticles = false): string {
  const normalized = text.replace(/[\s，。！？!?；;：:、"'“”‘’（）()[\]{}<>《》….,-]/g, "");
  if (!dropParticles) return normalized;
  return normalized.replace(/[的了着在是把被会要有这那个]/g, "");
}

function stripLeadingPerspective(text: string): string {
  return text.replace(/^(你|我|他|她|它|玩家|I|you|he|she|they|we)/i, "");
}

function supportPhrasesForClaim(claim: string): string[] {
  const variants = new Set<string>();
  for (const dropParticles of [false, true]) {
    const normalized = normalizeSupportText(claim, dropParticles);
    variants.add(normalized);
    variants.add(stripLeadingPerspective(normalized));
  }
  return [...variants]
    .map((text) => text.trim())
    .filter((text) => text.length >= 2)
    .sort((a, b) => b.length - a.length);
}

function innerKnowledgeSlip(prose: string, name: string, memories?: Memory[]): boolean {
  const claim = innerKnowledgeClaim(prose, name);
  if (claim === null) return false;
  return !projectionSupportsClaim(claim, memories);
}

/**
 * Screen prose for cheap high-value slips. A slip = a known offstage name that appears
 * in the prose while not also being on stage (ambiguous names are not flagged).
 */
export function consistencyGuard(prose: string, snapshot: GuardSnapshot): GuardResult {
  const present = new Set(snapshot.presentNames);
  const slips: string[] = [];
  for (const name of snapshot.offstageNames) {
    if (!name || present.has(name)) continue; // ambiguous (also present) → don't flag
    if (mentionedThroughLawfulDistortion(prose, name, snapshot)) continue;
    if (prose.includes(name)) slips.push(name);
  }
  for (const object of snapshot.visibleObjects) {
    if (contradictionSlip(prose, object)) {
      if (mentionedThroughLawfulDistortion(prose, object.name, snapshot)) continue;
      slips.push(object.name);
    }
  }
  for (const name of snapshot.characterNames) {
    if (innerKnowledgeSlip(prose, name, snapshot.characterMemoriesByName?.[name])) slips.push(name);
  }
  return { ok: slips.length === 0, slips: [...new Set(slips)] };
}
