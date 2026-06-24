# Anywhere Door — First Principles

> **Status: derivation, implementation-agnostic.** This document re-derives the
> product and the architecture from the fewest possible premises (human desire +
> the nature of perception + physical constraints) and shows they fall out as
> *consequences*, not preferences. It is the "why" behind the charter.
>
> **Authority:** if this conflicts with `AGENTS.md`, the charter wins; this file
> supplies the reasoning chain. It contains no code symbols and no description of
> the current implementation — those live only in `current-state.md` /
> `roadmap.md`.

## Part 0 — What this document answers

Most design writing is "conclusion + argument that the conclusion is right." This
reverses it: assume the least, and watch whether the product and the architecture
*grow* as theorems. If they do, the design was **forced**, not decreed. The
largest finding is that the whole architecture grows from **one axiom** (a single
source of truth); control, God Mode, personalization, perception, materialization,
and the write gate are all its branches.

## Part 1 — The kernel, derived

### 1.1 The real desire

Strip every category label ("AI roleplay," "AI text adventure") and one desire
remains:

> **To step into another world, and have that world be "real" — it changes
> because of me, it remembers me, and it can still surprise me.**

"Real" splits into three operational demands: **causality** (acts have
accumulating consequence), **persistence** (leave and return without reset), and
**surprise** (the world holds parts I don't author and can push back, rather than
echoing what I write).

### 1.2 Three existing forms each miss a corner

| Form | Causality | Persistence | Surprise | Reactivity depth | Missing corner |
|---|---|---|---|---|---|
| Book / linear fiction | ✓ (fixed) | ✓ | ✓ (crafted) | **zero** | there is no "me" |
| Video game | ✓ | ✓ | partial | **bounded** (pre-built cost ceiling) | reactivity capped by authoring cost |
| AI chat / roleplay | **✗** | **✗** | ✓ (high variance) | unbounded | the world **does not exist between two messages** |

AI chat first delivered **unbounded reactivity**, at the cost of a total absence
of structural reality. To see exactly what it lacks, look at what a "real world"
is at the level of *perception* — which yields the deepest premise.

### 1.3 The deepest axiom: a single source of truth (star topology)

In reality I only ever touch **part** of the world; so does every other mind.
This creates a fatal problem:

> **If every partial perceiver runs its own model and independently generates or
> elaborates reality, they develop mutually contradictory worlds. Multiplicity
> itself diverges — even if every model is perfect.**

Two characters describing the same room back-to-back invent two rooms; one
character's "yesterday" won't match another's. To let N partial perceivers share
**one** world without forking, the only solution is:

> **A single omniscient hub holds the one true world and distributes "what you
> perceived" to each. This is a star topology — one hub of truth, many partial
> spokes — never a mesh of N independent minds.**

This axiom is the root of the architecture. It emits exactly two arrows, and
those two arrows **are** the runtime:

- **Outward (perception / push):** hub → each agent's **partial projection**. An
  agent never reads the raw truth.
- **Inward (agency / pull + propose):** an agent has subjective agency — it
  actively **pulls** information (observe, probe, interact) and **proposes**
  change (act); both **return to the hub for adjudication**. "Lean in close →
  the world materializes that corner on demand" is a pull, also through the hub,
  so two people looking at the same corner see the **same** corner.

A corollary wires the control model to the root: the player and characters are
**symmetric inside the world** — both partial, both pull/propose only through
in-world action (a character cannot read omniscient truth, or information
asymmetry collapses). **The player's sole asymmetry is an extra out-of-world
authority axis** (Part 2.4).

### 1.4 The LLM is renderer and proposer, not the world

A single hub holding the one truth means the truth must be something a single
authority can **hold, validate, and distribute** — i.e. **structured,
validatable state**, not "one model's latest sentence." Therefore:

> **The world = a layer of structured, validatable state (the hub). The LLM
> renders it into prose and parses natural language into proposals; the model
> never writes the world directly — it only proposes, and the hub validates
> against immutable rules before anything commits.**

