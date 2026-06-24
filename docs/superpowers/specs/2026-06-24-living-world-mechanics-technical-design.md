# Anywhere Door Living-World Mechanics Technical Design

Date: 2026-06-24

Status: technical design for the net-new living-world mechanics. Design only —
no code in this document. This spec **refines**, and does not replace,
`docs/superpowers/specs/2026-06-24-world-runtime-technical-design.md` (the
runtime spine). Where that spec lists data-model fields "to add over time"
(§6.1 `pressureLines` / `beliefs` / `facts`; §6.4 subjective-record provenance
and confidence), this document gives those fields concrete shapes and validation
rules.

Related authority:

1. `AGENTS.md` — charter and non-negotiable invariants.
2. `docs/superpowers/specs/2026-06-24-overall-product-design.md` — product form.
3. `docs/superpowers/specs/2026-06-24-world-runtime-technical-design.md` —
   runtime spine. **This document sits directly under it as a detailing.**
4. `docs/DESIGN.md` — current implementation state.
5. `docs/ROADMAP.md` — staging.

## 0. Scope And Non-Negotiables

This document designs seven mechanics that the product form requires but the
current code does not yet implement as structured state:

1. Canon Hardness Levels (L1–L5)
2. Explicit Thread State (structured pressure lines)
3. Belief Graph (fact × observer, derived from witness-scoped memory)
4. Observation provenance / confidence / distortion fields
5. Three-tier offstage simulation precision
6. Doorway Library UI + exit settlement + echo candidates
7. Product-funnel metrics (return-rate north star)

Every mechanic obeys the charter invariants without exception:

- **Propose → validate → apply.** Nothing here writes durable state outside
  `validateDelta` / `applyDelta` and the `deltaLog` append.
- **Characters never read raw `WorldState`.** The Belief Graph is a *read model*
  over existing per-character `Memory`; it does not give a character omniscient
  access.
- **Taste never leaks into character knowledge.** Metrics and Door DNA live in
  the taste layer only.
- **Append-only.** Hardness upgrades, belief supersession, and echo settlement
  add records; they never delete history.

No second runtime is introduced. Each mechanic plugs into the existing
`runTurn` boundaries (`src/lib/engine/turn.ts`) and the existing delta gate
(`src/lib/world/delta.ts`).

## 1. Canon Hardness Levels (L1–L5)

### 1.1 Problem

