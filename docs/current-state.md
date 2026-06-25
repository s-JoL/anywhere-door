# Anywhere Door — Current State

> **Status: NON-AUTHORITATIVE.** This is a factual snapshot of what the code does
> **today**, and the only document allowed to name code symbols and file paths.
> It is *not* a design document: where it disagrees with `AGENTS.md`,
> `first-principles.md`, `product-design.md`, or `architecture.md`, the design
> wins and the code is what must change. Keep this honest — do not describe
> roadmap intentions here as if they exist. The path from here to the design is in
> `roadmap.md`.

## 1. Stack

Next.js 15 (App Router) · React 19 · TypeScript strict · Tailwind CSS 4 ·
Dexie/IndexedDB · Vitest. Runtime dependencies are minimal (`next`, `react`,
`react-dom`, `dexie`). Checks: `npm test`, `npm run build`, `npm run typecheck`.
About 10k lines under `src/`, with unit tests alongside each subsystem.

## 2. Shape today

A mobile-first, pure-web app:

- A vertical, TikTok-style door feed (`src/app/page.tsx`), one cold-open world
  card per screen, with an open-door transition (`src/app/DoorTransition.tsx`)
  into the play route (`src/app/play/page.tsx`).
- In play, the user types; present characters and a Director/God layer respond in
  streamed prose.
- The feed is driven by a taste engine; worlds are model-generated with deliberate
  diversity.
- Persistent instances/history exist in storage; there is **no** Doorway Library
  UI yet.
- **Bilingual foundation built; zh is the live deployment.** A build-time locale
  constant (`NEXT_PUBLIC_LOCALE`, `src/lib/i18n/locale.ts`) selects the deployment
  language; `src/app/layout.tsx` sets `<html lang>` from it. UI strings are
  extracted into a typed catalog (`src/lib/i18n/messages/{zh,en}.ts` + `t()`), zh
  as source of truth and en authored natively. `globals.css` now carries a token
  layer (type scale, spacing, `--accent`) and splits a world-agnostic chrome
  background (`.app-bg`) from the per-world accent-tinted Play background
  (`.world-bg`); fonts switch CJK→Latin under `:lang(en)`. Both `zh` and
  `NEXT_PUBLIC_LOCALE=en` builds pass. **Not yet done:** the en **world/seed
  content pool** (zh first) and the **language-facing prompt** wording (engine
  prompts in `src/lib/engine/prompt.ts`, `world/generate.ts` are still Chinese) —
  both deferred per the "zh first" decision.

## 3. The turn loop (`src/lib/engine/turn.ts`)

`runTurn` is the orchestrator. It runs under a per-instance operation lock
(`src/lib/engine/lock.ts`, §4.0) so one turn commits at a time; regenerate
supersedes any in-flight turn (its writes are dropped as stale). All durable world
mutation routes through the single **WriteGate** (`src/lib/engine/write-gate.ts`,
§4.1) — the sole caller of `applyDelta` + `appendDeltaLog` — which validates,
applies in order, logs with attribution, and records rejections. One turn:

1. **Offstage evolution.** On return, `evolveWhileAway`
   (`src/lib/world/offscreen.ts`) triggers only after an absence (`Date.now() -
   lastSeenAt`, ≥ 1h). The LLM proposes calm plausible changes (characters move,
   time passes, object states, relationships fade), committed through the same
   gate path. Reconciliation is bounded by three precision tiers (§5.5): only
   `near`/`related` entities may evolve; `far` ones are frozen.
2. **Casting (§4.3).** `castTurn` (`director.ts`) splits the present cast into
   `active` (hard cap `maxActiveAgents`, run as agents) and `ambient` (no agent
   loop) — "a bustling market is not thirty agents."
3. **Active agents (§4.4).** `runActiveAgents` (`agent-runtime.ts`) runs only the
   active cast: each decides in parallel whether to speak (speak/pass + eagerness,
   `intent.ts`/`select.ts`), then selected characters stream speech. Context passes
   the single perception boundary (§4.2): `resolvePerception` (`perception.ts`) is
   the sole producer of a witness-scoped `CharacterProjection` (scene, own memory —
   retrieval lives here now — stance toward present targets, triggered lore), with a
   standing assertion that no out-of-world field leaks in; `renderProjection`
   (`prompt.ts`) is the thin prose renderer. Agents emit prose only; they never
   mutate state.
