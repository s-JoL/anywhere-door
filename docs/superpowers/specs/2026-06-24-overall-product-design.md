# Anywhere Door Overall Product Design

Date: 2026-06-24

Status: product design approved for written review; not an implementation plan.

## 1. Product North Star

Anywhere Door is not an AI novel generator, and not merely AI roleplay chat.

It is a **private living-world browser**:

- The feed helps the user discover countless doors.
- A door opens into a private, structured world instance.
- Text is the interaction surface, not the world substance.
- The world substance is `WorldRules + WorldState + validated Delta`.
- Long-term play turns opened worlds into a personal doorway library.
- A hidden-but-available Director/God layer lets advanced users control pacing, boundaries, and private canon.

The hardest promise is:

> Every door feels instantly inviting; every world the user stays in feels like it keeps becoming more real.

## 2. Target Users

The product should serve two core audiences without splitting into two products.

### 2.1 Entry Audience: Immersion Players

These users want to swipe into a strange, vivid world quickly. They should not need to understand engine concepts, lorebooks, character cards, or God mode.

Their first-session success condition:

- A door catches them in seconds.
- The first scene gives them something obvious to do.
- The world reacts to their specific action.
- At least one character, object, location, or consequence persists.

### 2.2 Depth Audience: AI RP / NSFW / Creative Power Users

These users want control, continuity, branching, scene boundaries, slow-burn dynamics, and long-term relationship memory.

Their long-term success condition:

- The world remembers specific actions, not just tags.
- Characters have limited POV, private beliefs, secrets, and goals.
- The user can steer, rewind, fork, retcon, and edit the private instance.
- The system supports high-control scenes without collapsing the real-world illusion.

## 3. Product Shape

### 3.1 Feed

The feed is for lean-back discovery.

Each card should be a door crack, not an encyclopedia. It should show:

- door name
- one cold-open line
- mood / intensity
- one unresolved tension
- an obvious "open door" action

The feed should avoid:

- full setting summaries
- quest-log framing
- backend concepts
- visible tags as the primary recommendation surface

### 3.2 Play

The play route is for lean-in presence.

The first minute should show:

- the current local scene
- one or more interactable characters / objects / traces
- a concrete tension
- immediate world response after user input

The first ten minutes should prove:

- something changed in `WorldState`
- somebody remembers or misremembers the player
- a local consequence appears
- at least one new piece of canon is earned

### 3.3 Doorway Library

Opened worlds are not disposable chats. They should enter a personal doorway library.

Recommended behavior:

- all opened worlds appear in history
- pinned worlds enter "my doorway" / "doorway library"
- returning worlds can show a light "echo" hint
- no aggressive notifications in MVP
- each saved world shows its title, last location, unresolved tension, and latest consequence

## 4. World Generation Model

### 4.1 Seed As Generative Contract

A seed is not a content list. It is a generative contract.

Recommended medium seed contents:

- hard rules: physics, social order, magic/technology, red lines
- tonal gravity: what emotional and dramatic direction the world naturally slides toward
- opening locality: first scene, first situation, a few interactable entities
- anchors: initial characters, locations, factions, secrets, or symbols
- 2-3 semi-hidden pressure lines
- expansion grammar: how new locations, people, objects, lore, and social consequences should appear
- canon ledger: already established truths that cannot be contradicted

The world should begin incomplete, but unfold as if it was always complete.

### 4.2 Progressive Unfolding

Anywhere Door should not pre-generate a GTA-scale world. It should materialize the world through player attention and causal pressure.

The core loop:

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

The desired feeling:

> New details feel like they were already there, and the player has just come close enough to perceive them.

## 5. Entity Lifecycle

Locations, objects, lore, and characters should share one lifecycle:

```text
ambient
-> hinted
-> named stub
-> fleshed structured entity
-> agentic entity
-> offstage / summarized
-> retired
```

### 5.1 Earned Persistence

An entity becomes structured when it earns persistence. Triggers include:

- explicit player interaction
- repeated appearance
- causal power
- private knowledge / belief / agenda
- connection to a pressure line

Detailed prose alone is not enough. A vivid passerby can remain ambient. A briefly mentioned missing sister may deserve structure if she anchors secrets, relationships, or future consequences.

### 5.2 Agency Test

An entity becomes an agent iff it has a private POV that drives the fiction.