This is more durable than "LLMs forget, so bolt on a database": the state
machine's necessity comes from **consistency under multiplicity**, not from one
model's memory. Even a model with perfect recall, if the world is shared by
**multiple** partial perceivers, still needs a single hub or they diverge. The
state machine also happens to be the substrate of **control** (God edits, Atlas
reads, forks, red-line checks all require the world to be readable, checkable,
editable, forkable). So it survives stronger models.

**Corollary: the hub can itself be an agent.** The hub need not be a fixed
prompt — it can be a tool-using, computing agent that processes the truth by the
world's own rules, in both directions:

- **Inward (compute):** when the world needs precise adjudication (combat
  resolution, scoring, puzzle logic, a small economy), the Director-agent
  **actually computes** (deterministic code / a ledger) and proposes the result
  as a change → validated → committed; when not needed, it degrades to plain
  narration at zero cost.
- **Outward (transduce):** what the user reads is not free prose but the world
  **re-telling its truth by its own rules** — faithful by default, with lawful
  distortion (horror / dream / gaslight) produced *legitimately* by the world's
  rules, the hub holding the real truth underneath.

Both directions still pass the gate (computed results are validated and logged;
transduction never mutates truth).

### 1.5 Why betting on text is forced

The core value is **reactivity depth** (any character, any branch, any
consequence holds). Its bottleneck is the marginal cost of "one more kind of
reaction": voiced / AAA-rendered NPCs cost recording and animation per line →
cost explodes → reactivity is capped shallow. Text costs only more tokens per
reaction → marginal cost approaches zero. **Text is not an aesthetic preference;
it is the only currently affordable medium for unbounded reactivity.** Image and
voice as render-layer assets do not conflict.

### 1.6 Constraints × aesthetics: over-determined

| Hard constraint (physical) | The product feature it forces | Why it *also* makes the world more real |
|---|---|---|
| Every turn spends real money on the LLM | **BYO-key + local-first** & **Consequence Mode** (freeze on leave, lazily reconcile on return) | platform burns nothing → privacy is the user's, content can be unrestricted; "no idle sim, reconcile on return" *is* the feel of a world that evolved plausibly without spinning |
| The context window can't hold the whole world | **ambient-by-default / earned persistence** | "new detail feels like it was always there, you just came close" — progressive unfolding as aesthetic |
| The LLM hallucinates / contradicts / overreaches | **propose → validate → apply gate** | referencing a thing that doesn't exist = an illegal change, dropped → never self-contradicts; characters know only what they witnessed → information asymmetry and drama |

**The point is not "aligned," it is over-determined.** Ambient-by-default, for
instance, is pointed at by three *independent* forces — context can't hold it,
authors can't hand-build a GTA map, and the "always-there" aesthetic. Multiple
independent forces converging on the same feature is the real reason to trust it.

Honest boundary: alignment holds at the **kernel** layer; at the **execution**
layer the three forces diverge (Consequence Mode is an acceptable hallucination
under zero-idle, with residual quality gap vs. true simulation; latency fights
immersion) — that is the battlefield of Part 4.

### 1.7 The kernel (immovable; each a corollary above)

1. **Single source of truth / star topology** — one hub holds the world,
   distributes partial projections; agents never read raw truth, only
   pull/propose through the hub. (1.3)
2. **The world is a state machine; text is its render/interaction layer; the
   model proposes, the hub validates, only then does it commit.** (1.4)
3. **The door belongs to the player.** The player is the only entity entering
   from outside; everything else unfolds from the world.
4. **Ambient by default; crystallize only when persistence is earned.** (1.6)
5. **Characters receive subjective projections (mechanical fact as floor); the
   user's prose is also the world transducing its truth (faithful by default);
   Director/Reactor are omniscient but not characters.** (1.3 / 1.4)
6. **Interaction-driven; freeze on leave; lazily reconcile on return
   (Consequence Mode).** (1.6)
7. **Local-first, BYO-key, unrestricted-capable.** (1.6)

## Part 2 — The product, as a corollary of the kernel

### 2.1 North star and the hardest promise

> **A private living-world browser:** swipe through countless doors, push one
> open, live inside it through text; an opened door is a private world instance
> that grows more real and more *yours* over time.

