# Anywhere Door / 任意门 — Project Charter (AGENTS.md)

> This file is the **highest authority for product and technical decisions**.
> Before changing product behavior, architecture, roadmap, or agent guidance,
> reconcile the change with this charter first.
>
> Authority order:
>
> 1. `AGENTS.md` — project charter and non-negotiable principles.
> 2. `docs/superpowers/specs/2026-06-24-overall-product-design.md` — latest
>    full product design.
> 3. `docs/superpowers/specs/2026-06-24-world-runtime-technical-design.md` —
>    target world-runtime / agent architecture.
> 4. `docs/DESIGN.md` — current implementation architecture.
> 5. `docs/ROADMAP.md` — staged path from current implementation to the latest
>    product design.
> 6. `docs/entity-genesis-design.md` — detailed entity genesis and surfacing
>    design.
>
> Historical plans and `.superpowers/sdd/*` reports are useful evidence, but
> they are **not** current product authority.

## 0. Name

**Anywhere Door / 任意门** (formerly 浮生 / The Reveries). Named in homage to
Doraemon's Anywhere Door.

## 1. Slogan

> Countless doors before you. Push any one open and you're standing in a
> **real** world.
> *Text is merely how you interact with that world — not what it is.*
>
> 面前有无数扇门。推开任意一扇,你就站在一个**真的**世界里。
> 文字,只是你与那个世界交互的形式,不是它的本质。

## 2. Essence (Nearly Immutable)

**The door opens onto a real world; text is only the interaction surface.**

- **Immersion first.** Every design choice serves one thing: making the user
  feel truly present in that world.
- **The world's substance is structured state, not prose.** `WorldRules` +
  `WorldState` + validated `Delta`s are the real world. The LLM renders,
  interprets, proposes, and dramatizes; it does not directly own reality.
- **"Real" means mechanically true** along continuity, space, physical
  causality, social causality, canon, and offstage life.
- **The door belongs to the player alone.** The player is the only entity that
  enters from outside. Characters, places, objects, lore, and events are native
  to the world and unfold from it.

Personalization is powerful, but it is **product form**, not essence. The door
knowing the user must never weaken the deeper promise that the world itself is
real.

## 3. Product North Star

Anywhere Door is not an AI novel generator and not merely AI roleplay chat. It
is a **private living-world browser**:

- The user swipes through countless doors.
- A door opens into a private, structured world instance.
- Short sessions should catch quickly; long sessions should keep becoming more
  real.
- Opened worlds become a personal **Doorway Library**, not disposable chats.
- A hidden-but-available Director/God layer gives advanced users control over
  pacing, boundaries, private canon, and high-control scenes.

The hardest promise:

> Every door feels instantly inviting; every world the user stays in feels like
> it keeps becoming more real.

## 4. Product Form

### Feed

A TikTok-style feed of countless doors: one world per screen, vertically swiped,
generated and ranked in the background.

Each card is a **door crack**, not an encyclopedia:

- door name
- one cold-open line
- mood / intensity
- one unresolved tension
- an obvious open-door action

The feed should not expose raw tags as the main recommendation surface. Tags can
exist internally, but the user experience should feel like doors, hooks, and
living possibilities.

### Play

The play route is lean-in presence:

- local scene first
- interactable characters / objects / traces
- one immediate tension
- user input as speech, action, observation, or director-level steering
- visible consequence after the user's specific action

Within the first ten minutes, the product should prove that at least one thing
changed in `WorldState`, someone remembers or misremembers the player, and a
piece of canon or local consequence was earned.

### Doorway Library

Opened worlds are persistent private instances:

- all opened worlds appear in history
- pinned worlds enter the user's Doorway Library
- returning worlds can show a light echo: last location, unresolved tension,
  latest consequence, or changed social state
- no aggressive notifications in MVP

## 5. World Generation Model

### Seed As Generative Contract

A seed is not a content list. It is a compact generative contract:

- hard rules: physics, social order, magic/technology, red lines
- tonal gravity: what emotional/dramatic direction the world slides toward
- opening locality: first scene, first situation, a few interactable entities
- anchors: initial characters, locations, factions, secrets, symbols
- 2-3 semi-hidden pressure lines
- expansion grammar: how new places, people, objects, lore, and social
  consequences appear
- canon ledger: established truths that cannot be contradicted
- narration rule: how the world transduces its truth into prose — faithful by
  default, with optional lawful distortion for horror/dream/unreliable worlds
- executable rule-skills (optional): deterministic rules the agentic Director runs
  for precise adjudication (combat, scoring, puzzle logic, small economies)

The world begins incomplete, but unfolds as if it was always complete.

### Progressive Unfolding

Do not pre-generate a GTA-scale map. Materialize the world through player
attention and causal pressure:

```text
seed contract
-> player action / speech / observation / director note
-> Director chooses attention, pacing, visibility, and pressure exposure
-> Reactor proposes objective world deltas
-> validateDelta checks rules and canon
-> applyDelta updates WorldState
-> deltaLog records cause and time
-> prose renders the updated world
```

The desired feeling: new details seem already present, and the player has just
come close enough to perceive them.

## 6. What "A Real World" Means

The LLM only ever **proposes** changes; the engine validates against immutable
rules before committing. The model never writes the world directly.

| Axis | Product requirement | Current stance |
|---|---|---|
| Existence & continuity | The world cannot reference or mutate entities that do not exist. | Core; enforced by `validateDelta`. |
| Spatial persistence | Places are traversable and become richer on visit. | Core; location `stub -> fleshed` is wired, object/character depth continues. |
| Physical causality | A few drama-driving properties are mechanical. | Selective core; locked/gated/portable are enforced, flammable/broken can come later. |
| Social causality | Relationships shift from events, evidence, secrets, and memory. | Core; relationship ledger + subjective memory + hearsay. |
| Canon consistency | The world must not contradict established truth. | Core; lore injection + `establishLore` + validation. |
| Offstage evolution | The world feels alive while respecting local-first cost. | Core as **Consequence Mode**: no idle simulation, lazy reconciliation on return. |

## 7. Entity Lifecycle And Agency

Everything in the world — locations, objects, lore, characters, even strange
entities like a whispering mirror — follows one lifecycle:

```text
ambient
-> hinted
-> named stub
-> fleshed structured entity
-> agentic entity
-> offstage / summarized
-> retired
```

**Ambient by default; crystallize into persistent structure only when it earns
persistence.** Triggers include player engagement, repeated appearance, causal
power, private knowledge, a recurring agenda, or connection to a pressure line.

The agency test:

> An entity becomes an agent iff it has a private POV that drives the fiction.

A button is state. A locked door is state. A haunted mirror with secrets,
beliefs, and goals is an agent. A person decorating a crowd can remain ambient;
a person whose private knowledge changes the scene becomes an agent.

## 8. POV, Knowledge, And Information Boundaries

Characters are real because they are limited:

- each agent has private memory, beliefs, secrets, goals, and current stance
- an agent only knows what it witnessed, inferred, heard, or was told
- wrong beliefs are allowed and often desirable
- visible state is not omniscient state
- characters never read raw `WorldState`; they receive a subjective projection

Director and Reactor stay omniscient and separate from characters. A single mind
cannot be both blind enough for drama and omniscient enough for orchestration.

**Why centralized omniscience is structural, not stylistic.** A world shared by
many partial perceivers cannot let each perceiver independently generate reality:
multiplicity itself diverges — N independent minds, even perfect ones, elaborate
mutually contradictory worlds. Consistency therefore requires a single source of
truth: one omniscient hub (WorldState as canon; Director/Reactor as its
orchestration) holds the world and distributes partial projections. This is a
**star topology** — one hub of truth, many partial spokes — never a mesh of
independent minds. Information boundaries are a consequence of that hub, not only a
dramatic device. The runtime is then two arrows around the hub: **perception**
(hub projects what each agent sees) outward, and **agency** (agents pull
information and propose changes, always adjudicated by the hub) inward. Player and
characters are symmetric *inside* the world; the player's only asymmetry is an
out-of-world authority axis (see §10).