The charter's Canon axis (`AGENTS.md` §6) says "the world must not contradict
established truth," and §13 says authored edits *supersede* rather than
overwrite. Today that is enforced coarsely: `validateDelta` does structural and
red-line checks, but it has no notion of *how hard* a given fact is, so it cannot
distinguish "rain is heavy" (atmosphere, freely revisable) from "room 201 is the
mystery's core" (load-bearing canon). The product doc's worked example needs a
fact the player *saw and acted on* (the key is in the player's pocket) to resist
casual contradiction by later prose.

### 1.2 Model

Introduce a five-level hardness scale as an ordinal property on facts:

```text
L1 transient  — atmosphere, not guaranteed to persist (e.g. "rain is heavy")
L2 witnessed  — the player perceived it (e.g. "the key is engraved 201")
L3 acted-on   — the player operated on it (e.g. "the key is in your pocket")
L4 witnessed-by-character — an agent observed it; enters that agent's memory
L5 core canon — seed-level load-bearing truth; never casually revised
```

Hardness is **earned exactly like persistence** (`AGENTS.md` §7): it rises as a
fact is perceived, acted on, and witnessed. L1→L3 is the same gradient as
"ambient → fleshed," applied to facts instead of entities.

### 1.3 Data model

- Add `canonLevel?: 1 | 2 | 3 | 4 | 5` to `LoreEntry` (`src/lib/types.ts`) and to
  a future `facts` record (runtime spec §6.1). Absent = L1 (revisable).
- Add an optional `canonLevel` to the relevant establishing/ mutating deltas
  (`establishLore`, `setObjectState`, `setFlag`, a future `setFact`) in
  `src/lib/world/delta.ts`. The Reactor sets it from evidence: player observed →
  L2, player acted → L3, character witnessed → L4, seed/God → L5.
- The `DeltaLogEntry` already records `source` and `cause`; hardness is derivable
  from `source` + channel but is stored explicitly to keep validation cheap.

### 1.4 Validation rule (WorldKernel)

In `validateDelta`, add a monotonic-canon check:

> A delta that contradicts an existing fact of hardness ≥ L2 is rejected unless
> its own provenance authority is ≥ that hardness. Reactor/character-sourced
> deltas may not silently contradict L3+ facts; only a `god-edited` delta may,
> and doing so triggers the bounded reconcile already specified in `AGENTS.md`
> §13 / runtime spec §4.11.

This is additive: existing structural, spatial, and red-line checks are
unchanged. "Contradiction" is detected conservatively (same entity/field,
opposing value) — consistent with the existing conservative substring red-line
screen, not a semantic model.

### 1.5 Invariant alignment

Hardness never bypasses the gate; it is a *new reason a delta can be rejected*,
exactly parallel to the locked-door causality check. God overrides remain the
only authority that can raise above L3, and they pay the reconcile cost.

## 2. Explicit Thread State (Structured Pressure Lines)

### 2.1 Problem

Pressure lines are charter-level (`AGENTS.md` §9, product spec §6) and the
runtime spec lists `pressureLines` as a WorldState field to add, but today they
exist only implicitly (tension scalar + Director heuristics in
`src/lib/engine/director.ts`). The product doc's "暗线 / Thread State" makes the
missing structure concrete: a thread needs a status, a tension level, what the
player knows, the next plausible reveal, and which entities it binds.

### 2.2 Data model

Add `pressureLines?: PressureLine[]` to `WorldState` (`src/lib/types.ts`):

```ts
interface PressureLine {
  id: string;
  kind: "world" | "character" | "mystery";   // product spec §6
  summary: string;                            // omniscient one-liner (never shown raw)
  status: "latent" | "active" | "cooling" | "resolved";
  tension: number;                            // 0..1
  knownByUser: "none" | "signs" | "partial" | "revealed";
  nextReveal?: string;                        // a plausible diegetic sign, not a script
  linkedEntities: string[];                   // character/object/location ids
}
```

This mirrors the product doc's Thread State fields
(`status` / `tension_level` / `known_by_user` / `next_possible_reveal` /
`linked_*`) under repo naming.

### 2.3 Runtime

- **Generation** (`src/lib/world/generate.ts`, seed contract): seeds emit 2–3
  pressure lines as structured data instead of prose hints.
- **Director** reads `pressureLines`, picks the 1–2 active ones (product spec §6
  pacing: sign every 2–4 turns, visible change every 6–10), and proposes
  advancement as a `setPressureLine` delta — it does **not** mutate the array
  directly (gate invariant).
- **Diegetic surfacing only**: `nextReveal` drives narration/casting; no raw
  meter is ever shown in default play (product spec §6.2).
- **Fairness** (product spec §6.1) is a validation property: a thread may raise
  `knownByUser` to `signs` freely, but a strong consequence delta is rejected if
  `knownByUser === "none"` — the player must have had a chance to perceive it.
- **OffstageReconciler** reads active threads to bound what may plausibly move
  while away (§5).

### 2.4 New delta

`setPressureLine` (runtime spec §6.2 already anticipates it): create/advance a
thread. Validated like any delta; logged with `cause`.

## 3. Belief Graph (Fact × Observer)

### 3.1 Problem

The product doc draws a fact×observer matrix ("钥匙刻着 201 | 老板知道 | 小女孩
可能知道"). The runtime already produces this information — witness-scoped
`Memory` (`kind: "observation" | "reflection" | "hearsay"`, written by
`buildObservations` in `src/lib/memory/observe.ts`) is exactly per-observer
belief. What is missing is a **queryable read model** so the Director, Context
Inspector, and World Atlas can answer "who knows X, and how sure are they?"

### 3.2 Model — derived, not a new source of truth

The Belief Graph is a *projection over existing memory*, not a new authoritative
store. This is critical: the single-source-of-truth invariant (`AGENTS.md` §8)
forbids a parallel belief authority.

```ts
// read model, assembled on demand from Memory + relationships
interface BeliefCell {
  factKey: string;        // canonical fact id / entity+field
  observerId: string;     // character id (or "user")
  stance: "knows" | "believes" | "suspects" | "unaware" | "wrong";
  provenance: Provenance; // witnessed | heard | inferred | ... (runtime spec §4.5)
  confidence: number;     // 0..1
  evidenceLogIds: string[];
}
```

`stance` is computed: a first-hand observation memory → `knows`; a `hearsay`
memory → `believes`/`suspects` (degraded confidence); no memory of a fact the
character could plausibly hold → `unaware`; a memory contradicting canon →
`wrong` (the desirable wrong-belief case).

### 3.3 Runtime

- Assembled by a `buildBeliefView(charId | factKey)` helper alongside the
  existing retrieval in `src/lib/memory/` — it indexes current `Memory` rows; it
  does not write.
- `PerceptionResolver` (runtime spec §4.5) already gates what a character sees;
  the Belief Graph is the *inspection* view of that same gating, so a character
  still never reads raw `WorldState`.
- **Context Inspector** (runtime spec §8) renders it directly ("who knows what,
  who misbelieves what").
- **World Atlas** (product spec §15) renders the player's row only.

### 3.4 Relationship to existing code

Pure addition. `observe.ts`, `reflect.ts`, `gossip.ts` are unchanged in
behavior; the graph reads their output. No memory is duplicated or deleted.

## 4. Observation Provenance / Confidence / Distortion

### 4.1 Problem

Runtime spec §6.4 already targets `provenance` and `confidence` on subjective
records; the product doc adds the *distortion* cases ("角色理解错 / 记错 / 感知被
世界规则扭曲"). The current `Memory` type (`src/lib/types.ts`) has `kind`,
`keywords`, `importance`, `evidence` — but no provenance or confidence, so
hearsay and first-hand sit at the same epistemic weight.

### 4.2 Data model

Extend `Memory` (`src/lib/types.ts`) additively (all optional, back-compatible):

```ts
provenance?: Provenance;      // witnessed | heard | inferred | remembered | revealed | canonized | god-edited
confidence?: number;          // 0..1; hearsay and decayed memories lower
interpretation?: string;      // the observer's reading, may differ from the event
distortion?: "none" | "misheard" | "misremembered" | "rule-warped";
evidenceLogIds?: string[];    // link back to DeltaLogEntry (runtime spec §6.3)
```

### 4.3 Runtime

- `buildObservations` stamps `provenance: "witnessed"`, `confidence: 1` for
  first-hand; `propagateGossip` (`src/lib/memory/gossip.ts`) stamps
  `provenance: "heard"` with degraded `confidence` (it already marks hearsay —
  this makes the degradation explicit and numeric).
- `distortion: "rule-warped"` is the hook for *lawful distortion* (runtime spec
  §4.6): a horror/dream world's `WorldRules.narration` can warp what a character
  records, while the hub keeps the truth.
- Retrieval scoring (`src/lib/memory/retrieve.ts`) folds `confidence` into the
  existing recency × relevance × importance weight, so low-confidence hearsay
  surfaces less forcefully.

## 5. Three-Tier Offstage Simulation Precision

### 5.1 Problem

`evolveWhileAway` (`src/lib/world/offscreen.ts`) reconciles on return but treats
all offstage characters uniformly. The product doc's tiering ("近场高精 / 相关离
场中精 / 远场冻结") matches the runtime spec's OffstageReconciler constraints and
makes the cost bounded.

### 5.2 Model

On return, classify each offstage agent before proposing deltas:

```text
near    (high precision)   — adjacent to current scene OR linked to an active thread
                             → may produce a few concrete, sign-bearing deltas
related (medium precision) — connected to a cooling/latent thread
                             → at most one low-impact stance/position delta
far     (frozen)           — unrelated to current scene or active threads
                             → no deltas; lazily reconciled only when next touched
```

Tier is derived from current scene proximity (`Location.connections`) and
`PressureLine.linkedEntities` (§2). This operationalizes the existing fairness
constraints (no major irreversible event without prior signs; don't introduce
named entities cheaply) as a precision budget.

### 5.3 Runtime

- `buildOffscreenPrompt` (`src/lib/world/offscreen.ts`) gains the tier
  classification and only asks the model to evolve `near`/`related` agents.
- Output still flows through `validateDelta` / `applyDelta` / `deltaLog` with
  `source: "offscreen"` — unchanged gate.
- A `far` agent first touched after a long absence is reconciled at that moment
  (the existing lazy path), not pre-simulated.

## 6. Doorway Library UI + Exit Settlement + Echo Candidates

### 6.1 Problem

Storage is ready (`WorldInstance` with `state` / `updatedAt` / `lastSeenAt` /
`lastTurnSnapshot`; the `deltaLog` table), but there is no Doorway Library page
and no structured "echo" on return. The product doc's *exit settlement* (关门结
算) and *echo candidates* fill the gap charter §3.3 / product spec §3.3 describe.

### 6.2 Exit settlement

On leaving an instance, generate (not on a background sim — a single bounded
pass) a settlement record derived from the turn's `deltaLog` + active threads:

```ts
interface DoorwayEcho {
  instanceId: string;
  trace: string;          // "你把钥匙藏了起来，只有小女孩看见。" (from L3/L4 deltas)
  unresolved: string[];   // from active PressureLine.summary (projected, player-safe)
  candidates: string[];   // plausible return openings (e.g. "老板发现钥匙不见了")
  snapshot: TurnSnapshot; // reuse existing snapshot type
  at: number;
}
```

- `trace` is built from high-hardness deltas (§1) the player caused — it reuses
  `deltaLog`, no new authority.
- `candidates` are *not* committed facts; they are seeds for the
  OffstageReconciler at next entry. They never bypass the gate.

### 6.3 Return open

On re-entry, the OffstageReconciler (§5) consumes one selected echo candidate
plus elapsed time to produce the bounded return deltas, and the Director renders
a return-open beat. This is the "回门不是续聊，而是世界状态推进" promise, mapped
to the existing reconcile path.

### 6.4 UI

- New route `src/app/library/` (mirrors `src/app/page.tsx` feed conventions):
  list opened instances, show `trace` + `unresolved` + last location + tension,
  pin affordance, light return hint. No aggressive notifications (charter §3.3).
- New helper `src/lib/world/echo.ts` builds `DoorwayEcho`; persisted via the
  existing repository layer (`src/lib/storage/`).

## 7. Product-Funnel Metrics (Return-Rate North Star)

### 7.1 Problem

`TasteEvent` (`src/lib/types.ts`: `enter | dwell | author | skip`) feeds ranking
but is not a product funnel. The product doc's metric table names **return-rate
(回门率)** as the north star: the signal that a door became a private world, not
a chat.

### 7.2 Model

Extend the taste-event stream (local-first, never leaves the browser; never
reaches characters) with funnel stages:

```text
card-dwell → open-door → first-action → ten-minute-retain
           → first-consequence → return → pin
```

- Reuse `TasteEvent.kind` where it already maps (`enter` = open-door,
  `dwell` = card-dwell, `author`, `skip`); add `first-action`,
  `first-consequence`, `return`, `pin`.
- `return` is computed from `WorldInstance.lastSeenAt` gaps + re-entry.
- `first-consequence` fires when the first player-caused L2+ delta (§1) commits —
  tying the metric to real world change, not message count.

### 7.3 Surfacing

Metrics are a local instrumentation surface (Studio/debug), consistent with
Context Inspector. No server analytics; aggregate counts only, in IndexedDB.

## 8. Landing Order And Dependencies

Each slice is independently mergeable and rides the existing gate. Suggested
order (smallest blast radius first):

1. **Observation fields (§4)** — additive optional fields on `Memory`; no
   behavior change until consumed. Unblocks Belief Graph.
2. **Canon hardness (§1)** — additive `canonLevel` + one validation rule.
3. **Thread State (§2)** — `pressureLines` on `WorldState` + `setPressureLine`
   delta; Director reads it. Unblocks offstage tiering and echo.
4. **Three-tier offstage (§5)** — depends on §2 (`linkedEntities`).
5. **Belief Graph (§3)** — read model over §4; no writes.
6. **Doorway Library + echo (§6)** — depends on §1 (hardness for trace) and §2
   (unresolved threads).
7. **Metrics (§7)** — depends on §1 (`first-consequence`) and §6 (`return`).

Mapping to the runtime spec's implementation slices (§11 there): §1–§2 extend
**Slice 1 (WorldKernel)**; §3–§4 extend **Slice 5 (Memory/Belief Upgrade)**;
§2/§5 extend **Slice 6 (Offstage and Pressure Lines)**; §3 inspection +
§7 extend **Slice 7 (Studio Instrumentation)**.

## 9. Verification Strategy (When Implemented)

Per the runtime spec's testing strategy (§10 there), add module-boundary tests:

- hardness: a Reactor delta contradicting an L3 fact is rejected; a `god-edited`
  one commits and triggers reconcile.
- thread fairness: a strong-consequence delta on a `knownByUser: "none"` thread
  is rejected.
- belief graph: `buildBeliefView` returns `unaware` for an absent character and
  `wrong` for a contradicted memory; it performs no writes.
- observation: hearsay carries lower `confidence` than first-hand and ranks
  lower in retrieval.
- offstage tiers: a `far` agent produces zero deltas on return.
- echo: `trace` is built only from player-caused L2+ deltas; `candidates` are
  never written to `WorldState`.

All of the above are pure-function or repository tests under the existing Vitest
+ fake-indexeddb setup. No new runtime is introduced; `npm test`,
`npm run build`, `npm run typecheck` remain the gates.
