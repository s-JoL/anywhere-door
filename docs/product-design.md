# Anywhere Door — Product Design

> **Status: the product truth.** What the experience *is*, described purely in
> product terms. It contains **no code symbols, no file paths, and no
> "already implemented"** — it describes the best product, and the code is
> obligated to it, not the reverse. Conflicts resolve upward to `AGENTS.md` and
> `docs/first-principles.md`. Implementation reality lives only in
> `current-state.md` / `roadmap.md`.

## 1. North Star

Anywhere Door is a **private living-world browser**: swipe through countless
doors, push one open, and live inside a structured world through text. Opened
worlds become a personal Doorway Library, not disposable chats.

The hardest promise has two ends:

> Every door is instantly worth opening; every world you stay in keeps becoming
> more real.

The behavioral proof is **return-rate** — whether the user comes back to the same
door (charter §4). Everything in this document is justified by which part of that
promise it discharges.

## 2. Two Audiences, One Product

The product serves two audiences **without splitting into two products** — they
are the same world engine experienced at different points on the control axis
(§10), differing in *degree of control*, not in kind.

- **Entry — immersion players.** Want to swipe into a vivid world fast. Must not
  need to understand engine concepts, lorebooks, character cards, or God Mode.
  First-session success: a door catches them in seconds; the first scene gives an
  obvious thing to do; the world reacts to their specific action; at least one
  character, object, location, or consequence persists.
- **Depth — RP / NSFW / creator power users.** Want control, continuity,
  branching, scene boundaries, slow-burn dynamics, long-term relationship memory.
  Long-term success: the world remembers specific actions, not tags; characters
  have limited POV, private beliefs, secrets, goals; the user can steer, rewind,
  fork, retcon, and edit the private instance; high-control scenes never collapse
  the real-world illusion.

The bridge between them is **single-direction discoverability + channel
isolation**: the default surface is always immersive; advanced surfaces are
hidden but findable; advanced channels never leak into character knowledge
(charter §9). This is the top product risk, so it is stated as a falsifiable bet:
*if power-user surfaces routinely break immersion for entry users, the
one-product thesis is wrong.* The measurable form: among the entry cohort (users
who have never opened an advanced surface), a sustained drop in ten-minute
retention or POV-asymmetry-trigger rate (§24) after advanced surfaces ship is the
falsification signal. Design against that, measure for it.

## 3. Product Shape

### 3.1 Feed (discover)

Lean-back discovery. Each card is a **door crack, not an encyclopedia**:

- door name
- one cold-open line
- mood / intensity
- one unresolved tension
- one obvious "open door" action

The feed avoids: full setting summaries, quest-log framing, backend concepts, and
**raw tags as the primary recommendation surface**. Tags may exist internally;
the experience is doors, hooks, and living possibilities.

A keyless visitor browses the feed and plays the **pre-baked taste** of the
**built-in cold-start pool** (§4.3); reactive play and live-generated doors begin
once a key is present.

### 3.2 Play (first ten minutes + deepen)

Lean-in presence. The first minute shows: the current local scene; one or more
interactable characters / objects / traces; a concrete tension; an immediate
world response after input.

The first ten minutes must prove, concretely:

- something changed in the world,
- somebody remembers or **misremembers** the player,
- a local consequence appears,
- at least one piece of canon is earned.

### 3.3 Doorway Library (return)

Opened worlds are persistent private instances, not disposable chats:

- all opened worlds appear in history;
- pinned worlds enter "my doorway";
- each saved world shows title, last location, unresolved tension, and latest
  consequence;
- return hints stay light; no aggressive notifications.

**Exit settlement and echoes.** Leaving a world is not pausing a chat. On exit, a
bounded settlement pass (not a background simulation) turns the session into a
returnable hook, derived from what actually happened and what is still open:

- **trace** — what the player left behind, drawn from the hardest facts they
  caused: *"You hid the key in your pocket; only the girl saw."*
- **unresolved** — active pressure lines, projected into player-safe language:
  *"Room 201 is still shut. The owner is starting to suspect you."*
