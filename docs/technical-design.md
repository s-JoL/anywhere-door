# Anywhere Door — Technical Design (Phase 0 → 1)

> **Status: NON-AUTHORITATIVE working spec — for review, not yet built.** This doc
> names code symbols and file paths (like `current-state.md`) and translates the
> product into a concrete engineering plan. It is **obligated to the design**
> (`AGENTS.md`, `first-principles.md`, `product-design.md`, `architecture.md`);
> where it conflicts with them, the design wins. It supersedes nothing in
> `roadmap.md` — it is the detailed "how" under the roadmap's "what/when."
> Detailed for **Phase 0** (runtime spine), moderate for **Phase 1**
> (living-world mechanics). Implementation reality stays in `current-state.md`.

## 0. How to read this

- **§1–§3** frame the method and the target topology.
- **§4 is the detailed plan** — Phase 0, the runtime spine extraction, the part
  everything else depends on. Each module: *what's there today → target interface
  → migration steps (behavior-preserving) → tests → which invariant it enforces.*
- **§5** is the Phase 1 mechanics at moderate depth (data model + validation +
  runtime touchpoints + dependency), since each will get its own spec when built.
- **§6–§9** are cross-cutting: data-model evolution, turn-flow target, invariants/
  testing, and the sequencing graph.

## 1. Method: product requirement → engineering obligation

Every engineering item below traces to a product obligation and an invariant it
must not break. The discipline (`first-principles.md` §2.2): **a change that
discharges no product row is off by default.** The non-negotiables every item
inherits (`AGENTS.md` §15):

1. One **write gate** is the only durable writer.
2. One **perception boundary** is the only thing that feeds a character;
   out-of-world channels never cross it (and the failure is **silent**, so it is
   guarded by standing assertions, not vigilance).
3. **Propose → validate → apply → log**; the model never writes durable state.
4. **Record = snapshot + append-only log**; history is never deleted.
5. **Turn-scoped**, interaction-driven; no idle simulation.
6. **Language-agnostic kernel** (§15.14): everything in this spec is keyed on
   stable identifiers; per-language difference stays in prompt wording / UI, never
   in the structures defined here.

## 2. Current code reality (the starting point)

The logic is mostly correct but concentrated in one orchestrator, `runTurn`
(`src/lib/engine/turn.ts`). One turn today, in order:

1. ensure player `you` in roster (never in `presentCharacterIds`);
2. **offstage evolution** on return — `evolveWhileAway` (`world/offscreen.ts`),
   uniform (no precision tiers), each delta `validateDelta`→`applyDelta`→`logDelta("offscreen")`;
3. capture rollback snapshot (`captureTurnSnapshot`);
4. append user message; apply any explicit user `deltas`; write the user's line as
   witness-scoped observations (`memory/observe.ts`);
5. **speaker loop** under a budget: parallel `decideIntent` (`engine/intent.ts`) →
   `selectSpeakers` (`engine/select.ts`) → stream speech with `buildCharacterPrompt`
   (`engine/prompt.ts`) → write observations to present witnesses;
6. **Director**: `updateTension` + `maybeDirect` beat (`engine/director.ts`); at
   `tension ≥ 6`, hardcoded offstage `introduceCharacter` (`engine/introduce.ts`);
7. **Reactor**: `react` (`engine/reactor.ts`) proposes `Delta[]` →
   validate→apply→`logDelta("reactor")`; relationship `reason` becomes a self-memory;
8. **flesh** current stub location (`world/flesh.ts`);
9. **gossip** one-hop among co-present NPCs (`memory/gossip.ts`);
10. persist instance; **reflect** for speakers (`memory/reflect.ts`);
11. on throw → `restoreTurnSnapshot`.

