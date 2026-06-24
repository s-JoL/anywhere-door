# Anywhere Door World Runtime Technical Design

Date: 2026-06-24

Status: technical design locked as the v1 development baseline.

Related authority:

1. `AGENTS.md` defines the charter and non-negotiable product/technical
   invariants.
2. `docs/superpowers/specs/2026-06-24-overall-product-design.md` defines the
   product form.
3. This document defines the target world-runtime architecture.
4. `docs/DESIGN.md` describes the current implementation state.
5. `docs/ROADMAP.md` stages the gap from current code to this target.

## 1. Goal

The runtime must make the product promise mechanically true:

> A door opens into a real world. Text is only the interaction surface.

In engineering terms, the world is not the assistant response. The world is:

```text
WorldRules + WorldState + validated Delta log + subjective agent records
```

The LLM may render prose, interpret user input, decide character behavior, and
propose changes. It must not directly own durable reality.

## 2. Chosen Architecture

The chosen architecture is a **turn-scoped layered runtime**.

Do not build an always-running server simulation as the default. The world
advances when the user interacts, and when the user returns the runtime lazily
reconciles plausible offstage consequences.

This keeps Anywhere Door aligned with:

- local-first storage
- BYO-key cost control
- private per-user world branches
- Consequence Mode as the default time mode
- deep character POV without simulating every ambient person

Future Living World Mode can reuse the same modules with a more proactive
scheduler, but it is not the default product architecture.

## 3. Reference Projects Read

This design is based on direct code reading of five reference projects cloned
for research:

- SillyTavern: world info activation, recursion, budgets, sticky/cooldown, and
  group chat mechanics. Useful for context assembly, not for world reality.
- Generative Agents: `perceive -> retrieve -> plan -> reflect -> execute`,
  associative memory, spatial memory, attention bandwidth, retention, and
  reflection. Useful for subjective cognition, not for default continuous
  simulation.
- TextWorld: facts, actions, preconditions/postconditions, and the separation
  between observable feedback and privileged state. Useful for hard causality
  validation.
- AI Town: tick loop, pending operations, conversation state machine, and
  `inProgressOperation` locks. Useful for scheduling and preventing overlapping
  agent writes.
- Voyager: curriculum, action generation, environment execution, critic
  verification, and reusable skill library. Useful for Director goals, Reactor
  critique, and future reusable expansion patterns.

The runtime should borrow primitives, not copy any project's ontology.

## 4. Runtime Modules

### 4.1 TurnOrchestrator

Owns the lifecycle of a single user interaction.

Responsibilities:

- acquire an instance-level turn lock
- capture a rollback snapshot
- classify user input channel
- invoke runtime modules in order
- commit messages, deltas, memories, and metadata
- restore snapshot on failure
- release the lock

The current `runTurn` already does much of this in one file. The target is to
split it into modules without changing the core semantics.

### 4.2 InputRouter

Classifies input into channels:

- `speech`: what the player says in-world
- `action`: what the player does in-world
- `observe`: what the player tries to perceive
- `storyIntent`: high-level user intent that may guide pacing
- `directorNote`: private steering, not character knowledge
- `godEdit`: direct private-instance edit through validated deltas

Free text remains primary. Explicit UI controls can later make the channel
visible, but the runtime should model the distinction now.

### 4.3 WorldKernel

The sole writer of durable world state.

Responsibilities:

- validate deltas against immutable `WorldRules`
- enforce existence, spatial continuity, canon, red lines, and selected physical
  facts
- apply valid deltas immutably
- append every committed delta to `deltaLog`
- reject or record invalid proposals with reasons

Target interface:

```ts
type CommitResult = {
  state: WorldState;
  committed: DeltaLogEntry[];
  rejected: RejectedDelta[];
};

commitDeltas(input: {
  instanceId: string;
  turn: number;
  state: WorldState;
  rules: WorldRules;
  source: DeltaSource;
  cause: string;
  deltas: Delta[];
}): Promise<CommitResult>;
```

All durable changes from Reactor, Director, OffstageReconciler, God Mode, and
Materializer go through this module.

### 4.4 ContextAssembler

Builds bounded context packs for each runtime role.

It should not be a single prompt-stuffing helper. It should produce typed
context packs:

- `CharacterContext`
- `DirectorContext`
- `ReactorContext`
- `OffstageContext`
- `MaterializerContext`
- `TasteContext`
- `InspectorContext`

