# Anywhere Door / 任意门 — Project Charter (CLAUDE.md)

> This file is the **highest authority for decisions**. Before any product or
> technical trade-off, come back here.
>
> The three layers below are a **dependency chain**: **Essence** determines
> **Product Form**, which determines **Technical Implementation**. A lower layer
> must never violate a higher one; changing a higher layer forces a review of the
> layers beneath it.
>
> Current architecture detail → `docs/DESIGN.md`. The "becoming more real"
> roadmap → `docs/ROADMAP.md`. Entity genesis & context design → `docs/entity-genesis-design.md`.

## 0. Name

**Anywhere Door / 任意门** (formerly 浮生 / The Reveries). Named in homage to
Doraemon's Anywhere Door.

## 1. Slogan

> Countless doors before you. Push any one open and you're standing in a **real** world.
> *Text is merely how you interact with that world — not what it is.*
>
> 面前有无数扇门。推开任意一扇,你就站在一个**真的**世界里。文字,只是你与那个世界交互的形式。

## 2. Essence (first principle — nearly immutable)

**The door opens onto a *real world*; text is only the form of your interaction
with it, not its substance.**

- **Immersion first.** Every design choice serves one thing: making you truly
  *be in that world*.
- **The world's substance is structured state, not prose.** `WorldRules` +
  `WorldState` + validated `Delta`s *are* the real world; the LLM's text is its
  **render layer (output) + your input layer**.
- **"Real" means mechanically true** along a few axes (§4), not improvised by the
  LLM on the fly.

> Why bet on text: voiced NPCs are capped at two or three lines of dialogue by
> recording cost; text lets reactivity go far deeper — any character, any branch,
> any consequence is just more tokens. **Text isn't a limit, it's the unlock.**

> Note: personalization / "the door knows you" is **not** the essence — it's a
> powerful choice at the Product-Form layer (§3).

## 3. Product Form (so the essence is actually felt)

- A TikTok-style **feed of countless doors**: swipe vertically, one world per
  screen, endless (generated in the background).
- **Cold-open cards judgeable at a glance**: genre / mood / intensity + one hook
  that pulls you in.
- **Push a door** (open-door transition) → live inside it through text.
- **The doors learn you**: a taste engine (exploit × ε-explore × MMR × novelty)
  balancing fit and surprise so you're never trapped in a filter bubble.

## 4. What "a real world" means — six axes (the north star)

> The LLM only ever **proposes** changes; the engine **validates against
> immutable rules** before committing. The model never writes the world directly.

| Axis | Status | Where it sits |
|---|---|---|
| 1. Existence & continuity (can't reference what doesn't exist) | ✓ mechanical (`validateDelta`) | **Core** |
| 2. Spatial persistence (traversable; fleshed-on-visit) | ✓ traversable + `stub→fleshed` wired for locations (`fleshLocation` delta, engine-triggered on first visit); objects/characters pending | **Core** |
| 4. Social causality (relationships shift from events; private memory/secrets) | ✓ memory + CK-style relationship ledger (signed affinity + evidence + day-decay); ownership→resentment wired | **Core** |
| 6. Canon consistency (never self-contradictory) | ✓ lore injection + `establishLore` | **Core** |
| 3. Physical causality (locked / flammable / broken enforced) | ✓ enforced for the drama-driving props: `portable` (`moveObject`) + `locked`/`gates` (doors block passage, `setObjectLocked`); flammable/broken pending | **Selective core** — mechanize only the few drama-driving props |
| 5. Off-screen evolution (world moves while you're away) | no-op `evolveWhileAway` seam | **Roadmap** — consistent with "interaction-driven: freezes when you leave" |

## 5. The one modeling principle (entities & agency)

Everything in the world — **locations, objects, lore, characters** — obeys a
single rule:

> **Ambient by default; crystallize into a persistent, structured entity only
> when it earns persistence** (the player engages it, or it will recur). One
> mechanism for all four: `stub → fleshed` + the `establish*` deltas.

> **The world is the source — nothing enters from outside except the player.**
> The only thing that comes through a *door* is the **player**: a visitor from
> outside the world (that is what 任意门 means — and the door metaphor is the
> player's alone). Every other entity — characters, scenes, interactive
> objects — is **native to the world**, *unfolded / detailed out of it* on
> demand. A seed's off-stage characters are not waiting outside the world; they
> are **named-but-not-yet-focused parts of it**, and a brand-new character is a
> **not-yet-named part** the world now details. Same act either way: the world
> detailing itself. When a latent entity comes into focus, the **Director (the
> world's omniscient voice) reveals it in a way consistent with that world's own
> logic** — already-present-now-noticed, arriving from an adjacent space, or
> coming through the world's *own* egress — never via the player's door.

Entities fall into **three poles, distinguished by point of view — not by
"person vs thing":**

| Pole | POV | What it is |
|---|---|---|
| **Agent** (character) | **partial** — private memory + private goal; knows only what it witnessed | A mind with secrets that drives the fiction. Information asymmetry is the whole point. Need not be humanoid — a whispering mirror is an agent. |
| **Orchestrator** (Director + Reactor) | **omniscient** — sees the whole world | Not in the fiction. Director = dramatic intent (pacing / narration / casting); Reactor = objective consequence (state deltas). |
| **World State** (locations / objects / flags / lore) | **none** — inert data | Read and written by the others. A plain button is state; the engine resolves what pressing it does. |

**The agency test:** an entity becomes a separate agent (its own memory + goal,
run in the turn loop) **iff it has a private POV that drives the fiction.**
Otherwise it is world state. A button is state; a haunted mirror is an agent —
same object category, opposite ontological category. Director and Reactor must
stay omniscient *and* separate from characters, because a single mind cannot be
both **blind** (for drama) and **omniscient** (for orchestration). Token economy
is a welcome side effect of this partition, not its reason — the reason is
epistemic integrity.

## 6. Governing technical invariants

- **Rules immutable · state mutable**: `WorldRules` (physics / setting /
  redLines) is read-only after creation; `WorldState` is mutable and grows on
  demand.
- **Propose → validate → apply**: `reactor` proposes `Delta[]` → `validateDelta`
  → `applyDelta` (immutable update).
- **Record = hybrid (snapshot + append-only delta log)**: the snapshot is the
  fast-read current state; every validated delta is appended to a per-instance
  event log (`delta / turn / game-time / real-time / the line that caused it`).
  Delayed callbacks, world reputation, and off-screen evolution all depend on
  this log. *[built — per-instance append-only `DeltaLogEntry` (delta / turn /
  game-time / logical-time / cause); every validated delta is logged in `turn.ts`]*
- **Interaction-driven evolution**: the world advances only when you interact; it
  freezes when you leave (zero idle cost).
- **BYO-key · local-first**: production is strictly bring-your-own-key; all data
  lives in the browser (IndexedDB), no server database.
- **Unrestricted**: adult fiction; red lines are only the platform baseline +
  creator additions.

## 7. Stack & navigation

Next.js 15 · React 19 · TypeScript strict · Tailwind CSS 4 · Dexie/IndexedDB ·
Vitest. `npm test` · `npm run build` · `npm run typecheck`.

Code: `src/lib/engine/` (turn loop / director / reactor / prompt) ·
`src/lib/world/` (delta / generate / lore / seeds) · `src/lib/taste/` ·
`src/lib/memory/` · `src/lib/storage/` · `src/app/` (feed / play / settings).

Detail → `docs/DESIGN.md` · Roadmap → `docs/ROADMAP.md`.