4. **Director.** Updates a tension scalar and inserts narration when tension rises
   sharply (`≥ 1.5`) or is already high (`≥ 7`) and still climbing; surfacing of an
   offstage character is a Director decision (`decideSurfacing`, §4.3) —
   world-consistent, never through the player's door (`director.ts`, `introduce.ts`).
5. **World Reactor.** The LLM reads what happened this turn (prompt carries
   physics + red lines as soft constraints; evidence-first) and proposes
   `Delta[]`; the WriteGate `validateDelta`'s each (structural/spatial + red-line
   keyword screen + no-op discard) → `applyDelta` (immutable) → logs it
   (`src/lib/engine/reactor.ts`, `write-gate.ts`, `src/lib/world/delta.ts`). The
   `setRelationship`-reason→memory side effect runs as a post-commit hook.
6. **Memory.** Each character writes what it witnessed as observations, with
   periodic reflection (`src/lib/memory/`). Memories carry provenance/confidence
   (§4.5): observations are `witnessed`/full/confident, hearsay is `heard`/partial
   and less confident, reflections are `inferred`; `scoreMemories` multiplies by
   confidence so low-confidence records surface less forcefully. Fields are additive
   (legacy memories default to witnessed/full).

The model never writes the world directly — it proposes, the engine validates.
Illegal changes (e.g. moving to a nonexistent room) are dropped.

**Perception.** Characters never read raw `WorldState`; they receive a subjective
projection (`buildCharacterPrompt`/`visibleScene` in `prompt.ts`): worldview +
immutable rules, own profile/goals/hard facts, what's visible now (location,
time, present others' outward state, visible objects, the player's outward
state), what they remember (own witnessed observations + reflections, ranked by
`relevance × importance × recency`), their current stance toward present others,
and lore triggered by present text. Observations are witness-scoped
(`src/lib/memory/observe.ts`) — not present, not informed. **This is the de-facto
perception boundary, but it is not yet a single isolated module**: context
assembly is spread across `prompt.ts` and the turn loop.

**Regenerate.** `regenerateLastTurn` records pre-turn state plus message/memory
high-water marks, deletes the last turn's messages/memories, restores state, and
reruns the same input — so a regenerate does not leak old-branch state.

## 4. World model

- **`WorldRules`** (immutable): `physics` / `setting` / `redLines`. Red lines are
  enforced two ways: as a soft constraint injected into the Reactor's system
  prompt, and as a conservative keyword substring screen in `validateDelta`.
  There is **no** `narration` rule and **no** `ruleSkills` field.