Borrow from SillyTavern's world-info mechanics:

- token budget
- scan depth
- recursive activation
- minimum activation when needed
- sticky entries
- cooldown and delay
- inclusion groups

But adapt them to structured packs. Context activation should decide what facts,
memories, lore, and events a role may see, not simply concatenate text.

### 4.5 PerceptionResolver

Builds each character's subjective projection.

Characters must never read raw `WorldState`. They receive only what they can
plausibly perceive, remember, infer, or believe.

Target `SubjectiveContext` fields:

```ts
type SubjectiveContext = {
  self: Character;
  visibleScene: VisibleScene;
  audibleEvents: PerceivedEvent[];
  touchableObjects: WorldObjectView[];
  ownMemories: Memory[];
  recentObservations: Memory[];
  beliefs: Belief[];
  secrets: Secret[];
  goals: Goal[];
  relationships: RelationshipView[];
  knownLore: LoreEntry[];
  rumors: Rumor[];
  hypotheses: Hypothesis[];
};
```

Every information item should keep provenance:

```ts
type Provenance =
  | "witnessed"
  | "heard"
  | "inferred"
  | "remembered"
  | "revealed"
  | "canonized"
  | "god-edited";
```

Wrong belief is allowed. Omniscient correction is not.

**Projection production: mechanical facts, directed salience.** The factual layer
of a `SubjectiveContext` is a deterministic filter of `WorldState` (present
characters, visible objects, own memories) — consistent by construction and cheap,
so partial perceivers cannot diverge. The Director may then adjust *salience and
attention* on top (foreground a pressure-line sign, surface a previously-unnoticed
presence) but must not invent facts. Facts are grounded; framing and attention are
free.

### 4.6 Director

The omniscient dramatic orchestrator. It is not a character.

Responsibilities:

- choose active pressure lines
- choose active character agents for this turn
- keep other on-stage entities ambient
- decide whether to surface latent entities
- frame new details as world-native
- decide pacing beats and narration density
- honor Director Notes and Scene Contract without leaking them to characters

The Director can see the whole world, but it should write only through:

- Director narration messages
- proposed deltas committed by WorldKernel
- casting decisions consumed by AgentRuntime

It should not bypass validation.

**Narration as transduction.** The user-facing prose is not free text policed against
state; it is the world **re-telling its own truth through its rules**. The hub's fact
snapshot is the *source material* the narration is generated from, so grounding is
structural — there is no separate post-check. Faithful narration is the default
transduction; worlds may define *lawful distortion* (horror sanity effects, dream
logic, a world that hides a death from the player) as a `WorldRules`-level property
(§6.1). The hub always holds the real truth underneath, so distortion is recoverable
and never a true divergence; an occasional LLM slip is a one-off cosmetic blemish, not
state corruption. Character voices are an orthogonal layer: partial perceivers may lie
or err, routed to belief/lie by the Reactor (§4.7), never silently into state.

**Agentic Director (compute on demand).** The Director need not be a single prompt; it
may be a tool-using agent that runs the world's rules over the truth. When a world
needs precise adjudication (combat resolution, scoring, puzzle logic, a small economy)
it computes deterministically (code/ledger) and proposes the result as deltas; when it
does not, it degrades to pure narration at no extra cost. Per-world rules may be
expressed as reusable executable skills (Voyager-style). The gate invariant holds:
computed results are proposals committed by WorldKernel — the agent never bypasses
validation. This is what moves precise game-y worlds inside coverage while large-scale
numeric simulation stays out on per-turn-budget grounds, not architecture.

**Reactor gating.** The Director also emits a per-turn signal of whether structural
change likely occurred, gating whether the Reactor runs. It is already running and
omniscient, so this adds no extra call. The signal is **biased toward running**:
under-committing — the world forgetting a consequence — is the cardinal failure, so
when uncertain, run.

### 4.7 AgentRuntime

Runs selected character agents for the current turn.

Not every person in the scene is an agent every turn. Use a hard cap, roughly
`maxActiveAgents = 4`, and let the Director choose who matters now.

Per active character:

```text
perceive -> retrieve -> decide intent -> speak/act -> record observation
```

The Generative Agents sequence is preserved as cognition, but invoked only when
dramatically and locally relevant.

Characters may:

- speak prose
- attempt actions in prose
- reveal or conceal information
- update private memory/belief after the turn

Characters may not:

- directly mutate `WorldState`
- read omniscient state
- read Director Notes
- read cross-world Taste Chronicle
- know God edits unless canonized or perceived

