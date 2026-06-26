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
  card per screen, with a world-specific first-action CTA (`presentation.entryAction`)
  and an open-door transition (`src/app/DoorTransition.tsx`) into the play route
  (`src/app/play/page.tsx`).
- In reactive play, the user types; present characters and a Director/God layer
  respond in streamed prose. Without a user-supplied key, built-in worlds show a
  short scripted `prebakedTaste` sample instead of calling the model. This
  scripted path is allowed only for seeds explicitly marked `source: "builtin"`;
  in the production UI, source-less/custom/generated seeds require a current
  user key for live play. The dev-only env fallback remains only a local proxy
  test path, not a keyless product path.
- Play exposes Say / Do / Observe as the default in-world input channels. Say is
  stored as character-perceivable speech; Do / Observe keep their full text for
  Director/Reactor adjudication but write only observer-safe text into character
  memory, so a private action such as hiding something does not automatically
  teach every NPC the exact concealed detail. A Studio panel reveals Director
  Note / Scene Contract / God Edit plus a compact
  Context Inspector. Director Note and Scene Contract are stored outside
  `WorldState` and skipped by character memory, Reactor, and character-facing
  prompts, and they stay out of the main transcript. They steer Director
  casting/narration only as out-of-world control state. God Edit accepts
  structured delta JSON, commits it through the WriteGate with `god` provenance,
  appends witness-scoped correction memories when it rewrites an existing fact,
  character condition, or relationship stance, and rolls back to the pre-edit
  waterline if a later persistence step fails.
- The feed is driven by a taste engine; worlds are model-generated with deliberate
  diversity only after the user supplies a model key. Keyless browsing stays on
  the eight-door built-in cold-start pool.
- Opened instances appear in a Doorway Library UI with pinning, return funnel
  events, and one-line settlement hooks.
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
   `near`/`related` entities may evolve; `far` ones are frozen. Unknown pressure
   lines cannot advance offstage unless the same proposal carries a player-facing
   `nextSign`, preventing a hidden thread from hardening without a diegetic sign.
   The committed offscreen deltas are then fed into return settlement, so local
   entity changes that actually pass the WriteGate can surface as compact
   return-open signs. The Play page also sends a locked read-only presence touch
   while the page remains visible, so an in-page pause does not masquerade as
   time away; returning from a hidden tab beyond the return threshold still runs
   reconciliation before touching `lastSeenAt`.
2. **Casting (§4.3).** `castTurn` (`director.ts`) splits the present cast into
   `active` (hard cap `maxActiveAgents`, run as agents) and `ambient` (no agent
   loop) — "a bustling market is not thirty agents." Active pressure-line
   relevance gets first claim on the budget; Director Note / Scene Contract
   exact character-name hits, control-text overlap with each character's own
   memories, current input overlap with those memories, belief-graph edges
   (especially wrong beliefs about hard facts), and relationship heat are
   additional salience signals.
3. **Active agents (§4.4).** `runActiveAgents` (`agent-runtime.ts`) runs only the
   active cast: each decides in parallel whether to speak / pass / avoid, with an
   eagerness score (`intent.ts`/`select.ts`). Selected speakers stream speech;
   an avoid intent can render as a short visible social-withdrawal narration
   instead of being forced into dialogue, including mixed turns where one
   character speaks while another visibly withdraws. Intent
   judgment now receives both the recent tail and input-relevant memories from
   that character's own store, so old but relevant witnessed consequences can
   affect whether a character wants to take the floor; a conservative memory
   salience boost also helps the relevant witness break a pass-only lull before
   a merely earlier scene-order character. If a forced lull-break line is rejected
   by the projection guard, the loop retries the next-best pass candidate; if
   every forced candidate is rejected, it emits a neutral, projection-safe
   hesitation beat instead of leaving the turn fully empty. Context passes the
   single perception boundary (§4.2): `resolvePerception` (`perception.ts`) is
   the sole producer of a witness-scoped `CharacterProjection` (scene, own memory —
   retrieval lives here now — stance toward present targets, triggered lore), with
   a standing assertion that no out-of-world field leaks in; `renderProjection`
   (`prompt.ts`) is the thin prose renderer. Agents emit prose only; they never
   mutate state.
