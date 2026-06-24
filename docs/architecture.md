# Anywhere Door — Architecture

> **Status: the ideal world-runtime.** The target architecture derived from the
> product, described as it *should* be — not as a migration from current code.
> It contains **no code symbols, no file paths, and no "already implemented"**;
> shape sketches are design intent, not the present type system. Conflicts
> resolve upward to `AGENTS.md`, `first-principles.md`, and `product-design.md`.
> The gap between this and the code, and the order of getting there, live only in
> `current-state.md` / `roadmap.md`.

## 1. Goal

Make the product promise mechanically true:

> A door opens into a real world. Text is only the interaction surface.

In engineering terms the world is **not** the model's response. The world is:

```text
immutable rules + a validated mutable state (the hub) + an append-only log of
validated changes + each agent's subjective records (projections)
```

The model may render prose, interpret input, decide character behavior, and
propose changes. It must never directly own durable reality (charter §15).

## 2. Topology: one hub, two arrows

The architecture is the single axiom (charter §3) made concrete. One omniscient
**hub** holds the one true world; everything else is a partial spoke. The runtime
is exactly two arrows around the hub:

- **Perception (outward):** the hub computes each agent's subjective projection.
  No agent reads raw state.
- **Agency (inward):** an agent pulls information (observe/probe/interact) and
  proposes change (act); both return to the hub for adjudication.

Two structural choke points enforce the axiom and must each exist in exactly one
place:

- **The write gate** — the sole path that commits durable change.
- **The perception boundary** — the sole path that feeds a character its context.

Every module below is defined relative to these two choke points.

## 3. Runtime Modules

A **turn-scoped, layered runtime**: the world advances when the user interacts,
in a bounded sequence; on return it lazily reconciles. There is no always-running
server simulation by default (rationale: per-turn cost, charter §15). A future
Living World Mode can reuse these modules with a more proactive scheduler.

- **TurnOrchestrator** — owns one user interaction: acquire the instance lock,
  capture a rollback snapshot, classify input, invoke modules in order, commit,
  restore on failure, release the lock.
- **InputRouter** — classifies input into channels: speech, action, observe
  (pull), story-intent, director-note, god-edit. Free text stays primary; the
  runtime models the distinction even before UI exposes it.
- **WriteGate** — the **sole writer of durable state**. Validates each proposed
  change against immutable rules (existence, spatial continuity, canon hardness,
  red lines, selected physical facts), applies valid ones immutably, appends each
  to the log, and records rejected proposals with reasons. Every durable change
  from Reactor, Director, offstage logic, God Mode, and Materializer passes
  through it.
- **ContextAssembler** — builds bounded, typed context packs per role (character,
  director, reactor, offstage, materializer, taste, inspector). It decides *what*
  a role may see — facts, memories, lore, events — under a token budget, with
  activation/recursion/cooldown discipline; it is not a prompt-concatenation
  helper.
- **PerceptionResolver** — the **single perception boundary**. Builds each
  character's subjective projection from mechanical fact (present characters,
  visible objects, own memory) plus directed salience (§6). Out-of-world channels
  never enter here (charter §9).
- **Director** — the omniscient dramatic orchestrator; *not* a character. Chooses
  active pressure lines, casts active vs. ambient characters, decides whether to
  surface a latent entity and how, frames new detail as world-native, sets pacing
  and narration density, and honors Director Notes / Scene Contract without
  leaking them. It writes only through narration, proposed changes, and casting
  decisions — never bypassing the gate. It **may be a computing agent** (§9).
- **AgentRuntime** — runs the capped set of active character agents for the turn
  (`perceive → retrieve → decide intent → speak/act → record observation`). Not
  every present person is an agent every turn; the Director casts who matters.
  Characters emit prose, may reveal/conceal/lie, and update private memory after
  the turn; they may not mutate state, read omniscient state, or read out-of-world
  channels.