A character may still *claim* a false hard fact (a lie, a misremembering). Such
claims are never silently written to `WorldState`; the Reactor routes them to that
character's belief or to a recorded lie. This is the same divergence guard as the
single source of truth (see `AGENTS.md` §8): a partial perceiver may not author
reality merely by asserting it.

### 4.8 Reactor

The objective consequence translator.

Inputs:

- recent turn trace
- current state snapshot
- world rules
- known object/location/character IDs
- pressure context
- user channel metadata

Output:

```ts
Delta[]
```

Reactor should be evidence-first:

- commit only what happened, not what was merely planned
- preserve uncertainty as belief/memory, not canon
- create structured entities only when they earned persistence
- prefer small deltas over sweeping rewrites
- include relationship reasons as evidence

The Reactor is inspired by Voyager's critic loop: it should not only generate
changes but make them checkable. Each proposed delta should carry the prose
evidence it rests on, and rejected deltas should record their reason (for Context
Inspector). The Reactor runs only when the Director's structural-change signal
fires (§4.6); high-consequence deltas (large relationship swings, locking,
character birth/death) may warrant a second check, while low-consequence ones pass
liberally.

### 4.9 Materializer

Turns earned ambient details into structured entities.

Entity lifecycle:

```text
ambient
-> hinted
-> named stub
-> fleshed structured entity
-> agentic entity
-> offstage / summarized
-> retired
```

Materialization triggers:

- player directly engages the entity
- the entity recurs
- the entity has causal power
- the entity carries private knowledge, belief, or agenda
- the entity connects to a pressure line

All entity types share the same principle:

- locations: `establishLocation`, `fleshLocation`
- objects: `establishObject`, future `fleshObject`
- lore: `establishLore`
- characters: `establishCharacter`, future `fleshCharacter`
- strange agents: character-agent ontology if they have private POV

The world is the source. New entities are never framed as entering through the
player's door.

### 4.10 MemoryBeliefSystem

Owns subjective records.

Records should distinguish:

- objective event reference
- observation
- memory
- hearsay
- belief
- hypothesis
- secret
- reflection
- relationship evidence

Rules:

- observations are witness-scoped
- hearsay spreads one hop with degradation by default
- memories can decay in retrieval strength but keep evidence
- belief can diverge from canon
- reflection synthesizes higher-level thoughts with evidence

This is where social causality becomes visible:

> Not everyone knows what happened. Not everyone agrees what it means.

### 4.11 OffstageReconciler

Handles Consequence Mode.

When the user returns after time away:

- no background simulation has been running
- the reconciler reads elapsed time, world rules, active pressure lines, offstage
  agents, and delta log evidence
- it proposes small plausible deltas
- WorldKernel validates and logs them

Constraints:

- do not perform major irreversible events without prior signs
- do not act on behalf of the player
- do not introduce major named entities cheaply
- do not punish the user for hidden information
- prefer signs, changed objects, absences, rumors, and shifted stances

Pause Mode disables most reconciliation. Living World Mode may later make it
more proactive.

**Shared with God edits.** The same consequence-repair machinery serves God/Studio
hard edits (§4.13): an authored fact triggers a bounded reconcile scoped to
witnesses of the now-contradicted events, *superseding* (never deleting)
contradicting subjective records so the authored world stays self-consistent.

### 4.12 TasteSeedRuntime

World generation is outside the world instance.

Taste Chronicle may shape new doors, but it must not leak into character
knowledge unless deliberately canonized inside that world.

Seed generation should use behavior sequences, not only tags:

- dwell and quick swipe
- first action
- return and abandon
- relationship patterns
- intensity and pacing preferences
- regenerate/rewind/fork behavior
- long-running world traits

Generation modes:

```text
50% exploit
35% bridge
15% explore
```

Bridge should preserve deep attraction structures while changing surface genre,
role, or pressure.

### 4.13 StudioRuntime

Supports power-user control without breaking immersion.

Surfaces:

- Director Notes
- Scene Contract
- God Mode / Studio Mode
- World Atlas
- Context Inspector
- Timeline Forks
- Seed Studio

Rules:

- Player Mode remains default
- advanced controls are channel-isolated
- God edits affect private branch, not public seed
- edits go through validated deltas where possible
- Context Inspector can show model context, but only as an advanced/debug view
- God hard edits trigger edit-then-reconcile: after the delta commits (provenance
  `god-edited`), a witness-scoped reconcile pass (§4.11) supersedes contradicting
  memories/beliefs/relationships; records are superseded, never deleted (append-only)