Durable mutation is the typed `Delta` (14 kinds) through `validateDelta` /
`applyDelta` (`src/lib/world/delta.ts`); every committed delta is appended to
`deltaLog` (`DeltaLogEntry`). **This is already propose→validate→apply→log** — but
the gate is *inline*, not a module; perception is *de-facto* in `prompt.ts`, not an
isolated boundary; there is no instance lock; and casting, hardness, threads,
beliefs, provenance, offstage tiers, god edits, transduction, and the funnel do not
exist. Full gap ledger: `current-state.md` §8.

## 3. Target topology (two choke points, named in code)

`architecture.md` §2 requires exactly two structural choke points, each existing in
**one** place. The whole Phase 0 is "make these two real modules and route
everything through them":

```text
              ┌─────────────── WriteGate ───────────────┐   (sole durable writer)
 proposals →  │ validate(rules, hardness, redline) →     │ → applyDelta → deltaLog
 (reactor,    │ apply (immutable) → append log →         │   + rejection records
  director,   │ record rej(reason)                       │
  offstage,   └──────────────────────────────────────────┘
  god, user)
              ┌──────────── PerceptionResolver ──────────┐   (sole character feed)
 hub state →  │ mechanical fact filter + directed        │ → typed ContextPack
              │ salience; out-of-world channels barred    │   (per character)
              └──────────────────────────────────────────┘
```

Everything else (Director, AgentRuntime, Reactor, Materializer, Offstage,
Memory/Belief, Studio) is defined relative to these two.

---

## 4. Phase 0 — runtime spine extraction (detailed)

**Goal:** extract the two choke points + the casting layer + the instance lock from
`runTurn`, each slice **behavior-preserving and independently mergeable**, with the
**boundary test written before the implementation**. No new player-facing feature
ships in Phase 0; it is the foundation Phase 1 builds on. Order matters — see §9.

### 4.0 Instance operation lock (prerequisite)

**Why first (`architecture.md` §11):** even single-player has real concurrency —
rapid re-submit, multiple tabs, regenerate/god-edit mid-stream. Without a lock,
overlapping Director/Reactor/character writes contaminate one branch. Every later
slice adds agent calls, widening the window.

- **Today:** none. `runTurn` and `regenerateLastTurn` can interleave on one instance.
- **Target:**
  ```ts
  // src/lib/engine/lock.ts
  interface InstanceLock {
    acquire(instanceId: string): Promise<LockToken>;   // queues if held
    release(token: LockToken): void;
    isStale(token: LockToken): boolean;                 // superseded / timed out
  }
  ```
  An in-memory per-instance mutex (local-first, single tab is the common case) with
  an operation id; long model ops check `isStale` before committing; a timeout
  releases safely; regenerate/fork/god-edit invalidate in-flight ops.
- **Migration:** wrap the body of `runTurn` between `acquire`/`release`; ignore a
  stale op's writes. No behavior change for the serial case.
- **Tests:** two overlapping `runTurn` calls on one instance commit serially, not
  interleaved; a stale op's deltas are dropped; timeout releases the lock.
- **Invariant:** one turn commits at a time (§15.6 turn-scoped integrity).

### 4.1 WriteGate — the sole durable writer

**Product:** "the model proposes, the engine validates" (§28.4); raising authority
never bypasses the gate (§11). **Today** the validate→apply→log triple is repeated
inline four times in `runTurn` (offstage, user, reactor, flesh), each with its own
`console.warn` on rejection and no rejection record.

- **Target interface:**
  ```ts
  // src/lib/engine/write-gate.ts
  type ProposalSource = "user" | "reactor" | "director" | "offscreen"
                      | "flesh" | "materializer" | "god";
  interface Proposal { delta: Delta; source: ProposalSource; cause: string; }
  interface CommitResult {
    committed: Delta[];
    rejected: { delta: Delta; reason: string; source: ProposalSource }[];
  }
  interface WriteGate {
    commit(ctx: GateCtx, proposals: Proposal[]): Promise<CommitResult>;
  }
  // GateCtx carries state ref, rules, instanceId, turn, time, repo, logger.
  ```
  `commit` is the **only** call site of `applyDelta` and `repo.appendDeltaLog`. It
  runs `validateDelta` (which grows hardness/thread/redline checks in Phase 1, §5),
  applies valid deltas immutably **in order** (later deltas see earlier ones), logs
  each with full attribution, and **records rejections with reasons** (today they
  are only `console.warn`-ed).