- **echo candidates** — plausible return openings the world might surface next
  time: the girl leaves a note; the owner notices the key is gone; 201's door
  opens a crack. These are *candidates*, never committed facts.

On return, the world consumes one candidate plus elapsed time to produce a
**return-open beat**. Returning **advances** the world; it is not the
continuation of the last chat line.

### 3.4 The Atomic Experience (worked example)

The smallest complete proof that this is a world and not a chat is one thread of
cause and consequence — the rainy-inn loop:

1. **The door crack (Feed).** A card shows only the hook:

   > **Don't go upstairs until the rain stops**
   > The innkeeper hands you a damp key. "You gave it to me last night."
   > But you were never here last night.
   > *Open the door: take the key.*

   No genre label, no setting dump — just a reason to push the door.

2. **In the scene (Play).** A concrete local scene: an innkeeper behind the
   counter, a girl by the stairs, a key, a register that reads wrong. One tension
   is live; input invites speech *or* action.

3. **The act.** The player types *"I slip the key into my pocket."* — an action,
   not a chat line.

4. **Witness asymmetry.** The move commits as a fact (the key is in the player's
   pocket — an *anchored* fact, §9). The observation is written only to witnesses
   present: the girl saw it; the innkeeper, head down at the register, did not.
   The innkeeper therefore *cannot* later ask why you hid the key — he has no
   memory of it. The girl may tell, or just glance at your pocket and say nothing.

5. **Exit settlement.** The player leaves. The world freezes (Consequence Mode),
   and settlement records the trace, the unresolved threads, and echo candidates.

6. **The return (echo).** Next entry the world has *moved*, not resumed:

   > You push the inn door open again. The rain has stopped.
   > Every chair is stacked upside-down on the tables. The owner is gone.
   > On the counter, a small note: "I didn't tell him you have the key."

This loop — *I was here, so it changed* — is the core moat. In one minute it shows
a fact changing, two characters holding different versions of it, the change
persisting offstage, and a return that is a consequence rather than a
continuation. The first ten minutes of any world should aim to deliver one such
loop.

## 4. World Generation

### 4.1 Seed as generative contract

A seed is not a content list; it is a generative contract:

- **hard rules** — physics, social order, magic/technology, red lines;
- **tonal gravity** — the emotional/dramatic direction the world slides toward;
- **opening locality** — first scene, first situation, a few interactable
  entities;
- **anchors** — initial characters, locations, factions, secrets, symbols;
- **2–3 semi-hidden pressure lines** (§5);
- **expansion grammar** — how new places/people/objects/lore/consequences appear;
- **canon ledger** — established truths that cannot be contradicted;
- **narration rule** — how the world turns its truth into prose: faithful by
  default, with optional lawful distortion for horror/dream/unreliable worlds
  (§12);
- **executable rule-skills (optional)** — deterministic rules the agentic Director
  runs for precise adjudication in game-y worlds (§22).

The world begins incomplete but unfolds as if it was always complete.

### 4.2 Progressive unfolding

Do not pre-generate a GTA-scale map. Materialize through player attention and
causal pressure. The desired feeling:

> New details feel like they were already there, and the player has just come
> close enough to perceive them.

### 4.3 Access model and the cold-start pool

- **A key is required for reactive play and for generation** (local-first,
  BYO-key); the platform burns no inference of its own.