## 5. Full Turn Flow

Target flow:

```text
acquire instance lock
-> load instance, seed, recent messages, memory cursors
-> capture rollback snapshot
-> classify input channel
-> apply explicit user/god deltas through WorldKernel
-> run OffstageReconciler if returning
-> run Materializer for required pre-perception fleshing
-> Director selects pressure, active agents, ambient cast, surfacing
-> PerceptionResolver builds SubjectiveContext for each active agent
-> AgentRuntime runs active characters
-> Director renders ambient cast / narration beat
-> Reactor proposes objective Delta[]
-> WorldKernel validates, applies, and logs deltas
-> MemoryBeliefSystem writes observations, beliefs, hearsay, reflections
-> Materializer post-pass fleshes newly earned entities
-> persist instance/messages/memories/deltaLog
-> release lock
```

**Fast path vs slow path.** To protect immersion under multiple serial LLM calls on
the user's own key, split the flow by what must complete before the user reads the
first prose. The *fast path* (Director casting + narration + selected characters
streaming) reaches first token quickly so the user has something to read. The *slow
path* (Reactor deltas, memory/hearsay writes, post-pass flesh) may settle during or
after streaming, as long as it commits before the next turn builds context. The
instance lock (§7) enforces one commit at a time: the user may read immediately but
cannot commit the next turn until this turn's structural settle finishes. A depth
tier (fast / standard / deep) scales the slow path (`maxActiveAgents`,
memory/reflection frequency, flesh threshold, agentic-compute depth).

Rollback:

```text
if any fatal error:
  restore snapshot
  delete messages/memories/deltas created after snapshot
  release lock
  surface error to UI
```

Regenerate:

```text
restore last-turn snapshot
rerun same input with same channel metadata
ensure old branch messages, memories, and deltas do not leak
```

## 6. Data Model Direction

Current types can evolve incrementally.

### 6.1 WorldState

Keep:

- `currentLocationId`
- `time`
- `locations`
- `objects`
- `roster`
- `characters`
- `flags`
- `tension`
- `relationships`
- `lore`

Add over time:

- `pressureLines`
- `sceneContracts`
- `offstage`
- `entityLifecycle`
- `facts`
- `beliefs`
- `timeline`

`WorldRules` (immutable) likewise gains, beyond physics/setting/redLines:

- `narration` — the world's truth→prose transduction rule (faithful by default;
  optional lawful distortion for horror/dream/unreliable worlds; see §4.6)
- `ruleSkills` — optional executable rules the agentic Director runs for precise
  adjudication (combat, scoring, puzzle logic, small economies; see §4.6)

### 6.2 Delta

Current delta set is the base. Expand only for real mechanical needs.

Likely next deltas:

- `fleshObject`
- `fleshCharacter`
- `setBelief`
- `setSecret`
- `setGoal`
- `setPressureLine`
- `setOwnership`
- `setFact`
- `forkTimeline`
- `retireEntity`

Do not add a delta just because prose needs detail. Add one when the detail must
persist, be validated, or affect future behavior.

### 6.3 Event Log

The delta log is the historical truth of committed objective changes.

Future log records should support:

- source role
- cause input
- related message IDs
- rejected delta reasons
- affected entity IDs
- visibility/witness metadata
- branch/timeline ID

Memory and belief can point back to log entries as evidence.

### 6.4 Subjective Records

Memory should not be a single text blob forever.

Target fields:

- `charId`
- `kind`
- `text`
- `entities`
- `source`
- `provenance`
- `confidence`
- `importance`
- `createdAt`
- `gameTime`
- `evidenceLogIds`
- `branchId`

This enables wrong beliefs, one-hop gossip, Context Inspector, and World Atlas.

## 7. Concurrency And Locks

The runtime needs explicit operation discipline.

Adopt an AI Town-style instance operation lock:

- only one turn can commit to an instance at a time
- each long LLM operation has an operation ID
- stale operation results are ignored
- timeout releases the lock safely
- regeneration/fork/god edit must invalidate in-flight operations

This is required before adding more agent calls. Without it, overlapping
Director/Reactor/character results can contaminate the same private branch.

## 8. Context Inspector Contract

Context Inspector is not a default play UI. It is a Studio/debug surface.

It should be able to show:

- input channel
- active Director Note / Scene Contract
- selected active agents and ambient cast
- each character's visible scene
- retrieved memories and lore
- proposed deltas
- committed deltas
- rejected deltas and reasons
- who witnessed what
- which facts are canon and which are beliefs

This contract should guide runtime instrumentation even before the UI exists.

## 9. Error Handling

Principles:

- invalid deltas are rejected, not silently applied
- recoverable LLM parse failures degrade to no-op or narration-only
- fatal turn failures restore snapshots
- every rejected durable proposal should be inspectable in Studio/debug tools
- user-facing play should stay calm and diegetic when possible

Examples:

- Reactor returns prose instead of JSON: parse to empty delta list and continue.
- Materializer fails to flesh a location: keep `gist`, do not block the turn.
- Offstage reconciliation fails: skip it.
- God Edit proposes invalid state: reject with explicit reason.
- Commit race detected: ignore stale operation and ask UI to refresh.

## 10. Testing Strategy

Use tests at module boundaries.

Core unit tests:

- `WorldKernel`: validation, apply, log, rejection reasons
- `PerceptionResolver`: character cannot see private/remote/omniscient facts
- `ContextAssembler`: budget, recursion, cooldown, role-specific packs
- `Director`: active-agent cap, surfacing rules, channel isolation
- `Reactor`: evidence-first deltas and invalid proposal rejection
- `MemoryBeliefSystem`: witness scope, hearsay degradation, belief divergence
- `OffstageReconciler`: conservative return deltas and fairness constraints
- `Timeline`: regenerate/fork does not leak old branch state

Integration tests:

- user action changes object state and persists
- locked door blocks movement until unlocked
- character witnesses event, absent character does not
- gossip creates hearsay without infinite cascade
- Director Note affects pacing but not character knowledge
- God Edit commits through deltas and logs source
- return after time away produces bounded offstage deltas

Live validation:

- use real local/dev BYO model path when available
- run one cheap `/api/llm/chat` path check first
- then validate a browser play loop and inspect IndexedDB state

## 11. Implementation Slices

Build from the current `runTurn` outward.

### Slice 1: Extract WorldKernel

- move validate/apply/log orchestration behind `commitDeltas`
- add rejection records for debug visibility
- keep existing delta behavior

### Slice 2: ContextAssembler + PerceptionResolver

- replace prompt helper sprawl with typed context packs
- preserve existing visible-scene behavior
- add tests proving POV boundaries

### Slice 3: Director Casting

- Director chooses active agents and ambient cast
- enforce `maxActiveAgents`
- remove hardcoded "tension >= 6 grabs first offstage character" behavior

### Slice 4: Character Agent Runtime

- make character cognition explicit:
  `perceive -> retrieve -> intent -> speak/act -> observe`
- keep end-of-turn Reactor for structural writes

### Slice 5: Memory/Belief Upgrade

- separate observation, hearsay, belief, secret, reflection
- add provenance and confidence
- connect relationship evidence to memory records

### Slice 6: Offstage And Pressure Lines

- represent pressure lines in seed/state
- make offstage reconciliation read pressure and evidence
- surface changes diegetically

### Slice 7: Studio Instrumentation

- expose trace data for Context Inspector
- wire Director Notes, Scene Contract, and God Edit through channel-isolated
  runtime paths

## 12. Non-Goals For V1

Do not build these while establishing the runtime spine:

- every NPC as an always-on agent
- real-time multiplayer shared world
- server-side idle simulation
- deterministic GTA-scale map pre-generation
- full economy/physics simulation
- voice-first or image-first product architecture
- public social graph of user play history

They can be revisited after the private living-world loop is proven.

## 13. Locked Decisions

1. Default runtime is turn-scoped and interaction-driven.
2. Consequence Mode is default; Living World Mode is later/optional.
3. `WorldKernel` is the only durable-state writer.
4. Characters never read raw `WorldState`.
5. Character output is prose; Reactor/WorldKernel commit objective changes.
6. Director and Reactor are omniscient but not characters.
7. Active agents are capped; ambient cast stays ambient unless earned.
8. Materialization is shared across locations, objects, lore, characters, and
   strange agents.
9. Taste Chronicle affects new doors, not in-world character knowledge.
10. God Mode edits private branches and should use validated deltas.
11. Context Inspector is an advanced surface, but runtime traces should be
    designed for it now.
12. The current monolithic `runTurn` is an implementation phase, not the final
    architecture boundary.
