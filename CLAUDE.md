# CLAUDE.md — Agent Operating Notes

This file is for Claude/Codex-style agents working in this repo. It does not
replace the charter.

## Read Order (authority)

Docs 1–4 are the **design** — implementation-agnostic, no code symbols. They
describe the best product; the code is obligated to them, not the reverse.
Docs 5–6 are where the current codebase and the migration path live.

1. `AGENTS.md` — charter: essence, the single axiom, non-negotiable invariants.
2. `docs/first-principles.md` — the derivation: why the product and architecture
   are forced, not chosen.
3. `docs/product-design.md` — the product: experience, surfaces, funnel, control,
   taste, metrics.
4. `docs/architecture.md` — the ideal world-runtime: topology, modules, turn
   flow, data-model direction, the living-world mechanics, entity genesis.
5. `docs/current-state.md` — **non-authoritative** snapshot of what the code does
   today. Names code symbols/paths (as do the working docs below).
6. `docs/roadmap.md` — the migration path from (5) to (3)/(4).

Non-authoritative working docs (for review/planning, not design authority; may
name code like doc 5): `docs/ui-redesign-proposal.md` — the bilingual-surface +
UI optimization plan.

Older `.superpowers/` reports are historical evidence, never authority.

## What Must Not Drift

- **Single source of truth (the axiom).** One omniscient hub holds the world and
  distributes partial projections; no parallel authority. Everything else is a
  theorem of this (charter §3).
- **Real world, not prose.** Text is the interface. Immutable rules + a validated
  mutable state + an append-only log of validated changes is the world.
- **Model proposes, engine validates.** No model output mutates durable state
  except through the typed write gate; the gate is never bypassed at any control
  level.
- **The player's door is unique.** Only the player enters from outside; every
  other entity unfolds from the world.
- **Ambient by default; hardness/persistence is earned.** Entities crystallize,
  and facts harden (ambient → anchored → core), only when earned.
- **Agency requires private POV.** A separate agent exists only when private
  memory/beliefs/secrets/goals drive the fiction.
- **One perception boundary.** Characters never read raw state; all character
  context passes one boundary, and out-of-world channels (Director Notes, Scene
  Contract, cross-world taste, un-canonized God edits) never cross it. Failures
  here are silent — guard with standing assertions (charter §9).
- **Director/Reactor are omniscient orchestration, not characters.**
- **Narration is transduction with a cheap guard.** Prose is generated from the
  truth snapshot, not free-written then policed; a lightweight consistency guard
  remains because the prose is still model-generated.
- **The Director may compute** (combat/scoring/puzzle/economy) but never bypasses
  validation.
- **Authored edits reconcile, not overwrite.** God edits supersede (never delete),
  scoped to witnesses.
- **Taste is behavioral, not tag-only**, and never leaks into character knowledge.
- **Consequence Mode is default.** No idle server simulation; reconcile on return,
  budgeted by relevance tiers.
- **Turn-scoped layered runtime.** No always-running default simulation loop.
- **Local-first / BYO-key.** Playing requires a key; a built-in cold-start pool is
  the keyless on-ramp; no server database.

## Product Defaults

- Default surface: immersive Player Mode; one product across the control axis.
- Advanced (hidden, discoverable): Director Notes, Scene Contract, God/Studio Mode,
  World Atlas, Context Inspector, Seed Studio.
- Discovery: vertical door feed with cold-open cards; behavior-sequence taste.
- Persistence: opened worlds enter a Doorway Library; exit settlement + echoes.
- Scope: character-driven drama is the sweet spot; **game-y worlds are in scope**
  via the agentic Director. Twitch input, large-scale numeric sim, and human
  multiplayer are out by design.
- NSFW/adult fiction: supported within platform baseline + user/creator/scene
  constraints; not a separate ontology.

## Implementation Guidance

- Build toward `architecture.md`; do not create a second competing runtime. When
  the turn loop needs work, extract behavior around the single write gate and the
  single perception boundary (see `roadmap.md` Phase 0).
- Add durable world changes as typed, validated, logged changes — not because
  prose wants color, but because the detail must persist, be validated, or affect
  future behavior.
- Keep generated content and durable state separate: prose suggests; validated
  changes commit.
- Preserve the change log on every durable change (delayed callbacks, reputation,
  offstage reconciliation, timeline tools depend on it).
- Keep `current-state.md` factual; if a feature is roadmap-only, say so there
  rather than implying it exists. Never let implementation detail leak up into
  docs 1–4.
- When UI exposes control, keep player-facing immersion separate from Studio/debug
  surfaces.
- For recommendation/generation, use behavior history and novelty controls, not
  shallow tag filters alone.

## Documentation Rules

- `AGENTS.md` is the charter; change it only when a principle itself changes.
- `product-design.md` and `architecture.md` are the complete product and runtime
  references; they carry no code symbols.
- `current-state.md` describes current code and may lag the design by design.
- `roadmap.md` explains the gap between current code and the design.
- README presents the product to users/developers without becoming the deepest
  spec.

## Verification

Use the repo's normal checks when code changes:

```bash
npm test
npm run build
npm run typecheck
```

For docs-only changes, run targeted consistency checks with `rg` and report that
code tests were not run because no runtime files changed.
