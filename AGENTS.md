# Anywhere Door / 任意门 — Project Charter (AGENTS.md)

> This file is the **highest authority for product and technical decisions**.
> It states the essence, the single axiom everything derives from, and the
> non-negotiable invariants. It is deliberately **implementation-agnostic**:
> it describes the *best* product, not the current code. Where the code differs,
> the code is wrong until reconciled — not the other way around.
>
> **Authority order**
>
> 1. `AGENTS.md` — charter: essence, axiom, invariants. (this file)
> 2. `docs/first-principles.md` — the derivation: why the product and the
>    architecture are *forced*, not chosen.
> 3. `docs/product-design.md` — the product: experience, surfaces, funnel,
>    control, taste, metrics. No code.
> 4. `docs/architecture.md` — the ideal world-runtime: topology, modules, turn
>    flow, data-model direction, living-world mechanics. No code symbols.
> 5. `docs/current-state.md` — **non-authoritative** factual snapshot of what
>    the code does today. The only place implementation reality lives.
> 6. `docs/roadmap.md` — the migration path from (5) to (3)/(4).
>
> Docs 1–4 contain **no code symbols, no file paths, no "already implemented."**
> Coupling to the current codebase lives only in 5–6. Historical `.superpowers/`
> reports are evidence, never authority.

## 0. Name

**Anywhere Door / 任意门** (formerly 浮生 / The Reveries), in homage to
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

The desire the product serves, with every category label stripped away, is one
sentence:

> *To step into another world, and have that world be **real** — it changes
> because of me, it remembers me, and it can still surprise me.*

"Real" decomposes into three operational demands: **causality** (what I do has
accumulating consequence), **persistence** (leaving and returning does not
reset), and **surprise** (the world holds parts I don't author and can push
back). Everything below exists to make those three mechanically true.

- **Immersion first.** Every choice serves one thing: the user feeling truly
  present in that world.
- **The world's substance is structured state, not prose.** The real world is
  immutable rules + a validated, mutable state + an append-only log of validated
  changes. The model renders, interprets, proposes, and dramatizes; it never
  directly owns reality.
- **The door belongs to the player alone.** The player is the only entity that
  enters from outside. Characters, places, objects, lore, and events are native
  to the world and unfold from within it.

Personalization is powerful, but it is **product form, not essence.** The door
knowing the user must never weaken the deeper promise that the world is real.

## 3. The Single Axiom (the root of everything)

A real world is perceived only in part: I touch one corner of it; other minds
touch other corners. If each partial perceiver ran its own model and
independently generated reality, **multiplicity itself would diverge** — two
characters describing the same room back-to-back would invent two rooms; even
perfect models would build mutually contradictory worlds.

The only resolution:

> **There must be a single omniscient hub that holds the one true world and
> distributes a partial projection to each perceiver. This is a star topology —
> one hub of truth, many partial spokes — never a mesh of independent minds.**

This is the axiom. Nearly every invariant in this charter is a theorem of it:

- The world must be **structured, validatable state** a single authority can
  hold, check, and distribute — not "whatever a model said this sentence."
  (This survives smarter models: it serves *consistency under multiplicity*, not
  *a forgetful model's memory*.)
- The runtime is exactly **two arrows around the hub**: **perception** (hub →
  each agent's partial projection) outward, and **agency** (agents pull
  information and propose changes, always adjudicated by the hub) inward.
- Player and characters are **symmetric inside the world** — both partial, both
  may only pull/propose through in-world action. The player's *only* asymmetry
  is an out-of-world authority axis (§11).

## 4. Product North Star

Anywhere Door is not an AI novel generator and not merely AI roleplay chat. It
is a **private living-world browser**:

- The user swipes through countless doors.
- A door opens into a private, structured world instance.
- Short sessions catch fast; long sessions keep becoming more real.
- Opened worlds become a personal **Doorway Library**, not disposable chats.
- A hidden-but-available Director/God layer gives advanced users control over
  pacing, boundaries, private canon, and high-control scenes.

The hardest promise (the two ends of the funnel):

> Every door feels instantly inviting; every world the user stays in feels like
> it keeps becoming more real.

The behavioral signal that this landed is **return-rate** — whether the user
comes *back* to the same door. A world the user reopens is no longer a chat log;
it is a private world they own. **Return-rate is the north-star metric.**

## 5. Product Form (principle level; detail in the product design)

- **Feed.** A vertically swiped feed of doors, one world per screen. Each card
  is a **door crack, not an encyclopedia**: a name, one cold-open line, a mood,
  one unresolved tension, one obvious open-door action. Raw tags are never the
  primary recommendation surface.
- **Play.** Lean-in presence: a local scene, interactable characters/objects/
  traces, one live tension, input as speech/action/observation/steering, and a
  **visible consequence after the user's specific action**. Within ten minutes
  the world should prove something changed, someone remembers or *misremembers*
  the player, and a piece of canon or local consequence was earned.
- **Doorway Library.** Opened worlds are persistent private instances. Leaving
  runs a bounded **exit settlement** (trace + unresolved threads + return
  candidates); returning **advances** the world rather than continuing the last
  chat line. No aggressive notifications.

## 6. World Generation

### Seed as generative contract

A seed is not a content list; it is a compact generative contract: hard rules
(physics, social order, magic/tech, red lines), tonal gravity, opening locality,
anchors, 2–3 semi-hidden pressure lines, an expansion grammar, a canon ledger, a
**narration rule** (§13), and **optional executable rule-skills** for precise
adjudication (§14). The world begins incomplete but unfolds as if it was always
complete.

### Progressive unfolding

Do not pre-generate a GTA-scale map. Materialize through player attention and
causal pressure: new details should feel **already present**, as if the player
just came close enough to perceive them.

### Access model (locked)

- **A model key is required to play.** Live world generation and live play both
  run on the user's key (local-first, BYO-key; see §15).
- **The product ships with enough built-in cold-start worlds** — including
  worlds with differing rule configurations — that a keyless user can browse and
  experience the product immediately. **Generating a new world always requires a
  key.** The cold-start pool is a first-class asset, not a placeholder.

## 7. Entity Lifecycle and Agency

Everything — locations, objects, lore, characters, even a whispering mirror —
follows one lifecycle:

```text
ambient -> hinted -> named stub -> fleshed structured entity
-> agentic entity -> offstage / summarized -> retired
```

**Ambient by default; crystallize into persistent structure only when it earns
persistence** (player engagement, recurrence, causal power, private knowledge, a
recurring agenda, or a pressure-line link). The world is the source; nothing
enters from outside except the player.

The agency test:

> An entity becomes an agent **iff it has a private POV that drives the
> fiction.** A button is state. A locked door is state. A haunted mirror with
> secrets, beliefs, and goals is an agent.

## 8. Canon Hardness (three tiers)

Not all truth is equally fixed. A fact earns fixity the way an entity earns
persistence, on a **three-tier** scale:

```text
ambient   — atmosphere and revisable detail (e.g. "the rain is heavy")
anchored  — the player witnessed or acted on it (e.g. "the key is in my pocket")
core      — seed-level load-bearing canon, or an authored (God) fact
```

The rule that follows:

> A proposal may not silently contradict a fact harder than its own authority.
> Reactor and character proposals **cannot overturn an anchored fact** — what the
> player saw or did stays true. Only an authored (God) edit may revise anchored
> or core canon, and it pays the bounded reconcile of §15.

This is what makes "I hid the key, so it stays hidden" hold. (Finer internal
gradations, if ever needed, are a derived implementation detail — the charter
commits only to these three tiers.)

## 9. POV, Knowledge, and Information Boundaries

Characters are real because they are **limited**:

- each agent has private memory, beliefs, secrets, goals, and a current stance;
- an agent knows only what it witnessed, inferred, heard, or was told;
- wrong beliefs are allowed and often desirable;
- visible state is not omniscient state.

Director and Reactor stay omniscient and **separate from characters** — they
orchestrate and validate; a single mind cannot be both blind enough for drama
and omniscient enough for orchestration. This is a direct consequence of the
axiom (§3), not merely a dramatic device.

**The single-projection invariant.** Characters never read raw world state.
Every piece of context a character receives passes through **one** perception
boundary that builds its subjective projection. Out-of-world channels — Director
Notes, Scene Contract, cross-world taste, un-canonized God edits — must never
appear in that projection. Because this failure is **silent** (the world simply
becomes wrongly omniscient, nothing crashes), isolation is enforced **structurally
at the single boundary**, guarded by standing assertions — not re-policed by
hand each time a control surface is added.

## 10. Pressure, Time, and Offstage Life

Pressure lines are **unfinished causality, not quests.** They surface through
diegetic signs — rumor, a changed object, avoidance, a message, a missing
person, an altered location — never through raw meters.

Default time mode is **Consequence Mode**:

- the world burns no compute while the user is away and is not literally
  simulated minute by minute;
- on return, plausible consequences are reconciled through the same
  propose → validate → apply → log gate, **bounded by relevance** (near the
  scene or an active thread reconciles richly; the far world stays frozen until
  touched);
- low-stakes offstage life may move, but major consequences require prior signs
  or contact, and the world never acts on the player's behalf.

More explicit paused/live modes may come later; Consequence Mode is the baseline.

## 11. The Control Axis

Control is **one continuous authority axis, not four separate modes.** It runs
from *discovering* a world to *authoring* it:

- **Player** — influence only through in-world action, which must pass in-world
  causality (a locked door blocks you).
- **Director Notes / Scene Contract** — steer pacing, tone, boundaries, intensity,
  and direction; out-of-world, channel-isolated, never character knowledge.
- **God / Studio** — propose any hard fact: edit relationships, retcon, establish
  prior history; still validated, logged, and confined to the private branch.

One invariant holds at every point on the axis:

> The only way to change the world is a validated change written to the log.
> Raising authority raises **which changes you may propose**, never **whether
> you may bypass the gate. The gate is never bypassed.**

Therefore an authored world is **as real as a discovered one** — consistent,
persistent, auditable, forkable. "A world with its own indifferent life" and "a
world that bends to the user" are the two ends of one axis, not rival products;
this is a single product serving both audiences at different points on the axis.
Personalization is the system pre-setting this knob from the Taste Chronicle, and
it acts only at the Director/God layer — never as a character's in-world knowledge.

## 12. Taste Chronicle

The feed learns from **raw behavior sequences, not tags**: dwell, quick swipe,
return, abandon, first actions, which worlds become long-term instances,
sustained relationship dynamics, intensity/control/boundary preferences,
branch/rewind/regenerate behavior. Generation balances **exploit / bridge /
explore / diversity**, with *bridge* (hold the deep attraction structure, swap
the surface) as the signature. Taste Chronicle is local-first user data; it may
shape new doors but **must not leak into a character's knowledge** unless the
player or world makes it canon.

## 13. Narration as Transduction

User-facing prose is **not free text policed after the fact.** It is the world
**re-telling its own committed truth through its narration rule**: the hub's
fact snapshot is the source material, so grounding is structural. Faithful is the
default; **lawful distortion** (horror sanity effects, dream logic, a world that
hides a death) is a rules-level property of the world, not an ad-hoc switch. The
hub always holds the real truth underneath, so a render slip is recoverable, not
a divergence.

Because narration is still generated by a model, a **cheap consistency guard**
remains: it catches prose that asserts a fact absent from the snapshot before
that slip can mislead the player or seed a spurious change. The guard is a
lightweight backstop, not the source of grounding. Character voices are an
orthogonal layer — a partial perceiver may lie or err; such claims route to that
character's belief or a recorded lie, never silently into state.

## 14. The Agentic Director

The Director need not be a single prompt; it **may be a tool-using agent that
runs the world's rules over the truth.** When a world needs precise adjudication
— combat resolution, scoring, puzzle logic, a small economy — it computes
**deterministically** (code / a ledger) and proposes the result as validated
changes; when it does not, it degrades to pure narration at no extra cost.
Per-world rules may be expressed as reusable executable rule-skills.

This moves precise **game-y** worlds inside the product's scope — they are part
of the target, attempted, not deferred indefinitely. The gate invariant holds:
computed results are proposals committed through the write gate; the agent never
bypasses validation. Large-scale numeric simulation stays out on per-turn-budget
grounds (§16), not architecture.

## 15. Non-Negotiable Technical Invariants

1. **Single source of truth (the axiom, §3).** One omniscient hub holds the
   world; perceivers receive partial projections. No parallel authority.
2. **Rules immutable, state mutable.** Immutable world rules after creation;
   state mutates and grows on demand.
3. **Propose → validate → apply → log.** Every durable change is a typed,
   validated change appended to the log with turn, game time, real time, source,
   and cause. The model never writes durable state directly.
4. **One durable writer.** Characters, Director, Reactor, offstage logic, and
   God Mode all *propose*; a single write gate is the only thing that commits.
5. **Characters receive subjective projections only** (§9), through the single
   perception boundary.
6. **Turn-scoped layered runtime.** Default execution is interaction-driven: one
   locked turn invokes the runtime modules in a bounded sequence. Always-running
   simulation is a later mode, never the default.
7. **Record = snapshot + append-only log.** The snapshot is fast current state;
   history is never deleted.
8. **Authored edits reconcile, not overwrite.** A God edit commits through the
   gate (authored provenance) and triggers a bounded, witness-scoped reconcile;
   contradicted memories/beliefs are *superseded*, never deleted. The authored
   world stays self-consistent, auditable, and forkable.
9. **Narration is transduction with a cheap guard** (§13).
10. **The Director may compute** (§14), but never bypasses validation.
11. **Interaction-driven evolution.** The world advances through interaction and
    lazy return reconciliation, not server-side idle simulation.
12. **BYO-key and local-first.** Production is bring-your-own-key; data lives in
    the browser; no server database. Playing requires a key; the built-in
    cold-start pool is the keyless entry point (§6).
13. **Unrestricted adult fiction by default.** Red lines are platform baseline
    plus user/creator/scene constraints; boundary control belongs in product
    surfaces, never in hidden prompt accidents.

## 16. Scope

**Sweet spot (built for this):** character-driven drama, RP, mystery, social
intrigue, romance, survival, horror, detective, dungeon exploration.

**In scope, attempted:** **game-y** worlds with precise adjudication (combat,
scoring, puzzles, small economies), via the agentic Director (§14). "Weird" is
cheap — strange cognition, Rashomon, non-Euclidean space, time loops,
unreliable reality are all just lore + perception filters + rules expressed as
changes.

**Out by design (do not chase):** twitch/real-time input (the text medium
cannot), large-scale numeric simulation (per-turn budget, not architecture), and
real-human multiplayer / social deduction (single-player private instances).
These are deliberate scope choices, not accidental gaps.

## 17. Agent Working Rules

- Read this charter before any product or architecture decision.
- Treat docs 1–4 (§ authority order) as the design; treat `current-state.md` as
  a description of code reality that the design is allowed to override.
- When changing world behavior, preserve the structured model and the write gate.
- When changing character behavior, preserve subjective POV and the single
  perception boundary (§9).
- When changing feed/recommendation behavior, preserve behavior-sequence depth
  and explore/exploit balance.
- Keep `current-state.md` and `roadmap.md` honest; never let implementation
  detail leak back up into docs 1–4.