- **`WorldState`** (mutable): `currentLocationId`, `time`, `locations`, `objects`,
  `roster` (incl. the player `you`'s `condition`), `flags`, `tension`,
  `relationships` (a signed affinity ledger with decaying evidence), `lore`, and
  `pressureLines` (§4.6 — structured threads: id/summary/status/intensity, advanced
  only via thread deltas through the gate). There is **no** `facts`, `beliefs`, or
  `timeline` structure yet; the three-tier offstage precision is still Phase 1.
- **Relationships** (`src/lib/world/relationship.ts`):
  `{ affinity, disposition?, evidence[], sinceDay }` — affinity is a signed number
  clamped to [-100, 100], decaying linearly toward 0 over game-days while keeping
  its reasons. `setRelationship` is adjustment-style (`affinityDelta` + `reason` +
  optional `disposition`). Characters see attitude phrases, not raw numbers.
  Object ownership feeds the ledger (taking another's object distances the owner).
  Affinity feeds eagerness back into speaker selection. Gossip
  (`src/lib/memory/gossip.ts`) spreads one-hop, degraded, de-duplicated hearsay
  among co-present characters.
- **`Delta` (14 kinds)** — `Delta` is the code name for what the design docs call
  a "typed change" (`architecture.md` §5.2): `moveCharacter`, `setObjectState`, `setFlag`,
  `advanceTime`, `setCondition`, `establishObject`, `establishLocation`,
  `moveScene`, `setRelationship`, `establishLore`, `establishCharacter`,
  `moveObject`, `setObjectLocked`, `fleshLocation`. `establish*` grows the world
  on demand (including **instance-private characters via `establishCharacter`**).
  `fleshLocation` is engine-triggered, not in the Reactor's vocabulary. There are
  **no** mind/thread/fact deltas (`setBelief`, `setSecret`, `setGoal`,
  `setPressureLine`, `setFact`, `forkTimeline`, `retireEntity`, `fleshObject`,
  `fleshCharacter`).
- **On-demand fleshing (`stub → fleshed`)**: locations/objects/characters default
  to `detail: "stub"`. Wired **only for locations**: first entry into a stub
  location calls `src/lib/world/flesh.ts` to generate an on-the-spot description
  and emit `fleshLocation`. Object/character fleshing is not wired.
- **Physical causality**: `moveObject` relocates items (with `props.portable ===
  false` immovable); locked doors block movement (`props.gates` + `props.locked`,
  toggled by `setObjectLocked`), enforced in `validateDelta`. Visible-object lists
  follow object location, so movement and (un)locking really change what each
  character sees.
- Types in `src/lib/types.ts`; validation/apply in `src/lib/world/delta.ts`.

## 5. Subsystems

| Subsystem | Today | Code |
|---|---|---|
| Director/God engine | self-deciding speakers (parallel intent + selection), subjective memory + reflection, Director (tension / narration / character introduction) | `src/lib/engine/` |
| World Reactor | LLM proposes deltas → validate (structural/spatial + red-line screen) → commit; physics + red lines as soft constraint | `engine/reactor.ts`, `world/delta.ts` |
| Subjective memory | witness-scoped observation; retrieval by recency × relevance × importance; periodic reflection | `src/lib/memory/` |
| Taste engine | behavior signals (enter/dwell/author/skip, decayed) → taste model → ranking (exploit × ε-explore × MMR × anti-fatigue) | `src/lib/taste/` |
| World generator | conditioned generation of complete playable seeds; cross-genre cold-start spread; background pre-generation pool | `world/generate.ts`, `world/pregenerate.ts` |
| Lorebook | keyword-triggered canon injection + recursive cascade activation under a budget; `establishLore` | `world/lore.ts` |
| Presentation | cold-open world cards (genre/mood/intensity/hook/cast/accent); typewriter reveal; door transition; regenerate | `src/app/page.tsx`, `play/page.tsx`, `DoorTransition.tsx`, `world/presentation.ts` |
| Authoring / import | creator world form; SillyTavern V2 character-card (PNG tEXt) import | `src/app/create/`, `world/author.ts`, `import/` |

## 6. LLM / BYO-key

A thin proxy (`src/app/api/llm/chat/route.ts`), OpenAI-compatible (OpenRouter /
DeepSeek), SSE streaming. Key resolution (`src/lib/llm/resolve-key.ts`): the user
supplies a key in `/settings` (local `localStorage`); **production is strictly
BYO-key**, with an env fallback only in dev. There is **no built-in cold-start
world pool that plays without a key** — keyless visitors cannot currently play.

## 7. Storage

Local-first, IndexedDB via Dexie (`anywhere-door`, v5): instances / messages /
memories / seeds / tasteEvents / `deltaLog`. Repository interfaces isolate access
(`src/lib/storage/`); tests use fake-indexeddb. No server database.

Hybrid record: the snapshot (`instance.state`) is the fast current state; the
event log (`deltaLog`, `DeltaLogEntry = { turn, source, cause, gameDay,
gameClock, at, delta }`) is append-only history, tagged by source
(user/reactor/flesh/offscreen) and the triggering input.

## 8. Gap to the design (the honest ledger)

What the design (docs 1–4) requires that the code does **not** yet do. Detail and
sequencing live in `roadmap.md`; this table is only the current truth.

| Design requirement | Today |
|---|---|
| Single write gate as a module | **done** (§4.1) — extracted `WriteGate` (`write-gate.ts`); sole caller of `applyDelta`/`appendDeltaLog`, records rejections |
| Per-instance operation lock | **done** (§4.0) — `lock.ts`; serializes turns, supersede drops stale writes |
| Single perception boundary as a module | **done** (§4.2) — `perception.ts` `resolvePerception` is the sole producer; out-of-world standing assertion in place. Power surfaces (Director Notes / Scene Contract / God / cross-world taste) still unbuilt |
| Director casting (active-agent cap, ambient cast) | **done** (§4.3/§4.4) — `castTurn` caps active agents + splits ambient; `runActiveAgents` runs only the active cast; `decideSurfacing` replaces the heuristic. Salience-driven active selection is Phase 1 |
| Studio instrumentation / Context Inspector | **scaffolded** (§4.7) — `trace.ts` per-turn `TraceCollector` (commits/rejections/casting/threads) + in-memory inspector channel, threaded through the gate; out-of-world, never persisted, never in a projection. No UI yet |
| Canon hardness (3 tiers) | **done** (§5.1) — `facts` on `WorldState` with `ambient/anchored/core`; `setFact` delta with gate rules: a harder fact can't be overturned by a softer source, and only `god` may write/revise `core`. Reactor parser wired; reactor prompt to mint facts lands with §5.4/§5.8 |
| Thread state (structured pressure lines) | **done** (§4.6/§5.2) — `pressureLines` with kind/playerKnown/nextSign; open/advance/resolve deltas (gate-only); fairness rule (no strong consequence while the player knows nothing); `selectActiveThreads` lets the Director pick 1–2. Three-tier offstage precision still pending |
| Belief graph (fact × observer read view) | **done** (§5.3) — `belief.ts` `beliefOf`/`assembleBeliefGraph`: pure read view over witness-scoped memory yielding knows/believes/suspects/unaware/wrong + evidence links; zero writes. Not yet wired into Director/Inspector/Atlas UI |
| Observation provenance / confidence / distortion | **done** (§4.5/§5.4) — `Memory` carries the subjective-record fields (additive), stamped by observe/gossip/reflect; confidence folded into retrieval; renderer hedges low-confidence memories and surfaces interpretation so characters act on what they *believe*. Belief graph (§5.3) reads this substrate |
| Three-tier offstage precision | **done** (§5.5) — `offstage.ts` `classifyPrecision` (near/related/far from scene proximity + thread links); `boundOffstageDeltas` freezes far entities; `evolveWhileAway` is bounded to near/related and lists the evolvable scope in its prompt. This is the shared reconcile core for the Phase 2 god-edit reconcile |
| Narration as transduction + cheap guard | **partial** (§5.8) — `guard.ts` `consistencyGuard` screens ambient narration for cheap high-value slips (names an offstage entity) and the turn drops a slipping beat (trace-noted). Full prose-from-snapshot transduction + lawful-distortion seed rule still pending |
| Agentic Director / rule-skills | none; Director is prompt-only, no deterministic computation |
| God-edit witness-scoped reconcile | no God/Studio edit path |
| Out-of-world control channels (Director Notes, Scene Contract, God) | not implemented |
| Doorway Library UI + exit settlement + echoes | **engine done** (§5.6) — `settlement.ts` `deriveSettlement` (trace from anchored+ facts, unresolved threads, candidate hooks, bond beat) stored on the instance each turn; `composeReturnEcho` emits a return-open beat on re-entry after time away. Library page exists (`listInstances` + pin); surfacing the settlement in the Library card UI is the remaining piece |
| Funnel metrics (return-rate) | `TasteEvent` is `enter/dwell/author/skip` for ranking only; no funnel |
| Built-in cold-start pool with a keyless pre-baked taste | none; play requires a key, and there is no baked cold-open/sample beat for keyless browsing |
| Object/character on-demand fleshing | **done** (§5.7) — `fleshObject`/`fleshCharacter` deltas promote a stub to fleshed; `retireEntity` archives (presence flag, never deletes). Reactor parser wired; LLM flesh-producers for objects/characters still to author |
| Timeline forks (beyond regenerate-last-turn) | only `regenerateLastTurn` exists |
| Bilingual (zh/en) as two single-language deployments | foundation built — `NEXT_PUBLIC_LOCALE` build constant, typed UI catalog + `t()`, en UI authored, `<html lang>` from build, locale-aware fonts, accent-themed chrome; both builds pass. Remaining: en world/seed content pool + language-facing prompt extraction (zh first) |

Every implemented durable change already rides `propose → validate → apply → log`,
and no second runtime exists — so the gaps above are additive work on the existing
gate, sequenced in `roadmap.md`.