- **Migration (behavior-preserving):**
  1. Write `write-gate.test.ts` asserting current accept/reject outcomes for each of
     the 14 delta kinds (golden test of today's behavior).
  2. Implement `WriteGate.commit` wrapping the existing `validateDelta`/`applyDelta`.
  3. Replace the four inline loops in `runTurn` with `gate.commit(...)`; thread the
     returned `state`. The `setRelationship`→self-memory side effect (turn.ts:249)
     moves to a **post-commit hook** keyed off `committed` deltas (keep it out of the
     gate — the gate writes state, not memory).
  4. Rejections: keep `console.warn` for now **and** stash them on the result for the
     future Context Inspector (§5 Studio).
- **Tests:** every durable mutation in the codebase routes through `commit`
  (grep-assert no other `applyDelta` caller); ordering within a batch; rejection
  records carry a reason; log entry has turn/source/cause/gameTime.
- **Invariant:** §15.3 / §15.4 — one writer, propose→validate→apply→log.

### 4.2 ContextAssembler + PerceptionResolver — the single perception boundary

**Product:** characters are real because limited (§6); all character context passes
**one** boundary; out-of-world channels never appear in it (§9, the silent-failure
invariant). **Today** `buildCharacterPrompt` + `visibleScene` in `prompt.ts` is the
de-facto boundary, but context assembly is spread across `prompt.ts` and `runTurn`
(memory retrieval at turn.ts:183-186), and there is no structural guarantee against
leakage.

- **Target:**
  ```ts
  // src/lib/engine/perception.ts
  interface CharacterProjection {
    selfFacts; visibleScene;            // present chars/objects, location, time
    memories; recent;                   // witness-scoped only (own observations)
    stance; triggeredLore;              // current dispositions, keyword lore
    salience?: SalienceHint[];          // Director-set attention (§4.3), never fact
    // NOTHING out-of-world: no director note, scene contract, taste, god edit
  }
  function resolvePerception(ctx, character): CharacterProjection;

  // src/lib/engine/context.ts
  function assembleContextPack(role, ctx): ContextPack;  // typed per role, budgeted
  ```
  `resolvePerception` is the **only** producer of character-facing context.
  `assembleContextPack` owns the token budget + lore activation/recursion/cooldown
  (today implicit in `prompt.ts` + `world/lore.ts`).
- **Migration:**
  1. `perception.test.ts`: a projection never contains a non-present character's
     private facts, another character's memories, or any out-of-world field —
     **before** refactor (write against `buildCharacterPrompt` output today).
  2. Extract `resolvePerception` from `buildCharacterPrompt` + the memory retrieval
     currently inlined in `runTurn` (turn.ts:183-186 `scoreMemories`/`keywordsOf`).
  3. `buildCharacterPrompt` becomes a thin renderer of `CharacterProjection` →
     `ChatMessage[]` (prose/wording layer; this is where **story-locale** prompt
     wording lives, §15.14 — kept out of the projection structure).
  4. Add **standing assertions** (dev-mode invariant checks) inside the resolver:
     assert no key from the out-of-world set is present. These are the guard the
     charter (§9) requires because the leak is silent.
- **Tests:** the assertion fires if a director-note/scene-contract/taste/god field
  is injected; projection only ever reads own witnessed/heard/inferred records.
- **Invariant:** §15.5 + charter §9 single perception boundary, channel isolation.
- **Hard sequencing rule (from roadmap):** these isolation assertions are a
  prerequisite — **no power surface (Director Notes / Scene Contract / God /
  cross-world taste) ships until they exist.**

### 4.3 Director casting — active-agent cap, ambient cast, surfacing

**Product:** "a bustling market is not thirty agents" (§13.1); tension is an input,
not an on/off gate. **Today** intent runs for *all* present characters (turn.ts:165-176),
and surfacing is a hardcoded `tension ≥ 6` grab of `off[0]` (turn.ts:219-229).

- **Target:**
  ```ts
  // src/lib/engine/director.ts (extended)
  interface CastingDecision {
    active: string[];        // hard cap ≈ 4, run full intent→speak→memory loop
    ambient: string[];       // narrated as prose, no agent loop
    surface?: { who: string; how: "present-unnoticed" | "adjacent" | "egress" };
  }
  function castTurn(ctx): CastingDecision;
  ```
  The omniscient Director chooses who is active; the rest are ambient. Surfacing
  becomes a Director decision (whether/whom/how, world-consistently), replacing the
  `tension ≥ 6` heuristic.
- **Migration:** introduce `castTurn` returning *all present* as active first
  (behavior-preserving), then impose the cap + ambient split; replace the
  `introduceCharacter` block with `surface`. Keep `updateTension`/`maybeDirect`.
- **Tests:** never more than the cap run the agent loop; ambient characters get no
  memory/intent calls; surfacing is world-consistent (never "through the player's
  door").
- **Invariant:** §15.6 active agents capped; Director is orchestration, not a
  character (§9).

### 4.4 AgentRuntime — explicit character cognition

**Product:** characters perceive→decide→act→remember with limited POV. **Today**
this is the inline speaker loop.

- **Target:** `runActiveAgents(ctx, casting.active)` running
  `perceive (via resolver) → retrieve → decide intent → speak/act → record
  observation` per active agent; the end-of-turn Reactor stays separate.
- **Migration:** lift turn.ts:164-203 into `agent-runtime.ts`, calling
  `resolvePerception` (§4.2) and `selectSpeakers` (unchanged). Pure extraction.
- **Tests:** characters emit prose only; never mutate state; never read omniscient
  state or out-of-world channels (rides §4.2 assertions).
- **Invariant:** §15.5 characters propose via prose; the gate commits.

### 4.5 Memory/Belief upgrade — provenance, confidence, distortion

**Product:** §6 character reality, §5.4 subjective records (the four cases: sees
part / misunderstands / misremembers / rule-warped). **Today** `Memory` has
kind/importance only; witness scope exists (`observe.ts`), hearsay degrades
(`gossip.ts`), retrieval is recency×relevance×importance (`retrieve.ts`).

- **Target:** extend `Memory` with `provenance` (witnessed/heard/inferred/
  remembered/revealed/canonized/authored), `confidence`, `interpretation`,
  `perceptionQuality`, `distortion`, `evidenceLinks` (→ `deltaLog` ids), `branchId`.
  Fold `confidence` into `scoreMemories`.
- **Migration:** additive fields with defaults (existing memories = witnessed/full);
  `buildObservations` stamps witnessed+full; `propagateGossip` stamps heard+degraded
  (it already degrades — now it is typed). No behavior regression.
- **Tests:** witness scope preserved; hearsay confidence < first-hand; low-confidence
  surfaces less forcefully in retrieval.
- **Invariant:** §15.5; this is the substrate the belief graph (§5) reads.

### 4.6 Offstage + pressure-line scaffolding

**Product:** §5 pressure lines, §7 offstage life. **Today** `evolveWhileAway` is
uniform; pressure is only the `tension` scalar.

- **Target (scaffolding only in Phase 0):** add `pressureLines` to `WorldState` as
  structured data (read by the Director); make `evolveWhileAway` *read* threads +
  log evidence (the **three precision tiers** are Phase 1, §5). Add the thread Delta
  kinds to the vocabulary (committed only via the gate).
- **Migration:** introduce the field + a no-op-compatible reconciler that still
  produces today's calm deltas, now thread-aware.
- **Invariant:** §15.3 threads advance only through a validated change.

### 4.7 Studio instrumentation hooks

**Product:** Context Inspector (§17), rejected-proposal visibility. **Today** none;
rejections are `console.warn`.

- **Target:** the WriteGate's rejection records (§4.1) + a per-turn trace buffer
  (which facts/memories were used, which thread fired, casting decision) emitted to
  an in-memory inspector channel — **not** persisted, **not** crossing the perception
  boundary.
- **Migration:** thread a `trace` collector through `GateCtx`/casting; no UI yet.
- **Invariant:** the trace is out-of-world; it must never enter a projection (§4.2
  assertion covers it).

---

## 5. Phase 1 — living-world mechanics (moderate depth)

Each rides the Phase 0 spine (gate, perception boundary, casting) and obeys the
append-only invariant. Each gets its own spec at build time; here is the shape,
data-model touch, and dependency. Order and rationale: `roadmap.md` Phase 1.

### 5.0 Data-model additions (the typed mutation vocabulary grows)

New `Delta` kinds (committed only via the WriteGate), per `architecture.md` §5.2 —
added **only** because the detail must persist, validate, or affect future behavior:

| Delta kind | For | Validation added at the gate |
|---|---|---|
| `setFact` (with hardness tier) | canon hardness (§5.1) | reject contradiction of a harder fact |
| `setPressureLine` / advance | thread state (§5.2) | fairness: no strong consequence while player knows nothing |
| `setBelief` / `setSecret` / `setGoal` | character mind (§5, §4.5) | owner exists; belief may diverge from canon |
| `fleshObject` / `fleshCharacter` | entity lifecycle (§5.7) | target exists & is a stub |
| `retireEntity` | lifecycle | archival flips a presence flag; never deletes |
| `forkTimeline` | timeline forks (§5.9) | branch id integrity |

New `WorldState` fields: `pressureLines`, `facts` (with hardness), `beliefs` (a
*read view*, §5.3, not a second truth), `offstage`, `timeline/branch`. New
`WorldRules` fields: `narration` rule, optional `ruleSkills` (Phase 2). New
`WorldSeed` field set: the medium-seed contract (§5.6).

### 5.1 Canon hardness (three tiers)

`ambient | anchored | core` on facts. **Gate rule:** a change contradicting a fact
harder than its source's authority is rejected (Reactor/character cannot overturn an
*anchored* fact; only a god edit revises anchored/core, paying the §5.8 reconcile).
Contradiction detected conservatively (same entity/field, opposing value), matching
the existing red-line screen's restraint. *Depends on:* WriteGate (§4.1).
*Discharges:* "I hid the key, it stays hidden" (§9, the rainy-inn atomic loop).

### 5.2 Thread state (structured pressure lines)

Threads as structured state (kind/status/closeness/player-knowledge/next-sign/bound
entities); the Director picks 1–2 active and advances them **only** via a gate
commit; surfaced diegetically (no raw meter — already honored in the redesigned Play
UI). Fairness is a **validation rule**. *Depends on:* §4.3, §4.6, gate. *Discharges:*
first-ten-minutes "a local consequence," return signs.

### 5.3 Belief graph (fact × observer read view)

A *projection over existing witness-scoped memory* (§4.5), not a parallel authority
(that would break the axiom). Yields a per-fact/observer stance
(knows/believes/suspects/unaware/wrong) with evidence links; assembled on demand,
**zero writes**. Powers Director, Context Inspector, and the player-facing World
Atlas. *Depends on:* §4.5 provenance. *Discharges:* "not everyone agrees what
happened" (§6.2), POV-asymmetry metric.

### 5.4 Observation provenance/confidence/distortion (wired into play)

The §4.5 fields made *active* in retrieval and narration: rule-warped distortion is
the hook for lawful distortion (§5.8). *Depends on:* §4.5.

### 5.5 Three-tier offstage precision

`near (high) | related (medium) | far (frozen)` derived from scene proximity +
thread links, bounding what `evolveWhileAway` may propose. All output still through
the gate. *Depends on:* §4.6, §5.2. *Discharges:* "the world moved plausibly while I
was gone" (return). **This reconciler is the single reconcile core** (append-only,
supersede-not-overwrite, witness-scoped); the Phase 2 god-edit reconcile reuses it
rather than introducing a parallel path (§10 decision).

