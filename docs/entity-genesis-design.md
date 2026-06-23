# Entity Genesis & Surfacing — Design

> **Status: design LOCKED — ready to turn into a step-by-step implementation
> plan (docs first, then code).** Governed by `CLAUDE.md` §5; read that first.

## Goal

Let the world grow like reality: characters, scenes, and interactive objects
appear on demand — **unfolded from the world itself, never imported from
outside.** The hard parts are (1) framing every appearance as *the world
detailing itself* and (2) bounding per-turn token cost as the cast grows.

## Principle (from CLAUDE.md §5)

> Ambient by default; crystallize when it earns persistence. One mechanism for
> all entities: `stub → fleshed` + `establish*`. **The world is the source —
> nothing enters from outside except the player.** The door (任意门) is the
> player's alone; every other entity is native to the world and is unfolded out
> of it. Off-stage seed characters are *named-but-unfocused* parts of the world;
> brand-new characters are *not-yet-named* parts. An entity is an **agent** (own
> memory + goal, run in the turn loop) iff it has a private POV.

## Invariants to PRESERVE (the rewrite must not break these)

The current runtime already gets these right — see `docs/DESIGN.md` (turn flow,
perception, mediation):

- **Perception = projection.** A character never reads raw `WorldState`; only its
  subjective projection. `buildCharacterPrompt` / `visibleScene`.
- **Witness scope.** Observations go only to characters present when an utterance
  happens (`buildObservations`). Information asymmetry is structural.
- **Prose-only writes via the Reactor.** Characters emit prose; only the Reactor
  turns prose into validated deltas. No direct world write by characters.
- **Propose → validate → apply** against immutable rules.

## DECIDED — the Director becomes the per-turn caster

The Director (the world's omniscient voice) gains two casting decisions per turn.
Both replace blunt mechanisms; **tension is an *input*, never an on/off gate.**

**(a) Active-agent set** *(was: intent ran for every present character)*
- Hard cap `maxActiveAgents ≈ 4` (config). Active agents run the full
  intent → speak → memory loop.
- When present characters exceed the cap, **the Director designates** which are
  active this turn (it is omniscient — it knows who matters dramatically). The
  rest are **ambient cast**: narrated by the Director as prose, no intent call,
  no agent loop. A bustling market is **not** 30 agents.
- Designation happens **at turn start** (it gates who runs intent).

**(b) Surfacing a latent entity** *(was: `tension ≥ 6 → grab off[0] → "X 推门进来"`)*
- The Director decides **whether** to surface now (tension + scene + whether
  latent characters exist as inputs), **whom** (an already-named latent roster
  member, or a newly-detailed one via `establishCharacter`), and **how**.
- **How it is framed — world-consistent, generated, never the player's door:**
  - *already present, just unnoticed* — “你这才发觉角落一直坐着一个人”
  - *from an adjacent space* — “她掀帘从里屋出来” (uses existing `connections`)
  - *through the world's OWN egress* — “门外传来脚步” (the world's door/road —
    **not** 任意门)
- Decided alongside casting at turn start, so a surfaced character **may join the
  same turn**.
- **Mechanism:** Director decision → delta(s) (`moveCharacter`, or
  `establishCharacter` then move) → validate / apply → a Director-**generated**
  surfacing narration. **Kill the hardcoded `introductionBeat`.**

## DECIDED — `establishCharacter` (the 11th delta)

- New delta kind, same `propose → validate → apply` path as
  `establishObject/Location/Lore`. Minimal stub payload:
  `{ kind:"establishCharacter", id, name, role, goal?, locationId }`,
  `detail:"stub"`.
- Proposable by the **Reactor** (reactive — the fiction named a persistent person)
  **and** the **Director** (proactive surfacing).

## DECIDED — instance-private characters (the key architectural change)

`seed.characters` is **frozen and shared across all players** (types.ts: "人人相
同的起点"). A world-spawned character therefore **cannot** live in the seed.

- Add `WorldState.characters: Record<string, Character>` — **instance-private**,
  grows on demand.
- `presentCharacters` looks up `seed.characters` **∪** `state.characters`.
- This makes **identity stability free**: the instance state is persisted, so a
  spawned character's definition survives; memories already persist per `charId`.
  **Never delete spawned characters or their memories** — archival = flip
  `present:false` only; reload = the same person.

## DECIDED — entity lifecycle

| Decision | Direction |
|---|---|
| **When a character's mind is generated** | Lazy, two-tier. Stub (name + role + goal) is near-free. The expensive flesh-out (full personality + initial memory) fires **only when the stub is first selected to speak**, hidden behind the surfacing narration. **No pre-generated "wings" pool.** |
| **Ambient passer-by vs persistent agent** | Default prose narration. Crystallize via `establishCharacter` only when the player engages it or it will recur — same rule as "only record lore worth recalling." |
| **A new character's initial memory** | Minimal: a few high-importance identity/backstory memories + a goal. **No** shared history with the player (asymmetry from birth). The rest accretes through play. |
| **Despawn / archival** | `present:false`; record + memory persisted, not loaded; reload on reappearance (see instance-private characters above). |

## DECIDED — deferred (explicitly out of scope for this change)

- **Intra-turn Reactor pass.** Keep the single end-of-turn Reactor. Within a turn,
  later speakers already see earlier speakers' prose via observations
  (narrative-consistent); only structural state (e.g. a door's `state`) lags
  until turn end. Running the Reactor per speaker would multiply the most
  expensive call by speaker count. Revisit only if a concrete consistency bug
  appears.
- **Explicit player projection / UI scene panel.** Keep the streamed prose as the
  player's channel (the public scene). A lightweight UI panel (exits / present /
  visible objects / your condition, computed from `WorldState`) is a later
  product-form/UI item, not part of this engine change.

## The concrete gap (what this closes)

Today's 10 deltas mint locations, objects, and lore but **not characters** — the
only entity type outside the crystallization scheme. And `Location.detail` /
`WorldObject.detail` (`"stub" | "fleshed"`) is written but never read —
flesh-on-visit is unwired for every type.

## Code touch-points (for the implementation plan)

- `src/lib/types.ts` — add `WorldState.characters`; (later) wire `detail`.
- `src/lib/world/delta.ts` — add `establishCharacter` (type + `validateDelta` +
  `applyDelta`, writing to `state.characters`).
- `src/lib/engine/reactor.ts` — parse + prompt for `establishCharacter`.
- `src/lib/engine/director.ts` — the per-turn caster: active-set designation +
  surfacing decision (when / who / how) with generated world-consistent narration.
- `src/lib/engine/prompt.ts` — `presentCharacters` merges seed ∪ `state.characters`.
- `src/lib/engine/introduce.ts` — remove `introductionBeat`; logic folds into the
  Director.
- `src/lib/engine/turn.ts` — casting/surfacing at turn start; gate the intent loop
  by the active set; replace the `tension ≥ 6` block.

## See also

- `CLAUDE.md` §4–§6 — axes, the one principle, technical invariants.
- `docs/DESIGN.md` — turn flow, perception projection, bidirectional mediation.
- `docs/ROADMAP.md` #4 (NPC autonomy / off-screen), #5 (props), #10 (autonomous genesis).