## 9. Pressure, Time, And Offstage Life

Pressure lines are unfinished causality, not quests. They should surface through
diegetic signs: rumor, changed objects, avoidance, messages, missing people,
returning details, or altered locations.

Default time mode is **Consequence Mode**:

- the world does not burn compute while the user is away
- the world is not literally simulated minute by minute
- when the user returns, plausible consequences are reconciled through the same
  propose -> validate -> apply -> log gate
- low-stakes offstage life can move, but major consequences need signs or prior
  contact

The product may later offer more explicit paused/live modes, but Consequence
Mode is the baseline.

## 10. Control Layers

Default experience is immersive **Player Mode**. Advanced control exists, but
must preserve channel isolation.

| Layer | Purpose | Visibility |
|---|---|---|
| Player Mode | Speak, act, observe, live inside the scene. | Default. |
| Director Notes | Steer pacing, tone, boundaries, or desired direction without becoming in-world speech. | Light advanced control. |
| Scene Contract | Set local boundaries, intensity, consent/NSFW constraints, and relationship direction. | Advanced / NSFW / Studio. |
| God Mode / Studio Mode | Direct private-world edits, canon repair, branch control, seed creation. | Hidden by default, discoverable for power users. |

**These layers are one continuous authority axis, not four separate modes.** The
axis runs from *discovering* the world (Player Mode: you may only influence it
through in-world action, which must pass in-world causality) to *authoring* it
(God Mode: you may propose any hard fact). One invariant holds at every point:

> The only way to change the world is a validated delta written to the event log.
> Raising authority raises **which deltas you may propose**, never **whether you
> may bypass the gate**. The gate is never bypassed.

Because of this, an authored world is as real — consistent, persistent, auditable,
forkable — as a discovered one. "A world with its own indifferent life" and "a
world that bends to the user" are the two ends of this single axis, not rival
products. Personalization ("the door knows you") is the system pre-setting this
knob from the Taste Chronicle, and it acts only at the Director/God layer; it never
becomes a character's in-world knowledge.

God Mode edits the user's private branch, not the public seed. Characters should
not automatically know about Director Notes, scene contracts, or cross-world user
history unless the world explicitly canonizes that knowledge.

## 11. Taste Chronicle

The feed should learn from raw behavior sequences, not merely tags:

- dwell / quick swipe / return / abandon
- first action patterns
- world types that become long-term instances
- relationship dynamics the user sustains
- intensity, control, and boundary preferences
- branch / rewind / regenerate behavior
- text style and pacing preferences

Ranking and generation should balance:

- exploit: worlds likely to fit
- bridge: nearby novelty connected to known preference
- explore: meaningful divergence
- MMR / diversity: avoid repetition and local optima
- cool-downs: avoid over-serving the same motif

Taste Chronicle is local-first user data. It may shape new doors, but it must
not leak into a character's knowledge unless the player or world makes that
canon.

## 12. Power-User Surfaces

The latest product design includes these surfaces. They are not all MVP, but new
work should avoid blocking them:

- **Door Passport**: cross-world user identity, preferences, and boundaries.
- **World Atlas**: private record of places, people, objects, lore, relationships,
  pressure lines, and open mysteries.
- **Context Inspector**: advanced/debug view of what the model currently knows
  or sees.
- **Timeline Forks**: rewind, branch, compare, and keep private timelines clean.
- **Seed Studio**: authoring tools for seed contracts, pressure lines, imported
  characters, and expansion grammar.
- **Director Profiles**: product-level controls such as slow burn, high agency,
  romance focus, horror pressure, sandbox exploration, or strict canon.