- **Reactor** — the objective consequence translator: reads the turn trace and
  proposes the changes it implies. Evidence-first (commit only what happened,
  preserve uncertainty as belief, prefer small changes, attach the prose evidence
  each change rests on). Runs when the Director's structural-change signal fires;
  high-consequence changes get a second check.
- **Materializer** — turns earned ambient detail into structured entities along
  the lifecycle (§13). The world is the source; new entities are never framed as
  entering through the player's door.
- **MemoryBeliefSystem** — owns subjective records: observation, memory, hearsay,
  belief, hypothesis, secret, reflection, relationship evidence. Observations are
  witness-scoped; hearsay spreads one hop with degradation; memory decays in
  retrieval strength but keeps its evidence; belief may diverge from canon.
- **OffstageReconciler** — Consequence Mode: on return, reconciles bounded
  plausible change from elapsed time, rules, active threads, and log evidence, at
  three precision tiers (§7.5). Shares its repair machinery with God edits (§10).
- **TasteSeedRuntime** — world generation, **outside** the world instance. Learns
  behavior sequences (not tags), generates with exploit/bridge/explore balance.
  Taste never leaks into character knowledge.
- **StudioRuntime** — power-user surfaces (Director Notes, Scene Contract,
  God/Studio Mode, World Atlas, Context Inspector, Timeline Forks, Seed Studio),
  channel-isolated, editing the private branch through validated changes.

## 4. Full Turn Flow

```text
acquire instance lock
-> load instance, seed, recent messages, memory cursors
-> capture rollback snapshot
-> classify input channel
-> apply explicit user / god changes through the WriteGate
-> run OffstageReconciler if returning
-> Materializer fleshes anything needed before perception
-> Director selects pressure, casts active vs. ambient, decides surfacing
-> PerceptionResolver builds each active character's projection
-> AgentRuntime runs active characters
-> Director renders ambient cast / narration beat
-> Reactor proposes objective changes
-> WriteGate validates, applies, logs them
-> MemoryBeliefSystem writes observations, beliefs, hearsay, reflections
-> Materializer post-pass fleshes newly earned entities
-> persist instance / messages / memories / log
-> release lock
```

### 4.1 Fast path vs. slow path

Because a turn is several serial model calls on the user's key, split it by what
must finish before the user reads the first prose:

- **Fast path (blocks first token):** Director casting + selected characters
  streaming + narration — first token quickly.
- **Slow path (during/after streaming):** Reactor changes, memory/hearsay writes,
  post-pass flesh. Structural truth may settle slightly later, **as long as it
  commits before the next turn builds context.**
- **Commit barrier:** the instance lock enforces one commit at a time. The user
  may *read* immediately but cannot *commit* the next turn until this turn's
  structural settle completes (usually shorter than reading time).
- **Depth tiers (fast / standard / deep)** scale the slow path (active-agent cap,
  memory/reflection frequency, flesh threshold, agentic-compute depth). Ship one
  tier first; tiers are the later cost valve.

### 4.2 Rollback and regenerate

On a fatal error, restore the snapshot, drop messages/memories/changes created
after it, release the lock, surface the error diegetically where possible.
Regenerate restores the last-turn snapshot and reruns the same input with the
same channel metadata, ensuring the old branch's messages, memories, and changes
do not leak.

## 5. Data Model Direction

Conceptual shape, design intent. Types evolve toward this; the present type system
is described in `current-state.md`.

### 5.1 The world

```text
WorldRules   (immutable after creation)
WorldState   (mutable snapshot — the hub)
ChangeLog    (append-only, every validated change)
Subjective records (per-agent projections / memory)
```

**WorldRules** carries, beyond physics / setting / red lines:

- **narration rule** — the truth→prose transduction: faithful by default, with
  optional lawful distortion for horror/dream/unreliable worlds (§8).
- **rule-skills (optional)** — executable deterministic rules the agentic Director
  runs for precise adjudication (combat, scoring, puzzles, small economies; §9).

**WorldState** carries the local scene pointer, time, locations, objects,
**instance-private characters** (§13.3), roster, flags, a tension scalar,
relationships (a signed affinity ledger with decaying evidence), lore, and:

- **pressure lines** — structured threads (§7.2);
- **facts** — canonical facts carrying a hardness tier (§7.1);
- **offstage** — per offstage agent, with a derived precision tier (§7.5);
- **beliefs** — a *read view* (fact × observer) derived from memory, not a second
  source of truth (§7.3);
- **timeline / branch** metadata for forks.

The player's in-world identity is an ordinary roster entity inside WorldState; the
world knows only what that identity reveals in-world. **Cross-world Door Passport /
persona data lives in the taste layer outside the instance, never in WorldState** —
so, like the Taste Chronicle, it structurally cannot reach a character (it is never
in anything the perception boundary reads). The instance only records which persona
is bound to it, not the persona's cross-world history.

### 5.2 Changes (the typed mutation vocabulary)

Every durable mutation is a typed change validated and logged. The vocabulary
grows only when a detail must **persist, be validated, or affect future
behavior** — never merely because prose wants color. Conceptual families:

- **movement / scene** — move a character, move the camera/scene, move an object;
- **state** — set object state, set a lock, set a flag, advance time, set a
  condition;
- **establish (on-demand growth)** — establish a location, object, lore entry, or
  character; later, flesh any of them;
- **social / mind** — adjust a relationship (with a reason as evidence), set a
  belief, secret, or goal;
- **thread** — create/advance a pressure line;
- **fact** — assert a fact at a hardness tier;
- **authoring** — fork a timeline, retire an entity, ownership transfer.

### 5.3 The change log

The log is the historical truth of committed objective change. Each entry records
source role, cause input, related message ids, affected entity ids, witness /
visibility metadata, branch id, game time, real time, and — for rejected
proposals — the reason. Memory and belief point back to log entries as evidence;
delayed callbacks, reputation, offstage reconciliation, and timeline tools all
read it.

### 5.4 Subjective records