### 5.6 Exit settlement + echo + Doorway Library completion

On exit, a single bounded pass derives a settlement record (trace from
anchored+ player-caused facts; unresolved = active thread summaries in player-safe
language; **candidates** = plausible openings, *not committed facts*). On re-entry the
reconciler consumes one candidate + elapsed time → a return-open beat. The **Doorway
Library page already exists** (`src/app/library/page.tsx`, `listInstances` + pin);
this adds the settlement/echo engine behind it. *Depends on:* §5.1 (anchored facts),
§5.2 (threads), §5.5 (reconcile). *Discharges:* return-rate (north star). Also
includes the **bond beat** (§21): the echo surfaces *someone's* changed stance, not
only world change.

### 5.7 Entity lifecycle for all types

Extend `stub → fleshed` (today only locations, `world/flesh.ts`) to objects and
characters via `fleshObject`/`fleshCharacter`; promote only on earned persistence;
`retireEntity` archives (flag), never deletes. Hardness tracks materialization
(§architecture 13.5). *Depends on:* gate, §5.1.

### 5.8 Narration as transduction + cheap guard

Generate prose **from the hub fact snapshot** (biased structural grounding), not
free-written then policed; faithful default + lawful distortion as a seed rule; a
conservative consistency guard screens cheap high-value slips (names an entity absent
from snapshot / asserts a contradicted state / gives knowledge outside projection).
**This is the layer where story-locale prompt wording lives** (§15.14) — the snapshot
and guard are language-agnostic; the *voice* is per deployment. *Depends on:* §4.2.
*Discharges:* anti-pattern "walls of prose," recoverable slips.