- **The product ships with a first-class pool of built-in cold-start worlds** —
  including different rule configurations (a faithful drama, a distorted horror, a
  game-y dungeon). A keyless visitor can **browse the feed and play a pre-baked
  taste** of these: a baked cold-open plus a short scripted sample beat that
  conveys the experience with **zero live inference**. It is non-reactive by
  construction — the reactive moat ("the world changes because of *my* specific
  action") begins the moment a key is added, and the sample is plainly a sample,
  never a faked reactive loop. This is the keyless on-ramp and first impression; a
  curated, quality-gated asset, not filler.
- **Reactive play and generating a new world both require a key.**

This threads between two invariants that "let keyless users just play" would
break: a platform-funded reactive trial would break *platform-burns-nothing*, and
a canned reactive transcript would break the *reactive moat*. The pre-baked taste
does neither — it is static (no platform inference) and openly non-reactive (the
real loop is what the key unlocks).

Feed-generation quality is a first-class subsystem co-equal with the runtime,
with its own signals (seconds-to-judge, open-door conversion, take-root rate).

## 5. Pressure Lines

Pressure lines are **unfinished causality, not quests.** Each world starts with
2–3 semi-hidden lines:

- **world pressure** — environment, institution, disaster, scarcity, war, curse;
- **character pressure** — desire, secret, misunderstanding, obsession, betrayal;
- **mystery pressure** — a truth approaching exposure, or changing as the player
  nears it.

**Default pacing:** a small sign every 2–4 turns; one visible change every 6–10
turns; only 1–2 lines active at once; the rest stay latent, cool down, merge, or
sleep.

### 5.1 Fairness principle

Semi-hidden pressure may move, but must not punish without notice:

- if the player had no chance to perceive it, it may only create **signs**;
- if the player saw signs and ignored them, stronger consequences are fair;
- once the player touches it, it becomes anchored canon;
- if ignored too long, it can fade, merge, or resolve offstage at low impact.

### 5.2 Presentation

Default presentation is **diegetic**: rumor, expression, a changed location, a
changed object, someone missing, someone avoiding the player, a message arriving,
an old detail returning with new meaning. **Never show raw clock meters in default
play.**

### 5.3 Thread state (behavioral)

A pressure line is structured world state the Director reads and advances — not a
prose hint. Each carries: its **kind** (world/character/mystery), its **status**
(latent/active/cooling/resolved), how close it is to a visible change, **how much
the player knows** (nothing / signs / partial / revealed), a **plausible next
diegetic sign** (not a script), and the **entities it binds**. The Director
advances a line only through a validated change and surfaces it only diegetically.
The fairness principle becomes a rule: a line may raise the player's awareness to
"signs" freely, but a strong consequence is refused while the player knows
nothing.

## 6. Character Reality

Realism comes from **limited POV**, not prose style. Each important character
distinguishes: objective events, observations, memories, beliefs/hypotheses,
secrets, goals, and the visible local scene. **Characters may be wrong; wrong
belief is a feature.**

### 6.1 Information boundaries

Characters cannot read raw world state. They receive a subjective projection —
what they can see/hear/touch/infer/remember, what they personally witnessed, what
they heard as gossip, and what they believe (including incorrectly). Director and
Reactor stay omniscient; characters do not. All character context flows through
**one** perception boundary (charter §9), so limited POV is structurally
guaranteed, not merely prompted.

### 6.2 Social causality

Make social consequence visible: relationships shift with evidence; memories
decay in intensity but keep their reasons; gossip spreads one hop with
degradation; private belief can drive action; moral judgments differ per
character. The user should feel:

> Not everyone knows what happened. Not everyone agrees what it means.

### 6.3 Belief graph (a read view, not a second truth)

The same fact, held differently by different characters, forms a **fact × observer
view**:

| fact | truth | innkeeper | girl |
|---|---|---|---|
| the key reads 201 | yes | knows | maybe |
| the key is in your pocket | yes | unaware | knows |
| the register lists tomorrow's guest | yes | knows | unaware |

This is **not a new source of truth.** It is a *read view* derived from the
witness-scoped memories characters already hold — it answers "who knows X, and how
sure are they?" for the Director, the Context Inspector, and the player-facing
World Atlas. A character still never reads raw world state; the view only inspects
what each has legitimately witnessed, heard, or inferred.

## 7. Offstage Life

Important characters can leave a scene without being deleted or continuously
simulated. Offstage, an agent is represented by last known location, goal
summary, known facts, beliefs, an optional offstage clock, and a return trigger.
On return the world lazily reconciles what plausibly happened from elapsed time,
goals, known information, pressure lines, rules, and existing canon — the feel of
faraway activity without background simulation.

### 7.1 Precision tiers

Reconciliation is **budgeted by relevance**, not uniform:

- **near (high precision)** — adjacent to the current scene, or linked to an
  active pressure line — may produce a few concrete, sign-bearing changes;
- **related (medium)** — tied to a cooling/latent thread — at most one low-impact
  shift in stance or position;
- **far (frozen)** — unrelated to the scene or any active thread — no changes;
  reconciled lazily only when next touched.

"High-density local simulation, sparse narrative in-fill at the edges."

## 8. Time Modes

- **Consequence Mode (default, the baseline)** — no idle simulation; triggered
  causality is reconciled on return.
- **Pause Mode (later)** — advances only on user input; maximum control.
- **Living World Mode (later)** — important agents and pressure lines advance more
  proactively.

Consequence Mode is the only baseline; Pause and Living World are explicitly later
modes (charter §10, architecture §15.1), not co-present in the MVP. Scope: global
default + per-world override.

## 9. Canon Hardness (three tiers)

Facts earn fixity the way entities earn persistence (charter §8):

```text
ambient   — atmosphere, freely revisable ("the rain is heavy")
anchored  — the player witnessed or acted on it ("the key is in your pocket")
core      — seed-level load-bearing canon, or an authored God fact
```

A proposal may not silently contradict a fact harder than its own authority:
Reactor and character prose cannot overturn what the player saw or did. Only a
God edit revises anchored/core canon, paying a bounded reconcile (§10.4). Hardness
is what keeps the rainy-inn key hidden once pocketed.

## 10. Control Layers (one axis)

Strong control without weakening the default real-world fantasy. The four surfaces
below sit on **one continuous authority axis** (charter §11) with three positions —
*discover* (Player), *steer* (Director Notes + Scene Contract share this band), and
*author* (God) — running from *discovering* a
world to *authoring* it.

### 10.1 Player Mode (default)

Input is player speech, action, or intent. Characters perceive it only if present
and able.

### 10.2 Director Notes

A private steer for pacing, boundaries, tone, and desire direction ("slow this
scene," "make her more proactive," "keep the secret," "gentler tone"). **Director
Notes never become character knowledge.**

### 10.3 Scene Contract

A temporary agreement for the current scene: intensity, boundaries, pacing,
allowed focus, forbidden directions, whether outside pressure is paused.
Important for NSFW, comfort, and high-control RP.

### 10.4 God Mode / Studio Mode

Hard edits to private-instance facts: relationships, goals, prior history,
character position, location state, pressure lines, retcons. Hard edits go
through the validated gate and trigger an **edit-then-reconcile**: contradicted
memories/beliefs are superseded (never deleted), scoped to witnesses of the
now-contradicted events. God edits affect the **private branch, not the public
seed**.

## 11. Input Channels

Free text stays primary, with recognizable (optionally surfaced) channels: **Act**
(what the player does), **Speak** (what they say), **Observe** (what they try to
perceive), **Story/Intent** (what they want to push), **Director Note** (private
steer), **God Edit** (direct private-world edit). This borrows AI Dungeon's input
clarity while preserving natural typing.

## 12. Narration Rule

User-facing prose is the world **re-telling its committed truth through its
narration rule** (charter §13), generated from the truth, not policed after.
Faithful is the default; **lawful distortion** (horror sanity, dream logic, a
world hiding a death) is a rules-level property of the seed, not a toggle. A cheap
consistency guard remains as a backstop, because the prose is still
model-generated and could otherwise slip an unstated "fact" past the player.
Character voices are orthogonal: a character may lie or misremember; such claims
route to belief or a recorded lie, never silently into state.

## 13. Guidance Without Rails

Blank-page anxiety is real, so offer optional next actions: show 2–3 suggestions
when useful; keep them diegetic and scene-specific; never replace free input;
let power users hide them; span different intents (investigate, confront, wait,
comfort, lie, retreat). This gives choice-style affordance without becoming
branching fiction.

## 14. Taste Chronicle

Recommendation must not reduce the user to tags. Maintain a local Taste Chronicle:
raw high-information behavior-sequence snippets, a long-term preference portrait,
recent drift, repeated scene dynamics, avoided patterns, successful bridge
patterns. Door generation uses three modes — **exploit** (fit current desire),
**bridge** (hold deep behavior structure, change surface genre/role/power), and
**explore** (nearby novelty) — at a default **50 / 35 / 15**. **Bridge is the
signature.**

### 14.1 Door DNA

What draws a user is rarely a genre tag; it is a *situation structure*. Each door
carries an internal **Door DNA** richer than tags: skin (surface setting), opening
tension, player role, power relation, emotional texture, core desire, cast
structure, object hooks, world rule, pace. Bridge holds the deep dimensions
(tension, role, power, desire) and swaps the skin — turning a rainy-inn mystery
into a cryo-bay mystery for the same player. Door DNA is internal only; never
shown as raw tags, never leaked into character knowledge.

## 15. Door Passport

The user can maintain multiple player identities (default self, adventurer,
villain, romantic persona, NSFW persona, creator test persona). A world can lock
to one persona; the world knows only what that persona reveals inside it. The
Taste Chronicle may learn across worlds, but world characters do not automatically
know cross-world history.

## 16. World Atlas

A private, in-character record of a world: known locations, characters,
relationships, discovered lore, rumors, unresolved pressure lines, player-visible
chronology, discovered contradictions/mistaken beliefs, important objects. Default
play keeps it in the background; advanced users can inspect it. Inspiration is
"Legends Mode" in spirit, not UI.

## 17. Context Inspector

A Studio/advanced-only debug view: which canon facts were used this turn, which
memories were retrieved, who knows what, who misbelieves what, which pressure line
affected the scene, why a character did not know something, which Director Note /
Scene Contract is active. Hidden from default play; protects immersion for casual
users while giving power users insight.

## 18. Timeline Forks

Forking and rewind are core: regenerate last response, rewind last turn, fork from
a previous turn, retcon private canon, and (on explicit request) preserve
relationship changes while rewriting scene prose. Continuity matters, but the user
owns their private branch — and a fork must never leak old-branch state into the
new branch.

## 19. Seed Studio

Creators eventually edit world contracts directly: rules, tonal gravity, opening
scene, anchors, pressure lines, expansion grammar, lore, character imports,
director profile, safety/boundary defaults, narration rule, and (for game-y
worlds) executable rule-skills. **Imported character cards are not framed as
entering through the player's door** — they become native entities in a generated
or edited world seed.

## 20. Director Profiles

Product-level presets instead of raw model knobs: slow-burn romance, dangerous
intimacy, survival pressure, mystery-first, cozy slice-of-life, dark fairytale,
social intrigue, high-agency sandbox, tragic epic, absurd comedy. Profiles tune
pacing, pressure frequency, narration style, character initiative, risk level, and
default suggested actions.

## 21. Home / Base / Anchor

Long-term retention benefits from a place or relationship that belongs to the
user: a room, base, shop, ship, recurring table, relationship nest, faction role.
These are structured world entities that gather memory, objects, relationships, and
pressure — not decorative UI. Returning should feel like resuming a life.

## 22. Game-y Worlds

Game-y worlds (precise combat, scoring, puzzles, small economies) are **in scope
and attempted**, not deferred. They are delivered by the **agentic Director**
(charter §14): when a world needs precise adjudication it computes
deterministically (a ledger / executable rule-skill) and proposes the result as a
validated change; when it does not, it degrades to pure narration at no cost.

Product rules for game-y worlds:

- **Mechanics stay diegetic by default.** A fight is felt as a fight; raw numbers
  surface only in an advanced/Studio view, like the Context Inspector.
- **Determinism where it matters, prose elsewhere.** Use computation for what must
  be fair and exact (a hit lands, a lock is picked, gold is spent); leave color to
  narration.
- **Rule-skills are seed assets.** A world's combat or puzzle logic is part of its
  contract and is reusable across instances of that seed.
- **A cold-start game-y template ships in the pool** (§4.3) so the capability is
  provable from first use.

Large-scale numeric simulation (4X throughput, colony economies) stays **out** —
a per-turn-budget limit, not an architectural one (charter §16).

## 23. NSFW and Boundary Control

Unrestricted within platform baseline and creator red lines, but high-control
scenes get explicit tools: pause, lower/raise intensity, change tone, stay in
scene, stop a direction, rewrite last turn, set scene boundaries, keep/discard
specific relationship consequences. **"Adult mode" is not a separate ontology** —
it is an application of Director Notes, Scene Contract, and private control.

## 24. Metrics (return-rate funnel)

The product is not measured by chat turns but by whether a door becomes a world
the user owns.

| Metric | What it tells us |
|---|---|
| card dwell rate | did the door crack hook the user |
| open-door rate | did the user push the door |
| first-action rate | did the user understand how to play |
| ten-minute retention | did the world catch the user |
| first-consequence rate | did the user feel they changed something (first player-anchored fact) |
| **return rate** | **did the user come back to the same world (north star)** |
| same-world second-session time | were the echoes effective |
| pin rate | did the user treat a door as a private collection |
| world-object interaction rate | did the user treat it as a world, not a chat |
| POV-asymmetry trigger rate | was limited POV actually felt |

The funnel — `card-dwell → open-door → first-action → ten-minute-retain →
first-consequence → return → pin` — is **local-first instrumentation**; it never
leaves the browser and never reaches characters.

## 25. Anti-Patterns

Each is a way the core promise collapses:

- **Too much like a chat app.** Dialogue bubbles with no scene, object
  interaction, or visible consequence. The user must feel they are *acting in a
  scene*, not talking to an AI.
- **Too much like a quest game.** Quests, levels, progress bars break suspense.
  Let the user discover something is wrong; don't tell them where to go.
- **Over-reliant on long prose.** Text-first ≠ walls of novel prose. Use short
  lines, pauses, sounds, objects, expressions, scene state, return-visit change.
- **Endless but empty.** Infinite generation is not an advantage. Without a strong
  opening, a strong consequence, and a strong echo, every door fatigues.
- **Omniscient NPCs.** A character that knows everything kills the world. Every
  character needs boundaries, misunderstandings, secrets, and goals.
- **Director retconning at will.** The Director holds the truth but may not casually
  overturn what the player saw, did, or witnessed; anchored canon (§9) is
  respected — revision is a God edit that pays a reconcile.

## 26. First-Phase MVP

1. Feed of doors with cold-open cards, fed by a curated built-in cold-start pool.
2. Generated medium seed: rules, tone, opening, anchors, 2–3 pressure lines.
3. Structured world loop: propose → validate → apply → log.
4. Entity lifecycle: ambient → hinted → stub → fleshed, agentic only when a
   private POV matters.
5. Character knowledge: observations, memory, belief, secret, goal.
6. Semi-hidden pressure lines shown diegetically.
7. Consequence Mode as default time behavior.
8. Doorway Library with pinned worlds and echoes.
9. Taste Chronicle using behavior sequences, not tags.
10. Basic Director Notes and regenerate / rewind.
11. One game-y cold-start template proving the agentic Director path.

## 27. Later, Not Now

Avoid until the core loop works: full shared multiplayer; always-live background
simulation; full map UI; every NPC as an agent; complex economy / creator
marketplace; voice-first or image-first product; deterministic big-map
pre-generation.

## 28. Product Invariants

1. The door belongs to the player; other entities are native to the world.
2. Text is the interface, not the world substance.
3. Structured state and validated changes define reality.
4. The model proposes; the engine validates.
5. Characters have partial POV; Director/Reactor are omniscient orchestration.
6. Persistence (and canon hardness) is earned by attention, recurrence, causality.
7. The world should feel larger than the current text, but the current text must
   be able to change it.
8. God Mode edits the private branch, not the public seed.
9. Recommendation learns from behavior sequences, not labels.
10. Default experience is immersion; advanced control is available when desired.
