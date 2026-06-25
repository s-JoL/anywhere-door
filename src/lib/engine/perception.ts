/**
 * §4.2 Perception boundary — the single producer of character-facing context
 * (charter §9; architecture.md §15.5).
 *
 * Characters are real because they are *limited*: a character never reads raw world
 * state. Every character-facing context passes through `resolvePerception`, which
 * emits a `CharacterProjection` — a witness-scoped, in-world view. Out-of-world
 * channels (Director Notes, Scene Contract, cross-world taste, un-canonized God
 * edits) must NEVER appear in a projection; because that leak is silent, the resolver
 * runs a standing assertion (`assertNoOutOfWorldLeak`) as the guard the charter
 * requires.
 *
 * The projection is structured data; turning it into prompt prose (the story-locale
 * wording layer) is the renderer's job (`prompt.ts` `renderProjection`).
 */

import type { WorldSeed, WorldState, Character, Memory, LoreEntry } from "../types";
import { retrieveLore } from "../world/lore";
import { effectiveAffinity, affinityBand } from "../world/relationship";
import { scoreMemories } from "../memory/retrieve";
import { keywordsOf } from "../memory/keywords";

/** Director-set attention (§4.3). A hint, never a fact — points the lens, doesn't add truth. */
export interface SalienceHint {
  entityId: string;
  note: string;
}

/** Everything — and ONLY — a character may know going into its turn. */
export interface CharacterProjection {
  self: Character;
  // selfFacts: the character's own hard facts + authoring
  identity?: Character["identity"];
  description: string;
  systemPrompt?: string;
  goal?: string;
  postHistoryInstructions?: string;
  // perceived world
  visibleScene: string;
  // witness-scoped memory (own observations only)
  memories: Memory[];
  recent: Memory[];
  // social: dispositions toward present targets (felt as attitude, not raw numbers)
  stance: { name: string; phrase: string }[];
  // canon activated by on-stage keys
  triggeredLore: LoreEntry[];
  // Director attention (§4.3) — not yet populated; never a fact when it is
  salience?: SalienceHint[];
}

export interface PerceptionCtx {
  seed: WorldSeed;
  state: WorldState;
  /** All of the character's own memory records, to be scored against `query`. */
  ownMemories?: Memory[];
  /** Retrieval query (the player input this turn). */
  query?: string;
  /** Precomputed scored memories — if given, scoring is skipped (renderer compat path). */
  memories?: Memory[];
  /** Precomputed recent observations — if given, the slice is skipped. */
  recent?: Memory[];
}

/**
 * Out-of-world channels that must never cross into a character projection (charter §9).
 * The guard checks structural keys; content-level leakage (e.g. a memory text that
 * quotes a director note) is a separate concern policed upstream.
 */
const OUT_OF_WORLD_KEYS = [
  "directorNote",
  "directorNotes",
  "sceneContract",
  "taste",
  "tasteVector",
  "crossWorldTaste",
  "godEdit",
  "godEdits",
] as const;

/**
 * Standing assertion (dev-mode): throw if any out-of-world key appears on a
 * projection. The charter (§9) requires this because the perception-boundary leak is
 * otherwise silent.
 */
export function assertNoOutOfWorldLeak(projection: CharacterProjection): void {
  if (process.env.NODE_ENV === "production") return;
  const obj = projection as unknown as Record<string, unknown>;
  for (const key of OUT_OF_WORLD_KEYS) {
    if (key in obj) {
      throw new Error(
        `[perception] 越界:角色投影中出现 out-of-world 字段「${key}」——感知边界被破坏(charter §9)`,
      );
    }
  }
}

/** The character's **subjective** view of the current scene (no one else's mind/secrets). */
export function visibleScene(state: WorldState, self: Character, charById?: Map<string, Character>): string {
  const loc = state.locations[state.currentLocationId];
  const others = loc.presentCharacterIds
    .filter((id) => id !== self.id)
    .map((id) => {
      const name = state.roster[id]?.name ?? id;
      const gender = charById?.get(id)?.identity?.gender; // let the speaker know others' gender, to avoid pronoun drift
      const cond = state.roster[id]?.condition;
      const tags = [gender, cond].filter(Boolean).join("，");
      return tags ? `${name}（${tags}）` : name;
    })
    .join("、");
  const objs = loc.objectIds
    .map((id) => {
      const o = state.objects[id];
      if (!o) return null;
      return o.state ? `${o.name}（${o.state}）` : o.name;
    })
    .filter(Boolean)
    .join("、");
  const playerCondition = state.roster["you"]?.condition;
  return [
    `地点：${loc.name}——${loc.description ?? loc.gist}`,
    `时间：第${state.time.day}天 ${state.time.clock}，${state.time.lighting}`,
    others ? `在场：${others}` : "",
    objs ? `可见物：${objs}` : "",
    playerCondition ? `你此刻：${playerCondition}` : "",
  ].filter(Boolean).join("\n");
}

/** Dispositions toward currently-present targets only (absent targets are not perceived). */
function resolveStance(state: WorldState, character: Character): { name: string; phrase: string }[] {
  const myRelations = state.relationships?.[character.id];
  if (!myRelations) return [];
  const loc = state.locations[state.currentLocationId];
  const presentIds = new Set([...(loc?.presentCharacterIds ?? []), "you"]);
  const out: { name: string; phrase: string }[] = [];
  for (const [toId, rel] of Object.entries(myRelations)) {
    if (!presentIds.has(toId)) continue;
    const name = toId === "you" ? "你（玩家）" : (state.roster[toId]?.name ?? toId);
    const phrase = rel.disposition ?? affinityBand(effectiveAffinity(rel, state.time.day));
    out.push({ name, phrase });
  }
  return out;
}

/**
 * The ONLY producer of character-facing context. Builds a witness-scoped projection
 * from world state; if `ownMemories`+`query` are given it scores them (top-6) and
 * takes the last 8 as recent — the retrieval that previously lived inline in
 * `runTurn`. Precomputed `memories`/`recent` (renderer compat) override scoring.
 */
export function resolvePerception(ctx: PerceptionCtx, character: Character): CharacterProjection {
  const { seed, state } = ctx;

  const memories = ctx.memories ?? (ctx.ownMemories ? scoreMemories(ctx.ownMemories, keywordsOf(ctx.query ?? ""), { topK: 6 }) : []);
  const recent = ctx.recent ?? (ctx.ownMemories ? ctx.ownMemories.slice(-8) : []);

  // Hard facts of others present (for correct reference: he/she) — seed characters ∪ instance-created characters
  const charById = new Map<string, Character>();
  for (const c of seed.characters) charById.set(c.id, c);
  for (const [id, c] of Object.entries(state.characters ?? {})) charById.set(id, c);
  const visible = visibleScene(state, character, charById);

  const stance = resolveStance(state, character);

  // Lorebook: surface canon whose keys are on-stage (scene + own memory) for consistency.
  const loreHaystack = [visible, ...recent.map((m) => m.text), ...memories.map((m) => m.text)].join("\n");
  const triggeredLore = retrieveLore(loreHaystack, state.lore);

  const projection: CharacterProjection = {
    self: character,
    identity: character.identity,
    description: character.description,
    systemPrompt: character.systemPrompt,
    goal: character.goal,
    postHistoryInstructions: character.postHistoryInstructions,
    visibleScene: visible,
    memories,
    recent,
    stance,
    triggeredLore,
  };

  assertNoOutOfWorldLeak(projection);
  return projection;
}