4. **Director.** Proposes a `setTension` typed change through the WriteGate and
   inserts narration when tension rises sharply (`≥ 1.5`) or is already high
   (`≥ 7`) and still climbing; surfacing of an offstage character is a Director
   decision (`decideSurfacing`, §4.3) committed as a `moveCharacter` delta —
   world-consistent, never through the player's door (`director.ts`, `turn.ts`).
5. **World Reactor.** The LLM reads what happened this turn (prompt carries
   physics + red lines as soft constraints; evidence-first) and proposes
   `Delta[]`; the WriteGate `validateDelta`'s each (structural/spatial + red-line
   keyword screen + no-op discard) → `applyDelta` (immutable) → logs it
   (`src/lib/engine/reactor.ts`, `write-gate.ts`, `src/lib/world/delta.ts`). The
   `setRelationship`-reason→memory side effect runs as a post-commit hook.
6. **Memory.** Each character writes what it witnessed as observations, with
   periodic reflection (`src/lib/memory/`). Memories are scoped by `instanceId`
   before character id, so the same character id in two private doors cannot share
   or lose memories through retrieval, rewind, fork/restore, Studio inspection, or
   God-edit reconcile. Memories carry provenance/confidence (§4.5): observations
   are `witnessed`/full/confident, hearsay is `heard`/partial and less confident,
   reflections are `inferred`; `scoreMemories` multiplies by confidence so
   low-confidence records surface less forcefully. Fields are additive (legacy
   memories default to witnessed/full). Reactor-committed concealment facts are
   not broadcast as exact `witnessed`/full knowledge: non-exact observers receive
   a lower-confidence `inferred`/partial record that something was concealed,
   without the hidden value.

The model never writes the world directly — it proposes, the engine validates.
Illegal changes (e.g. moving to a nonexistent room) are dropped.

**Perception.** Characters never read raw `WorldState`; they receive a subjective
projection (`buildCharacterPrompt`/`visibleScene` in `prompt.ts`): worldview +
immutable rules, own profile/goals/hard facts, what's visible now (location,
time, present others' outward state, visible objects, the player's outward
state), what they remember (own witnessed observations + reflections, ranked by
`relevance × importance × recency`), their current stance toward present others,
and lore triggered by present text. Observations are witness-scoped and
channel-aware (`src/lib/memory/observe.ts`, `src/lib/engine/input-router.ts`) —
not present, not informed; seeing a private action is not the same as learning
its hidden target. `perception.ts`
`resolvePerception` is now the single isolated module that produces this
projection; `prompt.ts` renders the projection to prose but does not decide what a
character may know.

**Timeline hygiene.** `regenerateLastTurn` records pre-turn state plus
message/memory/delta-log high-water marks, the previous snapshot, turn count,
last-seen timestamp, and settlement record. It restores that snapshot, deletes
current-branch records created after it, then reruns the same input — so a
regenerate does not leak old-branch state, messages, memories, or Inspector log
entries. `rewindLastTurn` uses the same snapshot restore without rerunning the
model. `forkLastTurn` archives the current branch into a persisted
`TimelineBranch` snapshot, rewinds the active branch to the same waterline, and
`restoreTimelineBranch` can switch back while first archiving the currently active
branch. Play exposes this as a bottom-bar fork action plus a compact Studio
Timeline branch picker. New committed deltas and newly created memories are
stamped with the active branch id; legacy branchless memories/log entries are
stamped into the active/restored branch when archived or restored. Snapshot restore
and branch restore delete/replace only records belonging to the current instance.
Active timeline reads hide superseded records, while explicit audit reads expose
archived messages, memories, and delta log entries for inspection.
Remaining: first-class branch management and branch operations beyond last-turn
fork / restore.

## 4. World model

- **`WorldRules`** (immutable): `physics` / `setting` / `redLines` /
  `narrationRule`. Red lines are enforced two ways: as a soft constraint injected
  into the Reactor's system prompt, and as a conservative keyword substring screen
  in `validateDelta`. `narrationRule` tells the Director how to transduce the
  committed truth snapshot into user-facing prose, including lawful distortion.
  There is **no** `ruleSkills` field.