The hardest promise has two ends, serving the two ends of the funnel:

> **Every door is instantly worth opening** (acquisition); **every world you stay
> in grows more real** (retention).

### 2.2 The funnel = a chain of proof obligations

| Stage | What the user is doing | The proposition that must be proven on the spot | Delivered by |
|---|---|---|---|
| **Discover** | swiping the feed | "this door is worth opening" — judgeable in seconds, hooking, non-repetitive | taste engine + cold-open cards + generator |
| **Cross** | pushing the door | "I really walked from outside into an inside" | open-door transition + 2nd-person cold open |
| **First ten minutes** | first turns | ① something changed because of me ② someone remembers / misremembers me ③ one local consequence ④ one piece of canon earned | the turn loop |
| **Return** | reopen next day | "the world moved plausibly while I was gone, and did not reset" | Consequence Mode reconcile + Library echo |
| **Deepen** | long play, same world | "it understands the *me* in this world more and more" | relationship ledger + subjective memory + pressure lines + anchor |
| **Control** | advanced user | "I can direct / fix / fork without breaking the realness" | the control axis (2.4) |

Design discipline, in one line: **any new feature must name the row it discharges;
if it discharges none, it is off by default.**

### 2.3 Product surfaces map to the funnel

- **Feed (discover):** a door crack, not an encyclopedia; tags are not the
  recommendation surface.
- **Play (first ten minutes + deepen):** lean-in presence; visible consequence
  for the user's specific act.
- **Doorway Library (return):** persistent private instances carrying last
  location / tension / consequence / relationships; a light echo.
- **Control axis (control):** see 2.4.
- **Taste Chronicle (the engine of discovery):** learns **behavior sequences**,
  not tags; exploit 50% / bridge 35% / explore 15%, with bridge as the signature
  (hold the deep attraction structure, swap only the surface).

### 2.4 One unified control axis (the product's hinge)

Control is not four parallel "modes"; it is **one continuous axis: how much
authority the user has over world fact (discover ←→ author)**. It sits directly
on the axiom (1.3): the player is already a symmetric in-world agent; this axis
is their extra out-of-world authority knob.