- A button is state.
- A locked door is state.
- A haunted mirror with secrets, beliefs, and goals is an agent.
- A person who only decorates a crowd can remain ambient.
- A person whose private knowledge or goal changes the scene becomes an agent.

## 6. Pressure Lines

Pressure lines are not quests. They are unfinished causality.

Each world should start with 2-3 semi-hidden pressure lines:

- world pressure: environment, institution, disaster, scarcity, war, curse
- character pressure: desire, secret, misunderstanding, obsession, betrayal
- mystery pressure: truth approaching exposure, or truth changing as the player approaches

Recommended default pacing:

- every 2-4 turns: a small echo or sign
- every 6-10 turns: one visible pressure-line change
- only 1-2 pressure lines active at once
- the rest stay latent, cool down, merge, or sleep

### 6.1 Fairness Principle

Semi-hidden pressure can move, but it must not punish the user without notice.

- If the player has no chance to perceive it, it can only create signs.
- If the player perceives signs and ignores them, stronger consequences are fair.
- Once the player touches it, it enters active canon.
- If ignored for too long, it can fade, merge, or resolve offstage in a low-impact way.

### 6.2 Presentation

Default presentation should be diegetic:

- rumor
- expression
- changed location
- changed object state
- someone missing
- someone avoiding the player
- a message arriving
- an old detail returning with new meaning

Do not show raw clock meters in the default play experience.

## 7. Character Reality

Character realism comes from limited POV, not just prose style.

Each important character should distinguish:

- objective events
- observations
- memories
- beliefs / hypotheses
- secrets
- goals
- visible local scene

Characters may be wrong. Wrong belief is a feature, not a bug.

### 7.1 Information Boundaries

Characters cannot read raw `WorldState`. They receive a subjective projection:

- what they can see, hear, touch, infer, or remember
- what they personally witnessed
- what they heard as gossip
- what they believe, including incorrect beliefs

Director and Reactor remain omniscient, but characters do not.

### 7.2 Social Causality

The system should make social consequences visible:

- relationships shift with evidence
- memories decay in intensity but keep reasons
- gossip spreads one-hop with degradation
- private belief can drive action
- moral judgments differ per character

The user should feel:

> Not everyone knows what happened. Not everyone agrees what it means.

## 8. Offstage Life

Important characters can leave the current scene without being deleted or continuously simulated.

When offstage, an agent should be represented by:

- last known location
- goal summary
- known facts
- beliefs
- optional offstage clock
- return trigger

On return, the world lazily reconciles what plausibly happened based on:

- elapsed real time / game time
- character goals
- known information
- pressure lines
- rules
- existing canon

This gives the feeling of faraway activity without full background simulation.

## 9. Time Modes

World time should be selectable.

Recommended modes:

- **Pause Mode**: only advances after user input; maximum control.
- **Consequence Mode**: default; no idle simulation, but triggered causality is reconciled on return.
- **Living World Mode**: important agents and pressure lines advance more proactively.

Scope:

- global default setting
- per-world override

Default:

> Consequence Mode.

## 10. Control Layers

Anywhere Door should support strong user control without weakening the default real-world fantasy.

### 10.1 Player Mode

Default mode.

User input is treated as player speech, action, or intent. Characters may perceive it if they are present and able to perceive it.

### 10.2 Director Notes

A private instruction layer to steer pacing, boundaries, tone, and desire direction.

Examples:

- slow this scene down
- make her more proactive
- keep the secret unrevealed
- pause outside pressure lines
- make the tone gentler

Director Notes do not become character knowledge.

### 10.3 Scene Contract

A temporary agreement for the current scene:

- intensity
- boundaries
- pacing
- allowed focus
- forbidden directions
- whether outside world pressure is paused

This is especially important for NSFW, comfort, and high-control roleplay.

### 10.4 God Mode / Studio Mode

Hard control over private instance facts:

- edit relationship
- edit character goal
- establish prior history
- move character
- change location state
- alter pressure line
- retcon previous canon

Hard edits must go through validated delta where possible and be recorded in the private instance.

Recommended product rule:

> Default experience should feel like a real world. Advanced experience should allow private direction.

## 11. Input Channels

Free text remains primary, but the product should recognize and optionally expose channels:

- Action: what the player does
- Speech: what the player says
- Observe: what the player tries to perceive
- Story / intent: what the user wants to push forward
- Director Note: private steer
- God Edit: direct private-world edit

This borrows the clarity of AI Dungeon's input modes while preserving natural typing.

