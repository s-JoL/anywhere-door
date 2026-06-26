import type { DeltaLogEntry } from "./world/delta";

export type ProviderId = "openrouter" | "deepseek";

export interface ModelConfig {
  provider: ProviderId;
  apiKey: string;       // empty = fall back to .env (openrouter only)
  model: string;
  reasoningEnabled: boolean;
}

export type ChatMessageRole = "system" | "user" | "assistant";
export interface ChatMessage { role: ChatMessageRole; content: string }

export interface Identity { gender?: string; age?: string; body?: string; hardFacts?: string }

export interface Character {
  id: string;
  name: string;
  description: string;   // setup (includes personality)
  detail?: "stub" | "fleshed";  // character grown on demand within an instance: stub = to be fleshed out, fleshed = complete (seed characters count as fleshed)
  identity?: Identity;   // immutable hard facts
  goal?: string;         // current goal (injected by God into the subjective prompt)
  systemPrompt?: string;             // character override system prefix (supports {{original}})
  postHistoryInstructions?: string;  // character override trailing post-history reinforcement (supports {{original}})
  /** Exit archival (§5.7): when true, removed from the present roster, but the record is never deleted. */
  archived?: boolean;
}

/** Immutable: the world's "laws of physics", read-only after creation. */
export interface WorldRules {
  physics: string;       // what is possible / impossible
  setting: string;       // era / place / genre constants
  redLines: string[];    // red lines (platform baseline + creator additions)
  narrationRule?: string; // how committed truth is rendered as prose; rules-level lawful distortion lives here
}

export interface Location {
  id: string;
  name: string;
  detail: "stub" | "fleshed";
  gist: string;
  description?: string;
  connections: string[];
  presentCharacterIds: string[];
  objectIds: string[];
}

export interface WorldObject {
  id: string;
  name: string;
  detail: "stub" | "fleshed";
  props: { portable?: boolean; locked?: boolean; owner?: string; gates?: string; [k: string]: unknown };
  locationId: string;
  state?: string;
  /** Exit archival (§5.7): when true, removed from present/visible, but the record is never deleted. */
  archived?: boolean;
}

/** A character's objective-fact projection (secrets / inner life are not here). */
export interface CharObjective { name: string; condition?: string }

/** A world-setting / lorebook entry: inject `content` when `keys` hit the text (permanent canon grown on demand). */
export interface LoreEntry { id: string; keys: string[]; content: string }

/**
 * A directed social relationship (CK-style affinity ledger):
 * `affinity` is the affinity value anchored on the `sinceDay` day (decays toward 0 by elapsed days when read);
 * `evidence` records "on what grounds" (the most recent few reasons); `disposition` is an optional human-readable attitude phrase.
 */
export interface Relationship {
  affinity: number;       // signed affinity, clamped [-100, 100], 0 = neutral
  disposition?: string;   // optional phrase, e.g. "holding a grudge" / "guard loosening"
  evidence: string[];     // on what grounds: the most recent reasons (capped)
  sinceDay: number;       // world day the affinity is anchored to (for decay toward 0)
}

/** Mutable, grown on demand. */
export interface WorldState {
  currentLocationId: string;
  time: { day: number; clock: string; lighting: string };
  locations: Record<string, Location>;
  objects: Record<string, WorldObject>;
  roster: Record<string, CharObjective>;
  /** Instance-private characters grown on demand (the seed is frozen and shared; new characters are never written back to the seed). */
  characters?: Record<string, Character>;
  flags: Record<string, string | number | boolean>;
  tension?: number;
  relationships?: Record<string, Record<string, Relationship>>;
  /** Lorebook / canon: permanent world settings triggered by keywords, can be grown on demand via establishLore. */
  lore?: LoreEntry[];
  /** Structured pressure lines / suspense threads (§4.6). Read by the Director; advanced only via thread delta (through the WriteGate). */
  pressureLines?: PressureLine[];
  /** Hardness-graded facts (§5.1 canon hardness). Written only via setFact (through the WriteGate). */
  facts?: Fact[];
}

/**
 * Three tiers of canon hardness (§5.1):
 * ambient (can be rewritten by any more-credible source) · anchored (the Reactor/characters cannot overturn it,
 * only a god edit can change it) · core (world bedrock, only a god edit can change it).
 * A fact is promoted only when it **needs to persist, needs validation, or affects future behavior**; it stays ambient by default.
 */
export type Hardness = "ambient" | "anchored" | "core";

/**
 * A graded fact (§5.1). Unique by (entityId, field): it is "the truth right now" for that dimension.
 * Contradiction = same (entityId, field) with a different value; a harder fact cannot be overturned by a softer source.
 */