### 5.9 Cold-start pool, metrics funnel, input channels

- **Cold-start pool (keyless on-ramp):** built-in worlds with a baked cold-open + a
  scripted **pre-baked taste** (zero live inference); reactive play stays BYO-key.
  Today there is **no** keyless play. *Discharges:* top-of-funnel acquisition.
- **Metrics funnel:** extend the local taste-event stream into `card-dwell →
  open-door → first-action → ten-minute-retain → first-consequence → return → pin`;
  `first-consequence` fires on the first player-caused *anchored* fact. Local-first,
  never server, never reaching characters.
- **Input channels:** surface Say / Do / Observe / Director Note; first three
  in-world, Director Note channel-isolated (gated on §4.2 assertions).

## 6. Data-model evolution (consolidated)

```text
WorldRules   += narration (rule), ruleSkills? (Phase 2)
WorldState   += pressureLines, facts (hardness), beliefs (read view),
                offstage (per-agent + precision tier), timeline/branch
Memory       += provenance, confidence, interpretation, perceptionQuality,
                distortion, evidenceLinks, branchId
WorldInstance  (pinned already added) ; + branch metadata
Delta        += setFact, setPressureLine(+advance), setBelief, setSecret,
                setGoal, fleshObject, fleshCharacter, retireEntity, forkTimeline
DeltaLogEntry += witness/visibility metadata, branchId, rejection reason
```