- **`WorldState`** (mutable): `currentLocationId`, `time`, `locations`, `objects`,
  `roster` (incl. the player `you`'s `condition`), `flags`, `tension`,
  `relationships` (a signed affinity ledger with decaying evidence), `lore`, and
  `pressureLines` (§4.6 — structured threads: id/summary/status/intensity, advanced
  only via thread deltas through the gate), plus hardness-graded `facts`.
  Beliefs are a read view over memories, not persisted world state. Timeline
  branch records live beside the instance in storage, not inside `WorldState`.
- **Relationships** (`src/lib/world/relationship.ts`):
  `{ affinity, disposition?, evidence[], sinceDay }` — affinity is a signed number
  clamped to [-100, 100], decaying linearly toward 0 over game-days while keeping
  its reasons. `setRelationship` is adjustment-style (`affinityDelta` + `reason` +
  optional `disposition`). Characters see attitude phrases, not raw numbers.
  The perception boundary includes the latest relationship evidence as a stance
  reason for present targets, so "why I feel this way" reaches the character
  without exposing omniscient state.
  Object ownership feeds the ledger: after a committed Reactor consequence touches
  an object with an owner, the engine derives a small owner→player relationship
  adjustment through the WriteGate unless the Reactor already wrote that
  relationship. Affinity feeds eagerness back into speaker selection. Gossip
  (`src/lib/memory/gossip.ts`) spreads one-hop, degraded, de-duplicated hearsay
  among co-present characters, but only from `witnessed`/full observations; low-
  confidence inferred/partial records are not retold as firsthand truth.
- **`Delta` (22 kinds)** — `Delta` is the code name for what the design docs call
  a "typed change" (`architecture.md` §5.2): movement / scene / state changes,
  on-demand `establish*` growth, relationship/lore, physical object moves and
  locks, Director `setTension`, `fleshLocation`, structured thread deltas (`openThread` /
  `advanceThread` / `resolveThread`), graded `setFact`, and lifecycle deltas
  (`fleshObject` / `fleshCharacter` / `retireEntity`). `establish*` grows the
  world on demand (including **instance-private characters via
  `establishCharacter`**). Mind deltas such as `setBelief`, `setSecret`, and
  `setGoal` are still absent; beliefs are a read view over memory.
- **On-demand fleshing (`stub → fleshed`)**: locations/objects/characters default
  to `detail: "stub"`. First entry into a stub location generates an on-the-spot
  description and emits `fleshLocation`; when the player explicitly pays attention
  to a visible named stub object or present stub character, the turn materializes
  it before perception via `fleshObject` / `fleshCharacter`. A present stub
  character also materializes before its first active agent loop when Director
  casting pulls it into the active set. A visible stub object also materializes
  after a committed consequence touches it (`setObjectState`, `moveObject`,
  `setObjectLocked`, or object-scoped `setFact`); a stub character materializes
  after a committed consequence gives it causal power (`moveCharacter`,
  `setCondition`, `setRelationship`, related `openThread`, or character-scoped
  `setFact`). These paths commit through the gate with `flesh` provenance.
  Implicit thresholds such as recurrence and richer causal salience still need
  broader heuristics.
- **Physical causality**: `moveObject` relocates items (with `props.portable ===
  false` immovable); locked doors block movement (`props.gates` + `props.locked`,
  toggled by `setObjectLocked`), enforced in `validateDelta`. Visible-object lists
  follow object location, so movement and (un)locking really change what each
  character sees.
- Types in `src/lib/types.ts`; validation/apply in `src/lib/world/delta.ts`.

## 5. Subsystems

| Subsystem | Today | Code |
|---|---|---|
| Director/God engine | self-deciding speakers (parallel intent + selection), subjective memory + reflection, Director (gate-committed tension / narration / character surfacing), rollback-protected God Edit | `src/lib/engine/` |
| World Reactor | LLM proposes deltas → validate (structural/spatial + red-line screen) → commit; physics + red lines as soft constraint | `engine/reactor.ts`, `world/delta.ts` |
| Subjective memory | witness-scoped observation; retrieval by recency × relevance × importance; periodic reflection | `src/lib/memory/` |
| Taste engine | behavior signals (enter/dwell/author/skip, decayed) → taste model → ranking (exploit × ε-explore × MMR × anti-fatigue) | `src/lib/taste/` |
| World generator | conditioned generation of complete playable seeds; cross-genre cold-start spread; background pre-generation pool | `world/generate.ts`, `world/pregenerate.ts` |
| Lorebook | keyword-triggered canon injection + recursive cascade activation under a budget; `establishLore` | `world/lore.ts` |
| Presentation | cold-open world cards (genre/mood/intensity/hook/entryAction/cast/accent); typewriter reveal; door transition; regenerate / rewind | `src/app/page.tsx`, `play/page.tsx`, `DoorTransition.tsx`, `world/presentation.ts` |
| Authoring / import | creator world form; SillyTavern V2 character-card (PNG tEXt) import | `src/app/create/`, `world/author.ts`, `import/` |

## 6. LLM / BYO-key

A thin proxy (`src/app/api/llm/chat/route.ts`), OpenAI-compatible (OpenRouter /
DeepSeek), SSE streaming. Key resolution (`src/lib/llm/resolve-key.ts`): the user
supplies a key in `/settings` (local `localStorage`); **production is strictly
BYO-key**, with an env fallback only in dev. `/settings` normalizes provider-
specific models (`deepseek/deepseek-v4-pro` for OpenRouter, `deepseek-chat` for
DeepSeek by default) and disables OpenRouter-only reasoning when DeepSeek is
selected. Built-in worlds carry a `prebakedTaste` transcript: a keyless visitor
can open one and see a short scripted, explicitly non-reactive sample without
live inference. Reactive play and generated worlds still require a user-supplied
  key; an empty API key is not persisted as a user config, and the Settings test
  button now refuses to run without an explicit browser key. The dev-only
  `.env.local` fallback can still prove the local proxy works via API smoke tests,
  but is not mistaken for real user-supplied play access.

## 7. Storage

Local-first, IndexedDB via Dexie (`anywhere-door`, v7): instances / messages /
memories / seeds / tasteEvents / `deltaLog` / `timelineBranches`. Repository interfaces isolate access
(`src/lib/storage/`); tests use fake-indexeddb. No server database.

Hybrid record: the snapshot (`instance.state`) is the fast current state; the
current-branch event log (`deltaLog`, `DeltaLogEntry = { branchId, turn, source,
cause, gameDay, gameClock, at, delta }`) is tagged by active branch, source
(user/reactor/flesh/offscreen/god) and the triggering input. Regenerate/rewind
now restore the log to the same snapshot waterline as state/messages/memories;
fork/restore preserve superseded branches as `TimelineBranch` snapshots. New
  memory records created by observation/gossip/reflection/god-edit reconcile are
  scoped to the current `instanceId` and also inherit the active branch id. Legacy
  unstamped memories are repaired into the only instance when that is unambiguous;
  if a multi-instance upgrade leaves memories that cannot be safely attributed,
  active reads keep them out of character memory while audit reads still expose them
  for inspection.

## 8. Gap to the design (the honest ledger)

What the design (docs 1–4) requires that the code does **not** yet do. Detail and
sequencing live in `roadmap.md`; this table is only the current truth.

| Design requirement | Today |
|---|---|
| Single write gate as a module | **done** (§4.1) — extracted `WriteGate` (`write-gate.ts`); sole caller of `applyDelta`/`appendDeltaLog`, records rejections |
| Per-instance operation lock | **done** (§4.0) — `lock.ts`; serializes turns, supersede drops stale writes |
| Single perception boundary as a module | **done** (§4.2) — `perception.ts` `resolvePerception` is the sole producer; out-of-world standing assertion runs in production too. Director Notes and Scene Contract remain outside the boundary, stay out of the main transcript, and only steer Director casting/narration; God Edit is structured delta JSON through the gate and never enters character projection; cross-world taste is still unbuilt |
| Director casting (active-agent cap, ambient cast) | **done, improving** (§4.3/§4.4) — `castTurn` caps active agents + splits ambient; active pressure-line relevance gets first claim on the active-agent budget, Director Notes / Scene Contract can steer by naming a character or by keyword overlap with that character's own memories, current-input overlap with each character's memories can pull a relevant person into the active cast, belief-graph edges can pull in a character with a wrong/believed/suspected stance about a hard fact, relationship heat is a secondary signal, and stable scene order fills the rest; `runActiveAgents` runs only the active cast; `decideSurfacing` replaces the heuristic. Still missing: richer semantic parsing beyond keyword overlap and richer salience tuning |
| Studio instrumentation / Context Inspector | **minimal UI** (§4.7) — `trace.ts` per-turn `TraceCollector` (commits/rejections/structured guard rejections/casting/threads) + in-memory inspector channel, threaded through the gate including God Edit commits; Play's Studio panel now shows a compact Context Inspector from current state, active controls, facts, pressure lines, belief edges, and recent delta log entries. Still missing: full trace UI, retrieved-memory detail, richer rejected-change display, and richer Studio tooling |
| Canon hardness (3 tiers) | **done, conservative** (§5.1) — `facts` on `WorldState` with `ambient/anchored/core` plus player-facing visibility (`playerKnown`) for narration/settlement; `setFact` delta with gate rules: anchored/core facts cannot be revised by non-`god` proposals even at equal hardness, a harder fact cannot be softened, and only `god` may write/revise `core`. Object movement checks protected location/hidden facts, and object/character/player state changes check common protected contradictions (empty/full, broken/intact, wet/dry, open/closed, lit/unlit, injured/unharmed), so a key anchored in one place, a lamp anchored as unlit, or a character anchored as injured cannot be silently moved/flipped/healed unless the fact is revised first. Reactor/user facts created from a player-facing turn are marked player-known by the WriteGate; God/offscreen private facts stay hidden from player-facing prose unless explicitly marked. Reactor parser wired; reactor prompt to mint facts lands with §5.4/§5.8 |
| Thread state (structured pressure lines) | **done** (§4.6/§5.2) — `pressureLines` with kind/playerKnown/nextSign; open/advance/resolve deltas (gate-only); fairness rule (no strong consequence while the player knows nothing); `selectActiveThreads` lets the Director pick 1–2, and pressure-line related characters influence casting. Deeper thread advancement and richer Director use of threads still pending |
| Belief graph (fact × observer read view) | **done, improving** (§5.3) — `belief.ts` `beliefOf`/`assembleBeliefGraph`: pure read view over witness-scoped memory yielding knows/believes/suspects/unaware/wrong + evidence links; zero writes. Studio's Context Inspector now renders present-character belief edges beside canon facts and includes the first subjective evidence line, so a wrong/garbled memory is visible as that character's belief rather than becoming world truth. Director casting also reads this graph as salience, so wrong beliefs about hard facts are more likely to enter the active scene. Still missing: a player-facing World Atlas |
| Observation provenance / confidence / distortion | **done, improving** (§4.5/§5.4) — `Memory` carries the subjective-record fields (additive), stamped by observe/gossip/reflect; confidence folded into retrieval; renderer hedges low-confidence memories, surfaces interpretation, and now renders distortion as what the character misremembers, so characters act on what they *believe* instead of an omniscient correction. Reactor-committed visible consequences now also become witness-scoped memories for characters in the current scene, so a player action that persists as state/fact can be remembered by witnesses without teaching absent characters. Concealment consequences are split by perception quality: exact witnesses may receive the full hidden detail, while ordinary co-present characters receive only inferred/partial awareness that something was concealed; partial concealment memory keywords are derived from the safe visible text only, not the raw hidden action, and gossip only retells `witnessed`/full observations. Relevant old witness memories also reach intent judgment, not only speech rendering, and can nudge pass-only speaker selection toward the relevant witness. When strong onstage relationship pressure and a current-input-relevant memory combine, the intent gate can promote a conservative `pass` into `speak`, so the affected character actively pushes back instead of leaving the change as ledger-only. The intent layer also supports `avoid`; avoidance is rendered as a visible social-withdrawal narration and written as witness-scoped memory instead of being forced into dialogue by the lull breaker, including mixed turns where another character still speaks. Owned-object consequences also become relationship evidence for the owner through a derived `setRelationship` that still passes the WriteGate. Belief graph (§5.3) reads this substrate |
| Three-tier offstage precision | **done, improving** (§5.5) — `offstage.ts` `classifyPrecision` (near/related/far from scene proximity + thread links); `boundOffstageDeltas` freezes far entities, caps entity-bearing changes to three near changes plus one related change per reconciliation pass, and sign-gates unknown pressure-line advancement; `evolveWhileAway` is bounded to near/related, lists the evolvable scope in its prompt, and tells the model to include a player-facing `nextSign` when it advances an unknown pressure line. Return settlement consumes the offscreen deltas that actually passed the WriteGate and derives compact return-local signs for committed near-scene entity changes; committed local relationship changes now become character-reaction hooks that carry the reason forward instead of a generic attitude-change line. This is the shared reconcile core for the Phase 2 god-edit reconcile. Still missing: richer authored reactions for object/condition changes and fuller scene repair |
| Narration as transduction + cheap guard | **partial** (§5.8) — `WorldRules.narrationRule` is part of created/generated/built-in seeds, and Director narration receives the rule plus a compact player-facing committed-truth snapshot (scene, present characters, visible objects, player-known facts, active pressure lines) as source material. Active pressure lines that are not yet player-known are anonymized in that snapshot, and facts not marked player-known are omitted, so hidden fact values / unknown summaries / next signs are not leaked before the world has shown a fair sign. `guard.ts` `consistencyGuard` screens ambient narration for cheap high-value slips: names an offstage character, offstage object, or far non-adjacent location; contradicts visible object lock/light state or common state opposites (empty/full, broken/intact, wet/dry, open/closed); or attributes obvious inner knowledge to a character without phrase-level support from that character's own memories. The inner-knowledge check no longer counts loose CJK single-character keyword overlap; it requires the claim, or a normalized variant with leading perspective pronouns/common particles removed, to appear in that character's own memory text. The turn passes per-character memories and the seed narration rule into this guard and drops a slipping beat with a structured trace guard-rejection record. When that rule declares lawful distortion, offstage-name and visible-state contradiction checks get a narrow media-proximity allowance: the affected entity/object must appear near an allowed medium such as mirror, recording, doorplate, photo/camera/screen, preserving the underlying committed truth instead of treating the figure as present or the state as changed. Character-authored prose now also passes a projection-level guard before it is shown or persisted: an offstage entity name is allowed only if that character's visible scene, own memories, or triggered lore support it; character drops also write structured guard-rejection trace records. Still missing: fuller prose-from-snapshot coverage and deeper semantic contradiction checks beyond the cheap pattern layer |
| Agentic Director / rule-skills | none; Director is prompt-only, no deterministic computation and no internal specialist-agent team |
| God-edit witness-scoped reconcile | **minimal path exists, improving** — Play's Studio panel accepts structured delta JSON, parses it, commits through WriteGate as `god`, logs provenance, and rolls back to the pre-edit waterline if a later persistence step fails. When a God edit rewrites a `setFact`, `setCondition`, or `setRelationship` stance, `reconcileGodEditMemories` appends authored correction memories for same-instance witnesses whose memories reference the old value in the relevant subject context, preserving old memories instead of deleting them. Entity facts/conditions/relationships require a subject hint (entity id/name or relationship source) as well as the old value, so generic old-value mentions are not treated as witnesses. A conservative paraphrase band now catches common condition / relationship evidence such as injury vs. health and trust vs. wariness while still requiring the subject hint. Still missing: full semantic belief-graph supersession, scoped scene repair, and a full Studio edit UI |
| Out-of-world control channels (Director Notes, Scene Contract, God) | **partial** — Director Notes and Scene Contract are surfaced inside Play's Studio panel, persisted outside `WorldState`, steer Director narration, can influence Director casting by naming a character, stay out of character projection, and stay out of the main transcript. God Edit is surfaced as structured JSON delta submission, commits via the WriteGate with `god` provenance, writes that provenance into the Studio trace, performs minimal witness correction memory append, and rolls back on partial persistence failure. Richer steering semantics, richer reconcile, and full Studio editing affordances are still unbuilt |
| Doorway Library UI + exit settlement + echoes | **done, improving** (§5.6) — `deriveSettlement` stored each turn; trace lines render only player-known facts with player-facing entity names, unresolved lines include only player-known pressure summaries, and candidates prefer committed local offscreen signs, local relationship reaction hooks, then diegetic `nextSign` / safe forward pulls. `composeReturnEcho` emits a return-open beat that includes elapsed time, trace, bond, and candidate/unresolved hook. `/play` now reconciles offstage changes through the WriteGate before composing the live page-open echo, then marks it against the prior `lastSeenAt` and refreshes `lastSeenAt` so the first subsequent action does not duplicate or silently replay the same absence. While the Play page remains visible, a locked read-only presence touch refreshes `lastSeenAt` and settlement without mutating world state, so a long in-page pause does not trigger false offstage evolution on the next input. The Library card surfaces a one-line settlement hook that now prefers candidate → unresolved → latest trace → bond as "what pulls you back" |
| Funnel metrics (return-rate) | **done, improving** (§5.9) — `funnel.ts` `recordFunnel` / `recordCardDwell` + pure `computeFunnel`; stages fired from the loop: card-dwell (feed), open-door / first-action / ten-minute-retain (play page), first-consequence (turn, first player-caused anchored fact), return (library click and live page-open echo) / pin (library). The keyless cliff is now separately instrumented: a built-in scripted sample records `prebaked-taste`, its CTA opens Settings with the sampled world id, and saving a non-empty key from that handoff records `key-add`, so `computeFunnel` can report `prebaked-taste→key-add→first-action`. If Reactor commits a clear player-caused object/condition state change but no fact and the instance has no prior player-caused anchored fact, the turn loop derives one player-known anchored fact from the already-validated change and commits it through WriteGate as an engine floor; God/offscreen facts do not suppress this player funnel stage. Still missing: richer analytics views |
| Built-in cold-start pool with a keyless pre-baked taste | **done for MVP coverage** — eight built-ins now cover faithful drama, wuxia, hard sci-fi, distorted horror, a game-y dungeon, fog-market debt intrigue, polar survival science, and final-show theater mystery. Each carries a distinct `entryAction` and `prebakedTaste`, and `/play` shows the scripted sample without calling the LLM when no user key is configured. The keyless sample path requires `source: "builtin"` |
| Object/character on-demand fleshing | **done, improving** (§5.7) — `fleshObject`/`fleshCharacter` deltas promote a stub to fleshed; `retireEntity` archives (presence flag, never deletes). Reactor parser wired. LLM flesh-producers are authored and `runTurn` now materializes current visible stub objects / present stub characters when the player's text names them, present stub characters when Director casting pulls them into the active set, stub objects after committed object consequences, and stub characters after committed character consequences give them causal power, before future perception. Remaining: richer earned-persistence heuristics for recurrence and broader causal salience |
| Timeline forks | **minimal path exists** — `regenerateLastTurn` / `rewindLastTurn` restore state/messages/memories/delta log to the snapshot waterline; `forkLastTurn` archives the current branch before rewinding; `restoreTimelineBranch` restores an archived branch while preserving the active branch; new deltas/memories are stamped with active `branchId`, legacy unstamped records are stamped when archived/restored, and explicit audit reads expose archived messages/memories/delta logs; Play's Studio panel lists recent branches. Missing: full branch manager, branch deletion/rename, and fork-from-arbitrary-turn UI |
| Bilingual (zh/en) as two single-language deployments | foundation built — `NEXT_PUBLIC_LOCALE` build constant, typed UI catalog + `t()`, en UI authored, `<html lang>` from build, locale-aware fonts, accent-themed chrome; both builds pass. Remaining: en world/seed content pool + language-facing prompt extraction (zh first) |

Every implemented durable change already rides `propose → validate → apply → log`,
and no second runtime exists — so the gaps above are additive work on the existing
gate, sequenced in `roadmap.md`.