export interface Fact {
  id: string;
  entityId?: string;   // who/what the fact is about (omitted means a world-level fact)
  field: string;       // dimension, e.g. "location" / "hidden" / "alive"
  value: string;       // the asserted value
  hardness: Hardness;
  sinceDay?: number;   // world day the fact was established / last rewritten
  /** Whether this truth is safe to surface to the player in narration/settlement. */
  playerKnown?: boolean;
}

/** Pressure-line status: latent / active / resolved. */
export type ThreadStatus = "latent" | "active" | "resolved";

/**
 * A structured pressure line (§4.6 / architecture §5 pressure lines). Upgrades "tension" from a single scalar
 * into a nameable, advanceable, resolvable suspense thread. `summary` is player-visible safe wording; intensity
 * is for Director ordering. Phase 0 is scaffolding only: the fields and thread delta are in place; three-tier
 * offstage advancement lands in Phase 1.
 */
export interface PressureLine {
  id: string;
  summary: string;
  status: ThreadStatus;
  intensity: number;             // 0–10
  relatedCharacterIds?: string[];
  relatedLocationIds?: string[];
  updatedDay?: number;           // world day of the most recent advancement
  /** Thread category (e.g. debt / secret / threat), for Director classification and ordering. */
  kind?: string;
  /** Whether the player already knows (§5.2 fairness: an unknown thread must not escalate to a strong consequence). */
  playerKnown?: boolean;
  /** The next "sign" the player should see (diegetic hint, not a bare number). */
  nextSign?: string;
}

export interface WorldPresentation {
  genre: string;                                // primary-genre chip
  mood: string[];                               // 2–3 tone chips
  intensity: "calm" | "charged" | "explicit";  // intensity
  hook: string;                                 // cold open: 1–3 sentences, second person, ends on a cliffhanger
  entryAction: string;                          // feed CTA: a short first in-world move / recommended opening line
  cast: { name: string; line: string }[];       // one line per character: name + a hint of suspense
  accent?: string;                              // accent color (hex/rgb/var), themed card
}

export interface PrebakedTasteBeat {
  kind: "narration" | "speaker";
  speakerId?: string | null;
  content: string;
}

export interface PrebakedTaste {
  userAction: string;
  beats: PrebakedTasteBeat[];
}

/** A frozen, shared starting point identical for everyone. */
export interface WorldSeed {
  id: string;
  title: string;
  worldview: string;
  rules: WorldRules;
  openingState: WorldState;
  characters: Character[];
  modelConfig: ModelConfig;
  createdAt?: number;
  source?: "builtin" | "imported" | "created" | "generated";
  presentation?: WorldPresentation;
  /** Keyless on-ramp: a short scripted taste, never a fake reactive loop. */
  prebakedTaste?: PrebakedTaste;
}

export type InputChannel = "speak" | "act" | "observe" | "director-note" | "scene-contract" | "god-edit";

export interface DirectorNote {
  id: string;
  text: string;
  createdAt: number;
}

export interface SceneContract {
  id: string;
  text: string;
  createdAt: number;
}

export interface TurnSnapshot {
  input: string;
  inputChannel?: InputChannel;
  state: WorldState;
  activeBranchId?: string;
  messageIds: string[];
  memoryIds: string[];
  deltaLogIds: string[];
  previousSnapshot?: TurnSnapshot;
  turn?: number;
  lastSeenAt?: number;
  returnEchoedForLastSeenAt?: number;
  settlement?: SettlementRecord;
  createdAt: number;
}

/** The player's private fork. */
export interface WorldInstance {
  id: string;
  seedId: string;
  state: WorldState;
  createdAt: number;
  updatedAt: number;
  /** Current private timeline branch. Durable writes inherit this id for audit/fork isolation. */
  activeBranchId?: string;
  lastTurnSnapshot?: TurnSnapshot;
  turn?: number; // number of turns taken (event-log attribution)
  lastSeenAt?: number; // real-time timestamp of the player's last interaction (Date.now), used by offstage evolution to compute "how long they've been away"
  /** The last `lastSeenAt` value that already produced a return-open beat, preventing duplicate echoes on page open + first action. */
  returnEchoedForLastSeenAt?: number;
  pinned?: boolean; // the player tucked this door into "my doorway" (Doorway Library)
  /** Exit-settlement record (§5.6): derived on exit, for doorway display and the return echo. */
  settlement?: SettlementRecord;
  /** Out-of-world steering notes. Never part of WorldState and never fed through character perception. */
  directorNotes?: DirectorNote[];
  /** Current scene-level out-of-world contract. Never part of WorldState or character perception. */
  sceneContract?: SceneContract;
}