- **Home / Base / Anchor**: long-term worlds can develop a recurring place,
  relationship, role, or unfinished problem that makes return meaningful.

## 13. Governing Technical Invariants

- **Rules immutable, state mutable.** `WorldRules` is read-only after creation;
  `WorldState` mutates and grows on demand.
- **Propose -> validate -> apply.** Reactor/Director/LLM proposals become real
  only after validation.
- **Turn-scoped layered runtime.** Default world execution is interaction-driven:
  one locked turn invokes Director, selected character agents, Reactor,
  Materializer, Memory/Belief, and Offstage Reconciler in a bounded sequence.
  Always-running simulation is a later mode, not the default architecture.
- **WorldKernel is the durable-state writer.** Characters, Director, Reactor,
  God Mode, and offstage logic may propose changes, but durable world mutation
  goes through the typed delta gate and event log.
- **Characters receive subjective projections.** Character agents never read raw
  `WorldState`; they receive what they can see, hear, remember, infer, believe,
  or were told.
- **Record = snapshot + append-only delta log.** The snapshot is the fast current
  state; every committed delta is logged with turn, game time, real time, source,
  and cause.
- **Authored edits reconcile, not overwrite.** A God/Studio edit to a hard fact
  goes through the same validated-delta gate (provenance `god-edited`) and then
  triggers a bounded consistency repair: contradicting memories, beliefs, and
  relationship evidence are *superseded* (never deleted — append-only), scoped to
  witnesses of the now-contradicted events. The authored world stays self-consistent,
  auditable, and forkable.
- **Narration is transduction, not free prose.** User-facing text is the world
  re-telling its committed truth through the world's narration rule (faithful by
  default; lawful distortion is a `WorldRules` property). The hub always holds the
  real truth; narration never mutates it, so a render slip is cosmetic, not corruption.
- **The Director may be an agent.** It may compute deterministically (combat,
  scoring, puzzle logic, small economies) and propose the result as deltas, or
  degrade to pure narration. Computed results still commit through WorldKernel; the
  agent never bypasses validation. Large-scale numeric simulation stays out on
  per-turn-budget grounds, not architecture.
- **Interaction-driven evolution.** The world advances through interaction and
  lazy return reconciliation, not server-side idle simulation.
- **BYO-key and local-first.** Production is bring-your-own-key; data lives in
  the browser/IndexedDB; no server database.
- **Unrestricted adult fiction by default.** Red lines are platform baseline plus
  user/creator/scene constraints. Boundary control belongs in product surfaces,
  not hidden prompt accidents.

## 14. Stack And Navigation

Next.js 15 · React 19 · TypeScript strict · Tailwind CSS 4 · Dexie/IndexedDB ·
Vitest.

Code map:

- `src/lib/engine/` — turn loop, Director/God orchestration, Reactor, prompts
- `src/lib/world/` — deltas, generation, lore, seeds, fleshing, offscreen
- `src/lib/taste/` — taste events, model, ranking
- `src/lib/memory/` — observation, retrieval, reflection, gossip
- `src/lib/storage/` — IndexedDB repositories and delta log
- `src/app/` — feed, play, create, settings, API route

Useful commands:

- `npm test`
- `npm run build`
- `npm run typecheck`

## 15. Agent Working Rules

- Read this file before product or architecture decisions.
- Use the latest product spec for product details, not older plans.
- Use the world-runtime technical spec for agent/runtime architecture; do not
  invent a competing turn loop in implementation notes.
- Keep `docs/DESIGN.md` factual about current implementation.
- Keep `docs/ROADMAP.md` honest about what is implemented, next, later, and not
  now.
- When changing world behavior, preserve the structured world model and
  validation gate.
- When changing character behavior, preserve subjective POV and information
  asymmetry.
- When changing feed/recommendation behavior, preserve Taste Chronicle depth and
  exploration/exploitation balance.