## 12. Guidance Without Rails

Blank-page anxiety is real. The product should offer optional next actions.

Rules:

- show 2-3 suggested actions when useful
- suggestions are diegetic and scene-specific
- suggestions never replace free input
- power users can hide them
- suggestions should include different play intents, such as investigate, confront, wait, comfort, lie, retreat

This gives ChoiceScript / Hidden Door style affordance without turning the product into branching fiction.

## 13. Taste Chronicle

Recommendation should not reduce the user to tags.

The product should maintain a local Taste Chronicle:

- raw high-information behavior sequence snippets
- long-term preference portrait
- recent preference drift
- repeated scene dynamics
- disliked or avoided patterns
- successful bridge patterns

Door generation should use three modes:

- exploit: fit the user's current desire
- bridge: preserve deep behavior structure while changing surface genre / role / power dynamic
- explore: introduce nearby novelty and avoid local optimum

Default ratio:

```text
50% exploit
35% bridge
15% explore
```

Bridge is the signature feature. It should preserve deep attraction structures, not just swap tags.

## 14. Door Passport

The user should be able to maintain multiple player identities.

Examples:

- default self
- adventurer
- villain
- romantic persona
- NSFW persona
- creator test persona

Rules:

- a world can lock to one persona
- the world only knows what that persona reveals inside that world
- Taste Chronicle may learn across worlds, but world characters do not automatically know cross-world user history

## 15. World Atlas

The default UI should not expose backend tables, but long-term worlds need an accessible memory surface.

World Atlas is the user's private record of a world:

- known locations
- known characters
- relationships
- discovered lore
- rumors
- unresolved pressure lines
- player-visible chronology
- discovered contradictions or mistaken beliefs
- important objects

Default play keeps Atlas in the background. Advanced users can inspect it.

The closest inspiration is "Legends Mode" in spirit, not UI.

## 16. Context Inspector

Advanced users need to understand and debug long-running worlds.

Context Inspector should be Studio-only or advanced-only. It can show:

- which canon facts were used this turn
- which memories were retrieved
- who knows what
- who misbelieves what
- which pressure line affected the scene
- why a character did not know something
- which Director Note / Scene Contract is active

This protects immersion for casual users while giving power users control.

## 17. Timeline Forks

Forking and rewind are core, not secondary.

Required capabilities:

- regenerate last response
- rewind last turn
- fork from a previous turn
- retcon private canon
- preserve relationship changes while rewriting scene prose when explicitly requested

Product principle:

> Continuity matters, but the user owns their private branch.

## 18. Creator / Seed Studio

Power users and creators should eventually edit world contracts directly.

Seed Studio should support:

- rules
- tone gravity
- opening scene
- initial anchors
- pressure lines
- expansion grammar
- lore
- character imports
- director profile
- safety / boundary defaults

Imported character cards should not be framed as entering through the player's door. They become native entities in a generated or edited world seed.

## 19. Director Profiles

Instead of exposing only technical model settings, offer product-level Director Profiles.

Examples:

- slow-burn romance
- dangerous intimacy
- survival pressure
- mystery-first
- cozy slice-of-life
- dark fairytale
- social intrigue
- high agency sandbox
- tragic epic
- absurd comedy

Director Profiles influence:

- pacing
- pressure frequency
- narration style
- character initiative
- risk level
- default suggested actions

## 20. Home / Base / Anchor

Long-term retention benefits from a place or relationship that belongs to the user.

Anywhere Door should support world-native anchors:

- a room
- a base
- a shop
- a ship
- a recurring table
- a relationship nest
- a faction role

These are not decorative UI. They are structured world entities that gather memory, objects, relationships, and pressure.

## 21. NSFW And Boundary Control

The product is unrestricted within platform baseline and creator red lines, but high-control scenes need explicit tools.

Recommended controls:

- pause
- lower intensity
- increase intensity
- change tone
- stay in current scene
- stop a direction
- rewrite last turn
- set scene boundaries
- keep / discard specific relationship consequences

Do not make "adult mode" a separate ontology. It is an application of Director Notes, Scene Contract, and private control.

## 22. Vision Extensions

These can strengthen the long-term vision, but should not replace the core text-world architecture.

### 22.1 Visual Door Cards

Door cards may gain generated or searched imagery, but images are render-layer assets.

### 22.2 Character Voice