/**
 * Exit settlement (§5.6): a bounded distillation of the world state when the player leaves.
 * - `trace`: things that have happened and hold up (anchored+ facts / player-caused changes), in player-safe wording.
 * - `unresolved`: things still hanging (active pressure-line summaries).
 * - `candidates`: **possible** openings (hooks for the return) — note these are candidates, **not** committed facts.
 * - `bond`: a change in someone's attitude toward the player (the return echo is not just about the world, but also about relationships).
 */
export interface SettlementRecord {
  trace: string[];
  unresolved: string[];
  candidates: string[];
  bond?: { who: string; stance: string };
  atDay: number;
}

export interface Message {
  id: string;
  instanceId: string;
  role: ChatMessageRole;
  speakerId: string | null;  // = characterId when role is assistant
  content: string;
  createdAt: number;
  narration?: boolean;
  /** Soft-hidden from the active timeline view; retained for append-only audit/history. */
  archived?: boolean;
}

/** Per-character subjective memory (borrowing Generative Agents' ConceptNode). */
/**
 * The provenance category of a memory (§4.5 / architecture §5.4 subjective records). Determines credibility and propagation rules:
 * witnessed (firsthand seen) · heard (hearsay) · inferred (inference/reflection) · remembered (recall) ·
 * revealed (disclosed) · canonized (already hardened into canon) · authored (author-injected).
 */
export type Provenance =
  | "witnessed"
  | "heard"
  | "inferred"
  | "remembered"
  | "revealed"
  | "canonized"
  | "authored";

/** Perception quality: full / partial (saw only part) / garbled (distorted, fuzzy) (§5.4's "saw only a part" / "misremembered"). */
export type PerceptionQuality = "full" | "partial" | "garbled";

export interface Memory {
  id: string;
  instanceId: string;
  charId: string;
  kind: "observation" | "reflection" | "hearsay";
  text: string;
  keywords: string[];     // extracted at write time, for keyword-relevance approximation
  importance: number;     // 1–10
  createdAt: number;
  lastAccessed: number;
  /** List of source-memory ids for a reflection memory (set only for kind:"reflection"). */
  evidence?: string[];
  // ——— §4.5 subjective-record fields (all optional; default semantics = witnessed / full confidence / full) ———
  /** Provenance category; defaults to "witnessed". */
  provenance?: Provenance;
  /** Subjective confidence 0–1; defaults to 1. Low confidence surfaces more weakly in retrieval. */
  confidence?: number;
  /** A subjective reading layered on top of the raw fact (§5.4 "misunderstanding"). */
  interpretation?: string;
  /** Perception quality; defaults to "full". */
  perceptionQuality?: PerceptionQuality;
  /** How the record deviates from the truth (rule distortion / misremembering). */
  distortion?: string;
  /** The change-log entry ids this memory is based on (→ deltaLog), for tracing evidence in the belief graph. */
  evidenceLinks?: string[];
  /** The world-branch id that produced this memory (for branch/regeneration isolation). */
  branchId?: string;
  /** Soft-hidden from the active timeline view; retained for append-only audit/history. */
  archived?: boolean;
}

export interface TimelineBranchSnapshot {
  state: WorldState;
  activeBranchId?: string;
  messages: Message[];
  memories: Memory[];
  deltaLog: DeltaLogEntry[];
  lastTurnSnapshot?: TurnSnapshot;
  turn?: number;
  lastSeenAt?: number;
  returnEchoedForLastSeenAt?: number;
  settlement?: SettlementRecord;
  directorNotes?: DirectorNote[];
  sceneContract?: SceneContract;
}

export interface TimelineBranch {
  id: string;
  instanceId: string;
  seedId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  forkedFromTurn?: number;
  snapshot: TimelineBranchSnapshot;
}

/**
 * Local taste/funnel event categories. The first four feed recommendation ranking; the rest are local funnel stages/signals (§5.9):
 * card-dwell → open-door → first-action → ten-minute-retain → first-consequence
 * → return → pin, plus the keyless cliff signal prebaked-taste → key-add → first-action.
 * first-consequence fires when the player causes their first anchored fact.
 * Local-first throughout, never sent to a server, never reaches characters.
 */
export type TasteEventKind =
  | "enter" | "dwell" | "author" | "skip"
  | "card-dwell" | "open-door" | "first-action" | "ten-minute-retain"
  | "first-consequence" | "return" | "pin"
  | "prebaked-taste" | "key-add";
export interface TasteEvent { id: string; kind: TasteEventKind; seedId: string; tags: string[]; at: number; }
