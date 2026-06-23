# CLAUDE.md — Agent Operating Notes

This file is for Claude/Codex-style agents working in this repo. It does not
replace the charter.

## Read Order

1. `AGENTS.md` — highest authority: essence, product form, invariants.
2. `docs/superpowers/specs/2026-06-24-overall-product-design.md` — latest full
   product design.
3. `docs/DESIGN.md` — current implementation architecture.
4. `docs/ROADMAP.md` — staged implementation direction.
5. `docs/entity-genesis-design.md` — entity genesis and surfacing details.

Older `.superpowers/sdd/*` reports and implementation plans are historical
evidence. Do not treat them as product authority when they conflict with the
files above.

## What Must Not Drift

- **Real world, not prose.** Text is the interface. `WorldRules + WorldState +
  validated Delta` is the world.
- **LLM proposes, engine validates.** No model output should directly mutate
  durable world state without `validateDelta` / `applyDelta` or an equivalent
  typed gate.
- **The player's door is unique.** Only the player enters from outside the world.
  Other entities unfold from the world itself.
- **Ambient by default.** Locations, objects, lore, and characters crystallize
  only when they earn persistence.
- **Agency requires private POV.** A separate agent exists only when private
  memory, beliefs, secrets, goals, or limited knowledge drive the fiction.
- **Characters are not omniscient.** Character prompts must preserve subjective
  projection, witness scope, and information asymmetry.
- **Director/Reactor are not characters.** They can be omniscient because they
  orchestrate and validate; characters stay partial.
- **Taste is behavioral, not tag-only.** New-world generation should use raw
  behavior sequences and balance exploit / bridge / explore / diversity.
- **Consequence Mode is default.** No idle server simulation; reconcile plausible
  offstage consequences when the user returns.
- **Power controls are channel-isolated.** Player Mode, Director Notes, Scene
  Contract, and God/Studio Mode must not blur into each other.
- **Local-first / BYO-key.** Production uses user-provided model keys and browser
  storage; no server database.

## Product Defaults

- Default surface: immersive Player Mode.
- Advanced surfaces: Director Notes, Scene Contract, God Mode / Studio Mode.
- Discovery: vertical door feed with cold-open cards.
- Persistence: opened worlds belong in a Doorway Library.
- Identity/preferences: Door Passport is future-facing and local/private by
  default.
- World records: World Atlas and Context Inspector are advanced surfaces, not
  default play clutter.
- Creation: Seed Studio should edit seed contracts and private branches without
  breaking the rule that entities are native to their world.
- NSFW/adult fiction: supported within platform baseline and explicit user /
  creator / scene constraints.

## Implementation Guidance

- Prefer existing engine paths: `runTurn`, Director/Reactor prompts,
  `Delta` types, `validateDelta`, `applyDelta`, storage repositories, and
  memory helpers.
- Add new world changes as typed deltas unless there is a strong reason not to.
- Keep generated content and durable state separate. Prose can suggest; deltas
  commit.
- Preserve the delta log whenever a durable change happens. Delayed callbacks,
  offstage reconciliation, reputation, and timeline tools depend on it.
- Keep current implementation docs factual. If a feature is roadmap-only, say
  so instead of implying it already exists.
- When UI exposes control, separate player-facing immersion from Studio/debug
  surfaces.
- For recommendation/generation features, avoid shallow tag filters as the sole
  mechanism; use behavior history and novelty controls.

## Documentation Rules

- `AGENTS.md` is the charter. Update it only when the principle itself changes.
- The latest product spec is the complete product-design reference.
- `docs/DESIGN.md` describes current architecture and may lag vision by design.
- `docs/ROADMAP.md` explains the gap between current code and latest product
  direction.
- `docs/entity-genesis-design.md` owns detailed entity lifecycle mechanics.
- README should present the product clearly to users/developers without becoming
  the deepest spec.

## Verification

Use the repo's normal checks when code changes:

```bash
npm test
npm run build
npm run typecheck
```

For docs-only changes, run targeted consistency checks with `rg` and report that
code tests were not run because no runtime files changed.