| Position | What it may propose | Essence |
|---|---|---|
| **Pure Player** | prose → Reactor → change, must be in-world plausible (a locked door blocks you) | **discover** the world |
| **Director Notes / Scene Contract** | **directional soft change** (tension / pacing / disposition lean / the world's attention to you), channel-isolated from character knowledge | soft steering |
| **God / Studio** | **any hard change** (relationship numbers, retcon, establish prior history), still validated + logged + private branch only | **author** the world |

**The invariant across the whole axis (why first principles survive):**

> At any point on the axis, the only way to change the world is a validated change
> written to the log. More authority raises *which kind* of change you may
> propose — **never whether you can bypass the gate. The gate is never bypassed.**
> Therefore **the world you author is as real as the world you discover**
> (consistent / persistent / auditable / forkable).

This resolves the long-standing "real indifferent world vs. world that revolves
around me" tension: they are not opposites but the **two ends of one axis**; the
realness invariant (gate + hub) holds at both. Want a cold hardcore world? Turn
the knob to discover. Want characters fascinated by you, the world yielding? Turn
it to author — but *why* they're fascinated still enters the relationship ledger,
is still bound by information asymmetry, and the locked door still blocks you.

**A free corollary — personalization gets absorbed:** "the door understands you"
= the system auto-presetting this knob from the Taste Chronicle (the world's
initial compliance), acting **only at the Director/God layer, never becoming a
character's in-world knowledge** — which exactly preserves the "taste must not
leak into character knowledge" invariant. Control, God Mode, and personalization
collapse into one model.

### 2.5 How the two audiences avoid splitting into two products

The entry immersion player (zero concepts) and the deep RP / NSFW / creator power
user coexist via **single-direction discoverability + channel isolation**: the
default surface is always immersive; advanced surfaces are hidden but findable.
This is **one product** — the same world engine experienced at different points
on the control axis (2.4), differing only in *degree of control*, not in kind.
Channel isolation is the non-negotiable discipline that makes it one product (it
is a standing tax — see Part 4.5).

### 2.6 The access model, forced by cost

The per-turn-cost constraint (1.6) forces BYO-key, which creates a top-of-funnel
problem: if browsing itself requires a key and spends money, acquisition dies at
the door. But the obvious fix — "let keyless visitors just play the built-in
worlds" — collides with two of our own invariants: *reactive* play needs live
inference, which either the platform pays (breaks "platform burns nothing", 1.6)
or is faked with a canned script (breaks the reactive moat, "it changed because of
*my* action"). The resolution threads exactly between them:

> **A key is required for *reactive play* and for *generation*. The product ships
> with a first-class pool of built-in cold-start worlds** — including different
> rule configurations — **that a keyless visitor can browse and play as a
> *pre-baked taste*:** a baked cold-open plus a short scripted sample beat,
> conveying the experience with **zero live inference**. It is non-reactive by
> construction — the reactive loop begins the instant the user adds a key.
> Generating a *new* world always costs a key.

This keeps both invariants intact: the platform burns nothing (the taste is
static), and the reactive moat is never faked (the canned beat is plainly a
sample, and the *real* "changes because of me" loop is exactly what the key
unlocks). The cold-start pool is the keyless on-ramp; live creation and reactive
play are the BYO-key engine.

## Part 3 — The architecture, as a corollary of the product

### 3.1 The world's engineering definition

```text
world = immutable rules
      + a mutable validated state snapshot (the source of truth, the hub)
      + an append-only log of validated changes
      + each agent's subjective records (projections)
```

### 3.2 Two arrows = the whole runtime

The two arrows of 1.3, in engineering terms:

- **Outward (perception):** the hub computes each agent's subjective projection
  (carrying provenance) — never raw state.
- **Inward (agency):** player/character input is routed by channel — speech /
  action / observe (pull) / story-intent / director-note / god-edit; a pull
  triggers materialization, a propose triggers the consequence translator; **all
  return through the single write gate to the hub.**

### 3.3 A turn-scoped, layered runtime (conceptual modules)

The runtime is a bounded sequence of cooperating roles, not one monolith and not
an always-running server loop (rationale = the cost constraint, 1.6):

- a **turn orchestrator** owning one locked interaction;
- an **input router** classifying the channel;
- the **write gate** — the sole durable writer;
- a **context assembler** producing typed context packs;
- a **perception resolver** — the single boundary that feeds characters;
- a **Director** (omniscient orchestration, optionally computing — 1.4);
- a capped set of **character agents**;
- a **Reactor** translating events into proposed changes;
- a **materializer** crystallizing earned entities;
- a **memory/belief system** holding subjective records;
- an **offstage reconciler** for Consequence Mode;
- a **taste/seed runtime** (outside the world instance) and a **studio runtime**
  for power surfaces.

Module *responsibilities* are specified in `architecture.md`. This file commits
only to their existence and to the rule that they are extracted around the single
write gate and the single perception boundary.

### 3.4 Full turn flow + fast/slow path (taming latency)

A turn is several serial LLM calls on the user's key, so split it by "does this
block the user reading the first prose?":

- **Fast path (blocks first token):** Director casting + the chosen character
  **streaming** speech → the user has something to read immediately.
- **Slow path (parallel to streaming / settled after):** Reactor commits changes,
  memory, gossip, post-pass fleshing. **Structural truth may settle slightly
  later than prose, as long as it commits before the next turn builds context.**
- **Commit barrier:** an instance lock — one turn commits at a time; the user may
  *read* at once, but the next turn's *commit* waits for this turn's structural
  settle (usually shorter than reading time, so it's imperceptible).
- **Depth tiers (fast / standard / deep)** scale the slow path. Ship a single
  tier first; tiers follow as the cost valve.

### 3.5 How perception is produced: mechanical floor + directed salience

The landing point of "the hub tells each one what they perceive":

- **Fact layer** = a deterministic filter of state (who's present / what's
  visible / one's own memory) — **structurally cannot diverge, and cheap**.
- **The Director** only adjusts **salience / attention** on top (foreground a
  pressure-line sign, "you only now notice someone in the corner"), and **never
  invents fact**.

This rejects "the Director generates each perception": that would make perception
itself generative — reintroducing the divergence it was meant to kill — and is
expensive per character. Facts grounded, framing free.

### 3.6 A God hard-edit = a change + a witness-scoped reconcile

God does not break rules; it has the widest legal proposal right, still validated,
auditable, reversible:

1. God hard-edit → through the write gate (authored provenance);
2. triggers a consistency repair that aligns contradicted memories / beliefs /
   relationship evidence;
3. **supersede, not delete** (forced by the append-only invariant): old records
   are marked superseded + an overriding record appended → an inspector can show
   "rewritten on turn N," a fork can return to before the retcon;
4. **cascade depth = witness scope:** align the named entities + everyone who
   **witnessed the now-contradicted fact**; deeper second-hand hearsay is left to
   natural decay. Consistency is guarded exactly at the layer that could "catch
   the world out," so the cost is naturally bounded.

## Part 4 — Execution-layer hard problems: chosen directions

1.6 said constraints and aesthetics align at the kernel; here is where they
diverge at the execution layer, with the direction taken.

### 4.1 A — rendering consistency: narration = the world transducing its truth

The gate protects committed **state**, but the user reads **prose**. The
resolution is not "free prose + post-policing" but defining narration as **the
world re-telling its truth by its own rules** (1.4 outward):

- **Generated from truth, not policed after.** Truth is the source material of
  narration (the hub's fact snapshot feeds the prose), so grounding is
  **structural**.
- **Faithful by default; distortion is a world rule.** "What the world knows" and
  "what it tells the outside" may differ: horror / dream / heist worlds distort
  *lawfully* by rule (low sanity → walls bleed; the world hides a death). This is
  a **rules-level setting** (peer to physics / red lines), part of the seed, not
  a toggle.
- **The hub always holds the truth** → distortion is recoverable, not real
  divergence.
- **But narration is still model-generated, so keep a cheap consistency guard.**
  Grounding-from-truth removes *systematic* drift, but a model can still slip a
  fact absent from the snapshot into prose, and the user will believe it and act
  on it — possibly seeding a spurious change. A lightweight guard catches such an
  assertion before it misleads; it is a backstop, not the source of grounding.
- **Character voices are orthogonal:** a partial perceiver may lie / misremember
  → routed to belief or a recorded lie, never silently into state. World
  transduction (medium) and character lying (agent) are two layers, composable.

### 4.2 B / C — latency + cost (one economic problem)

See 3.4: fast/slow path + instance-lock barrier + depth tiers. Residual
trade-off: whether depth tiers ship in the MVP (recommendation: single tier
first).

### 4.3 D — Reactor gating + precision (where cost meets "the world is alive")

- **Gating = the Director judges in passing, biased toward running:** the
  Director is already running and omniscient; have it carry one extra "structural
  change likely this turn" flag → **zero extra call**. **When uncertain, run** —
  "better to spend one more call than let the world forget" encodes the cardinal
  value (under-committing = "the knocked-over cup is forgotten next line") into
  the default.
- **Precision:** evidence-first + a critic loop (each change carries the prose
  evidence it rests on; rejections record a reason); high-consequence changes get
  a second check, low-consequence pass liberally.

### 4.4 Feed cold-start cost and quality (top of funnel)

Generating good doors is itself a chain of LLM calls; under BYO-key, "browsing
costs a key" is acquisition friction. Direction (per 2.6): **a strong static /
built-in cold-start pool** (keyless first impression) + a background
pre-generation pool + diversity constraints. Treat feed-generation quality as a
first-class subsystem co-equal with the runtime, with its own metrics
(seconds-to-judge, open-door conversion, take-root rate) and a named owner.

### 4.5 The standing tax of channel isolation

Every added power surface re-pays an isolation tax, and a leak fails **silently**
(the world "knows what it shouldn't"). Direction: make "a character's projection
never contains a director note / scene contract / cross-world taste / un-canonized
god edit" a **standing assertion**, and keep the **perception resolver as the
single entry that feeds characters**, so isolation is held in exactly one place.
This is elevated to a charter invariant (`AGENTS.md` §9), not left to vigilance.

## Part 5 — Coverage: pressure-testing the world design space

Run every "world / game" type against the architectural assumptions (single
source of truth / turn-based no-idle / change gate / subjective POV / text medium
/ **agentic world**). The counter-intuitive conclusion:

> **"Weird" is cheap; "game-y" is what's expensive.**

- **Sweet spot (built for this):** character-driven drama / RP / mystery / social
  intrigue / romance / survival / horror / detective / dungeon exploration.
- **Surprisingly coverable (weird ≠ uncoverable)** — just lore + perception filter
  + rules-as-change: alien cognition (swap the projection filter), Rashomon (one
  logged event + divergent subjective memories — already native), non-Euclidean /
  shifting space (change connections), time loops (fork-reset + cross-loop player
  memory), procedural endless exploration (attention-driven materialization fits
  natively), unreliable reality / a lying world (= the lawful distortion of 4.1).
- **Covered via the agentic world (scope expands):** precise combat adjudication /
  scoring / exact puzzles / small economies — the Director-agent **actually
  computes** (1.4 inward), not improvised by the LLM; each world's rules can
  become a reusable executable skill. **The architecture supports this; the build
  is deferred until the core drama / return loop is validated** — game-y is a
  proven *appetite* but not yet a proven *retention* driver, so it is a target,
  not an MVP line (it must still earn its funnel row, §2.2).
- **Still out (excluded by design — do not chase):** ① twitch / real-time
  (platformers, shooters, rhythm) — the text medium can't; ② large-scale numeric
  simulation (4X, Factorio throughput, colony economies) — not the architecture
  but the per-turn budget; ③ real-human multiplayer / social deduction — excluded
  by single-player private instances.

> Net: the architecture is **expressively complete** for its target (text living
> worlds); the agentic world pulls "game-y" from outside the range into the
> coverable. The remaining boundaries (twitch, large-scale sim, human multiplayer)
> are **deliberate scope choices**, not accidental gaps.

## Part 6 — Initial seed strategy

### 6.1 Source selection

A seed is a **generative contract**: what must be rich is the **world and its
pressures**, not a fixed plot. A thriller-on-rails makes a poor seed (its value
is a fixed plot); a world rich in factions / secrets / unresolved causality makes
an excellent one. **Choose worlds where the *world* is valuable, not the plot.**

### 6.2 Three IP routes (all of them)

- **Platform-original:** fully original seeds.
- **Structural homage:** original worlds with trademarks stripped, borrowing the
  *kind* of pressure / tone / social structure (legally safe).
- **Open user-local import:** BYO-key + local-first make "import an IP" a
  **private user action** (not platform distribution), like a SillyTavern
  character card.

### 6.3 Two contract fields these principles add

- **Narration rule:** faithful / lawful-distortion — see 4.1, a rules-level
  property.
- **Executable rule-skills (optional, for game-y worlds):** deterministic combat
  / scoring / puzzle computation the Director-agent runs on demand — see Part 5.

### 6.4 Candidate archetypes (each showcases one engine strength + discharges one funnel row)

| Archetype | Structural inspiration (not IP) | Engine strength shown | Funnel proof |
|---|---|---|---|
| Closed-manor murder | Christie / Knives Out | witness scope + secrets + asymmetry | first ten min: someone **misremembers** you |
| Isolated station / ship | Alien / Firefly / Expanse | offstage evolution + anchor + survival pressure | return: the world moved while you were gone |
| Rotten-precinct night | Disco Elysium / True Detective S1 | pressure lines + moral divergence + POV | first ten min: one local consequence |
| Hidden urban society | VtM / Dresden | faction intrigue + on-demand lore | deepen: lore crystallizes into canon |
| Drifting border zone | STALKER / Soulslike | attention-driven materialization + ambient lore | cross: push-the-door atmosphere |
| Slow town | Twin Peaks / slice-of-life | relationship depth + return value | retention: like returning to a life |
| One-night dungeon (game-y template) | light TRPG | **agentic world**: deterministic combat / checks | proof that game-y is mechanically sound |