Voice can make important characters feel alive, but it must not constrain depth. Text remains the unlock for wide reactivity.

### 22.3 Novel / Chronicle Export

Long worlds can export:

- story chronicle
- relationship history
- novella draft
- scene collection
- atlas packet

This borrows from writing tools without turning the app into a writing assistant first.

### 22.4 Public Seeds, Private Branches

Users may share seed / door definitions. Private deltas, Taste Chronicle, and NSFW preferences stay local by default.

## 23. First-Phase MVP

Recommended MVP scope:

1. Feed of doors with cold-open cards.
2. Generated medium seed: rules, tone, opening, anchors, 2-3 pressure lines.
3. Structured world loop: propose -> validate -> apply -> delta log.
4. Entity lifecycle: ambient -> hinted -> stub -> fleshed, with agentic only when private POV matters.
5. Role knowledge: observations, memory, belief, secret, goal.
6. Semi-hidden pressure lines shown diegetically.
7. Consequence Mode as default time behavior.
8. Doorway Library with pinned worlds and echoes.
9. Taste Chronicle using behavior sequences, not only tags.
10. Basic Director Notes and regenerate / rewind.

## 24. Later, Not Now

Avoid these until the core private living-world loop works:

- full shared multiplayer world
- always-live background simulation
- full map UI
- every NPC as an agent
- complex economy / creator marketplace
- voice-first NPC product
- image-first product
- deterministic big-map pre-generation

## 25. Product Invariants

1. The door belongs to the player. Other entities are native to the world.
2. Text is the interface, not the world substance.
3. Structured state and validated deltas define reality.
4. The model proposes; the engine validates.
5. Characters have partial POV; Director/Reactor are omniscient orchestration.
6. Persistence is earned by attention, recurrence, and causality.
7. The world should feel larger than the current text, but the current text must be able to change it.
8. God mode edits the private branch, not the public seed.
9. Recommendation should learn from behavior sequences, not just labels.
10. The default user experience is immersion; advanced control is available when desired.

## 26. Reference Patterns From Research

- AI RP tools: persona switching, character cards, response regeneration, group chat, world info, lorebooks.
- AI Dungeon: input modes, plot components, story cards, memory bank, scripting, context viewer, undo / editing.
- Interactive fiction tools: Twine's accessible nonlinear authoring, ink's writer-friendly branching scripts, ChoiceScript's choices and stats, Inform's object/world model.
- Open-world and simulation games: Minecraft-style local materialization, No Man's Sky-style exploration and discovery, Dwarf Fortress-style legends/history, RimWorld-style AI storyteller profiles.
- AI writing tools: story bible, beat-level control, prose/style separation, exportable chronicle.
- AI character engines: realtime voice and multimodal rendering are valuable render layers, but not the core ontology.

Key source links:

- SillyTavern World Info: https://docs.sillytavern.app/usage/core-concepts/worldinfo/
- SillyTavern Personas: https://docs.sillytavern.app/usage/core-concepts/personas/
- SillyTavern Group Chats: https://docs.sillytavern.app/usage/core-concepts/groupchats/
- AI Dungeon Plot Components: https://help.aidungeon.com/faq/plot-components
- AI Dungeon Memory System: https://help.aidungeon.com/faq/the-memory-system
- AI Dungeon Story Cards: https://help.aidungeon.com/faq/story-cards
- Twine: https://twinery.org/
- ink: https://www.inklestudios.com/ink/
- ChoiceScript: https://www.choiceofgames.com/make-your-own-games/choicescript-intro/
- Inform 7: https://ganelson.github.io/inform-website/
- No Man's Sky: https://www.nomanssky.com/about/
- Dwarf Fortress: https://store.steampowered.com/app/975370/Dwarf_Fortress/
- RimWorld: https://rimworldgame.com/
- NovelAI: https://novelai.net/
- Sudowrite: https://sudowrite.com/
- Inworld: https://inworld.ai/

## 27. Open Product Questions For User Review

The design currently recommends these defaults:

1. Users without a key can browse example/static doors, but live generation and live play require BYO key.
2. Users can actively "summon a door" in addition to swiping the feed.
3. God mode is hidden by default but discoverable from advanced controls, NSFW controls, and Studio.
4. World Atlas and Context Inspector are advanced surfaces, not default play surfaces.
5. Public sharing starts with seeds/doors only; private branches remain local by default.

These should be explicitly approved or changed before implementation planning.