All additive; all keyed on stable ids (language-agnostic, §15.14). Dexie schema
gets a new `version()` with these stores/fields; existing data migrates with
defaults.

## 7. Turn flow: current → target

The target is `architecture.md` §4's flow, reached by extraction — *not* a rewrite:

```text
acquire lock (§4.0)
 → load instance/seed/messages/cursors
 → capture rollback snapshot
 → classify input channel (InputRouter; Phase 1 §5.9)
 → gate.commit(user/god proposals)            (§4.1)
 → OffstageReconciler if returning            (§4.6 → tiers §5.5)
 → Materializer pre-pass                       (§5.7)
 → Director.castTurn                           (§4.3)
 → resolvePerception per active agent          (§4.2)
 → AgentRuntime.runActiveAgents                (§4.4)
 → Director ambient/narration beat (transduction §5.8)
 → Reactor proposes → gate.commit              (§4.1)
 → MemoryBelief writes (provenance §4.5)
 → Materializer post-pass
 → persist; release lock
```

Fast/slow split (`architecture.md` §4.1) is preserved: streaming speech is the fast
path; gate commits + memory are the slow path, settled before the next turn's commit
(enforced by the §4.0 lock).

## 8. Cross-cutting

- **Invariants preserved at every slice** — each Phase 0 slice has a boundary test
  written *first*; behavior is semantically unchanged until a Phase 1 feature
  deliberately changes it.