A memory is not a forever-flat text blob. Each record carries: owner, kind, text,
referenced entities, **provenance** (witnessed / heard / inferred / remembered /
revealed / canonized / authored), **confidence**, **interpretation** (the
observer's reading, which may differ from the event), **perception quality**
(full / partial / glimpsed), **distortion** (none / misheard / misremembered /
rule-warped), importance, timestamps, evidence links, and branch id. These four
cases the product requires — a character sees only part, misunderstands,
misremembers, or perceives a rule-warped version — are all expressed through these
fields, not a separate unreliable-narrator code path.

## 6. Perception Production

The landing point of "the hub tells each one what they perceive":

- **Fact layer** = a deterministic filter of state (present characters, visible
  objects, own memory). Structurally cannot diverge, and cheap.
- **Directed salience** = the Director adjusts *attention* on top (foreground a
  pressure-line sign, "you only now notice someone in the corner") but **never
  invents fact**.

Rejected alternative: the Director generating each perception — that makes
perception itself generative, risks re-introducing the divergence the hub exists
to kill, and is expensive per character. **Facts grounded, framing free.**

## 7. The Seven Living-World Mechanics

These are the mechanics the product form requires beyond a plain turn loop. Each
obeys the gate, the single perception boundary, and the append-only invariant.

### 7.1 Canon hardness (three tiers)

Facts carry an ordinal hardness, earned like persistence:

```text
ambient   — atmosphere, revisable (absent tier defaults here)
anchored  — the player witnessed or acted on it
core      — seed-level load-bearing canon, or an authored (God) fact
```

**Validation rule (at the gate):** a change that contradicts a fact harder than
its own authority is rejected. Reactor/character-sourced changes may not contradict
an *anchored* fact; only an *authored* change may revise anchored/core, and it
pays the witness-scoped reconcile (§10). Contradiction is detected conservatively
(same entity/field, opposing value), consistent with the conservative red-line
screen — not a semantic model. Hardness never bypasses the gate; it is a new
*reason a change can be rejected*, parallel to the locked-door causality check.

### 7.2 Thread state (structured pressure lines)

A pressure line is structured state the Director reads and advances, carrying:
id; kind (world / character / mystery); an omniscient one-line summary (never
shown raw); status (latent / active / cooling / resolved); a closeness-to-change
level; how much the player knows (none / signs / partial / revealed); a plausible
next diegetic sign (not a script); and the entities it binds.

- **Generation:** seeds emit 2–3 lines as structured data, not prose hints.
- **Advancement:** the Director picks the 1–2 active lines and advances them only
  through a validated change — it never mutates the thread array directly.
- **Surfacing:** diegetic only; no raw meter in default play.
- **Fairness as validation:** a line may raise the player's awareness to "signs"
  freely, but a strong consequence is rejected while the player knows nothing.

### 7.3 Belief graph (fact × observer, a read view)

A *projection over existing witness-scoped memory*, not a parallel authority
(that would violate the single-source-of-truth axiom). For a fact/observer it
yields a stance — knows / believes / suspects / unaware / wrong — with provenance,
confidence, and evidence links. Stance is *computed*: a first-hand observation →
knows; hearsay → believes/suspects (degraded confidence); no plausible memory →
unaware; a memory contradicting canon → wrong (the desirable case). It is
assembled on demand and performs no writes; it is the inspection face of the same
gating the PerceptionResolver already does. **Performance:** assembled on demand
by default; if long worlds make it costly, materialize an index as a cache — never
as a second truth.

### 7.4 Observation provenance / confidence / distortion

The fields of §5.4 made active: first-hand observations are stamped witnessed /
full confidence; hearsay is stamped heard with degraded confidence; rule-warped
distortion is the hook for lawful distortion (§8). Retrieval scoring folds
confidence into recency × relevance × importance, so low-confidence hearsay
surfaces less forcefully.

### 7.5 Three-tier offstage precision

On return, classify each offstage agent before proposing any change:

```text
near    (high)   — adjacent to the scene OR linked to an active thread
                   -> a few concrete, sign-bearing changes
related (medium) — tied to a cooling/latent thread
                   -> at most one low-impact stance/position change
far     (frozen) — unrelated to the scene or active threads
                   -> no changes; reconciled lazily only when next touched
```

Tier derives from scene proximity and thread links. This operationalizes the
fairness constraints (no major irreversible event without prior signs; don't mint
named entities cheaply) as a precision budget. All output still flows through the
gate.

### 7.6 Doorway echo / exit settlement

On leaving, a single bounded pass (not a background sim) derives a settlement
record from the turn's change log + active threads:

- **trace** — built from the hardest facts the player caused (anchored+);
- **unresolved** — active thread summaries, projected into player-safe language;
- **candidates** — plausible return openings; **not committed facts** — seeds for
  the OffstageReconciler at next entry, never bypassing the gate.

On re-entry the reconciler consumes one candidate plus elapsed time to produce the
return-open beat. A return *advances* the world, it does not continue the last
chat line.

### 7.7 Funnel metrics

Extend the local taste-event stream into a funnel: `card-dwell → open-door →
first-action → ten-minute-retain → first-consequence → return → pin`.
*first-consequence* fires when the first player-caused anchored fact commits
(tied to real world change, not message count); *return* is computed from
last-seen gaps + re-entry. Local-first instrumentation only: aggregate counts in
the browser, never server analytics, never reaching characters.

## 8. Narration as Transduction

User-facing prose is **generated from the hub's fact snapshot**, so grounding is
**biased structural** — the snapshot is the source material, not free prose
policed afterward. But generating *from* the truth does not stop the model from
*adding* unsupported detail, which is exactly what the guard exists to catch.
Faithful is the default transduction; lawful distortion is a rules-level property
of the world. The hub always holds the truth underneath, so a *caught* slip is
recoverable, not corruption.

**The consistency guard — conservative and best-effort.** It is deliberately *not*
a semantic re-derivation of the world (the same restraint as the red-line and
canon-contradiction screens, §7.1). It screens the cheap, high-value cases: prose
that **names an entity absent from the snapshot**, asserts an **object / location /
state the snapshot contradicts**, or attributes knowledge to a character outside
its projection. On a hit it regenerates the beat or drops the offending clause.
It is honestly **best-effort**: subtle slips — a plausible-but-unstated motive, an
invented background detail that mints no entity — can pass. So the claim is
*biased grounding + a backstop*, not a proof of non-divergence; grounding comes
from generating-from-truth, never from the guard. Character voices are orthogonal:
a partial perceiver may lie or err; such claims route to belief or a recorded lie,
never silently into state.

## 9. The Agentic Director

The Director may be a tool-using agent that runs the world's rules over the truth:

- **Compute on demand (inward):** when a world needs precise adjudication, it
  computes deterministically (code / a ledger / a rule-skill) and proposes the
  result as validated changes; otherwise it degrades to plain narration at no
  cost.
- **Rule-skills** are per-world, expressed as reusable executable skills and
  carried in the seed contract.
- **Gate invariant holds:** computed results are proposals committed by the
  WriteGate; the agent never bypasses validation.

**Authoring, validation, and routing.** A rule-skill is part of the seed contract,
authored at creation time (by the seed generator or a creator in Seed Studio), not
improvised per turn. Two properties keep an unsound skill bounded: (1) its outputs
are *proposals* — they commit only through the WriteGate, so a buggy skill can be
rejected but can never corrupt state directly; (2) skills run sandboxed and
deterministically, so the same inputs reproduce and are inspectable. Routing
("does this turn need the combat skill?") reuses the Director's structural-change
signal, biased toward running the skill when a rule-relevant action is detected; a
misroute degrades to narration, never to silent miscomputation. Skill *soundness*
itself (is the combat math fair?) is a creation-time concern surfaced in Seed
Studio preview, not a runtime guarantee — the runtime only guarantees that whatever
a skill proposes still passes the gate.

This moves precise **game-y** worlds inside coverage (charter §16). Large-scale
numeric simulation stays out on per-turn-budget grounds, not architecture.

## 10. God Edit Reconcile (witness-scoped supersession)

A God hard-edit is the widest legal proposal, still validated and auditable:

1. commit through the WriteGate (authored provenance);
2. trigger a consistency repair that aligns contradicted memories / beliefs /
   relationship evidence;
3. **supersede, never delete** (append-only): mark old records superseded + append
   the overriding record, so an inspector can show "rewritten on turn N" and a
   fork can return to before the retcon;
4. **cascade depth = witness scope:** align the named entities + everyone who
   witnessed the now-contradicted fact; deeper second-hand hearsay is left to
   natural decay. Consistency is guarded exactly at the layer that could catch the
   world out, so the cost is naturally bounded.

The same repair machinery serves the OffstageReconciler — authored edits and
offstage consequences are the same bounded reconcile.

## 11. Concurrency and Locks

Even a single-player local app has real concurrency to discipline: **rapid
re-submit** (the user fires the next turn before this turn's slow path commits),
**the same instance open in multiple tabs**, and **regenerate / fork / god-edit
issued mid-stream** while a turn is still settling. An instance operation lock
handles all three: only one turn commits to an instance at a time; each long model
operation has an id; stale results are ignored; a timeout releases the lock safely;
regeneration/fork/god-edit invalidate in-flight operations. Without this,
overlapping Director/Reactor/character results contaminate the same private branch.

## 12. Error Handling

Invalid changes are rejected, not silently applied; recoverable parse failures
degrade to no-op or narration-only; fatal turn failures restore snapshots; every
rejected durable proposal is inspectable in Studio. Examples: Reactor returns
prose instead of structured output → parse to an empty change list and continue;
a flesh pass fails → keep the gist, do not block the turn; offstage reconciliation
fails → skip it; a God edit proposes invalid state → reject with an explicit
reason; a commit race is detected → ignore the stale operation and refresh.

## 13. Entity Genesis and Surfacing

The hardest parts of growing the world are (1) framing every appearance as *the
world detailing itself*, never an outside import, and (2) bounding per-turn cost
as the cast grows.

### 13.1 The Director is the per-turn caster

Tension is an **input, never an on/off gate**. The Director makes two casting
decisions at turn start:

- **Active-agent set.** A hard cap (≈4) of agents run the full
  intent→speak→memory loop. When present characters exceed the cap, the Director
  (omniscient) designates who is active; the rest are **ambient cast** — narrated
  as prose, no agent loop. A bustling market is not thirty agents.
- **Surfacing a latent entity.** The Director decides *whether* to surface now,
  *whom* (an already-named latent member, or a newly-detailed one), and *how* —
  world-consistently, never through the player's door: already-present-but-unnoticed,
  from an adjacent space via existing connections, or through the world's own
  egress. The surfaced character may join the same turn.

### 13.2 On-demand character creation

A new persistent character is established through the same establish→validate→apply
path as locations/objects/lore, with a minimal stub (id, name, role, optional
goal, location). Proposable by the Reactor (the fiction named a persistent person)
and the Director (proactive surfacing).

### 13.3 Instance-private characters

The seed's characters are frozen and shared across all players, so a world-spawned
character cannot live in the seed. Instance-private characters live in WorldState
and grow on demand; present-character lookup is seed ∪ instance. This makes
identity stability free: instance state persists, so a spawned character's
definition and per-character memories survive. **Spawned characters and their
memories are never deleted** — archival flips a presence flag only; reload is the
same person.

### 13.4 Lazy two-tier mind generation

A stub (name + role + goal) is near-free. The expensive flesh-out (full
personality + initial memory) fires only when the stub is first cast to speak,
hidden behind the surfacing narration. No pre-generated "wings" pool. A new
character's initial memory is minimal (a few identity/backstory memories + a goal)
with **no shared history with the player** — asymmetry from birth; the rest
accretes through play.

### 13.5 Hardness tracks materialization

Crystallization (stub→fleshed) and canon hardness (§7.1) are the same "earn your
persistence" gradient applied to entities and to facts, and move together: a
glimpsed ambient detail is ambient hardness and no entity; the moment the player
engages an entity, the facts establishing it become anchored and the entity earns
a fleshed record; a fact a character witnesses enters that character's memory and
feeds the belief graph; seed-level load-bearing entities are core from birth.
Archival never lowers hardness.

## 14. Testing Strategy

Tests live at module boundaries (conceptual): the WriteGate validates/applies/logs
and records rejection reasons; the PerceptionResolver never leaks private/remote/
omniscient facts or out-of-world channels into a projection; the Director respects
the active-agent cap and channel isolation; the Reactor proposes evidence-first
and rejects invalid proposals; the MemoryBeliefSystem keeps witness scope, hearsay
degradation, and belief divergence; the OffstageReconciler stays conservative and
fair and produces zero changes for a *far* agent; timeline regenerate/fork leaks no
old-branch state; canon hardness rejects a low-authority contradiction of an
anchored fact and admits an authored one with reconcile; thread fairness rejects a
strong consequence while the player knows nothing; the belief graph performs no
writes; an echo trace is built only from player-caused anchored+ facts and its
candidates are never written to state.

## 15. Locked Architectural Decisions

1. Default runtime is turn-scoped and interaction-driven; Consequence Mode is
   default, Living World Mode is later.
2. One write gate is the only durable-state writer.
3. One perception boundary is the only thing that feeds a character; out-of-world
   channels never cross it.
4. Characters never read raw state; character output is prose; the Reactor/gate
   commit objective change.
5. Director and Reactor are omniscient orchestration, not characters.
6. Active agents are capped; ambient cast stays ambient unless earned.
7. Materialization is one mechanism shared across locations, objects, lore,
   characters, and strange agents; the world is the source.
8. Canon hardness has three tiers; finer gradations are derived, not load-bearing.
9. Narration is transduction with a cheap guard.
10. The Director may compute deterministically but never bypasses the gate.
11. Authored edits reconcile by witness scope and supersede, never delete.
12. Taste shapes new doors, never in-world character knowledge.
13. Record = snapshot + append-only log; history is never deleted.