- **Silent-failure guard** — the §4.2 standing assertions are the one structural
  defense for channel isolation; they gate all power surfaces.
- **Testing strategy** (mirrors `architecture.md` §14): WriteGate validates/applies/
  logs + records rejections; PerceptionResolver leaks nothing private/omniscient/
  out-of-world; Director respects the cap; Reactor evidence-first; Memory keeps
  witness scope + hearsay degradation; Offstage produces zero changes for a *far*
  agent; hardness rejects a low-authority contradiction; thread fairness rejects a
  strong consequence while the player knows nothing; belief graph performs no writes.
- **Language-agnostic** — nothing here forks by language; only the prose/wording
  layers (§4.2 renderer, §5.8 transduction) consult locale (`architecture.md` §5.5).
- **Local-first** — all of it runs on the user's key in the browser; no server
  state; the gate/lock are in-process.

## 9. Sequencing & dependency graph

```text
Phase 0 (spine, behavior-preserving):
  4.0 lock ─┬─> 4.1 WriteGate ─┬─> 4.6 offstage/threads scaffold
            │                  └─> 4.7 studio trace
  4.2 perception boundary ──> 4.4 AgentRuntime
  4.3 casting ──────────────> 4.4
  4.5 memory/belief fields (additive, anytime after 4.1)

Phase 1 (features, gated on the spine):
  4.1 ─> 5.1 hardness ─> 5.6 exit settlement/echo ─> (return-rate)
  4.3+4.6 ─> 5.2 threads ─> 5.5 offstage tiers ─> 5.6
  4.5 ─> 5.3 belief graph ; 5.4 provenance-in-play
  4.2 ─> 5.8 transduction ; 5.9 input channels (after §4.2 assertions)
  independent: 5.9 cold-start pool, metrics funnel
```

**Critical path to the north star (return-rate):** `4.0 → 4.1 → 5.1 → 5.6`. The
fastest demonstration that "the world remembers me and moved while I was gone" is
WriteGate + canon hardness + exit settlement/echo, riding the Library page that
already exists.

## 10. Risks & decisions

- **Extraction churn vs. value** — Phase 0 ships no visible feature; mitigated by
  behavior-preserving slices + tests-first, each independently mergeable.
- **Belief graph cost on long worlds** — assemble on demand; materialize an index as
  a *cache* only if needed, never as a second truth (`architecture.md` §7.3).
- **Reactor over/under-commit** — bias toward running (the Director's structural-
  change flag), evidence-first + critic on high-consequence (`first-principles.md` §4.3).
- **Decided (reconcile core is shared):** the offstage reconciler (§5.5/§5.6) is
  built as the *single* reconcile core — append-only, supersede-not-overwrite,
  witness-scoped. The god-edit reconcile (architecture §10) does **not** get its own
  path; when god edits land in Phase 2 they reuse this core. One semantics, no second
  reconcile to drift against.
- **Decided (single depth tier first):** ship one `standard` turn path; get the turn
  loop, the gate, and the perception boundary correct on it before branching. Depth
  tiers (fast/standard/deep) are deferred as the later cost valve, not built into the
  early core.
