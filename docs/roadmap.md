# Anywhere Door — Roadmap

> **Status: the migration path** from `current-state.md` to the design
> (`product-design.md` + `architecture.md`). This is the only place where
> "extract X from the current `runTurn`" belongs — the design docs describe the
> ideal end state, this describes how the code gets there. Not a promise list;
> implementation truth stays in `current-state.md`.

## Principles

- **World-realer before feature-richer.** New work must strengthen existence,
  continuity, causality, memory, asymmetry, or return value.
- **Private instances before public sharing.** What the user plays is their
  private branch; what is shared is a seed/door definition.
- **Consequence Mode before live simulation.** No idle background sim; reconcile
  on return.
- **Hidden control before exposed Studio.** Default is immersive Player Mode;
  Director/God surfaces are for power users, NSFW, high-control creation, debug.
- **Behavior sequences before tag ecosystems** in recommendation and generation.

## Phase 0 — Runtime spine extraction

The code's logic is mostly correct but concentrated in `runTurn`. Before broad
feature work, extract the two structural choke points and the casting layer the
architecture (`architecture.md` §2–§3) depends on. Each slice keeps behavior
semantically unchanged and is independently mergeable; **write the boundary test
before changing the implementation.**

1. **WriteGate.** Move validate/apply/log orchestration behind one commit
   interface; record rejected proposals with reasons. (Unblocks canon hardness,
   thread fairness, god edits.)
2. **ContextAssembler + PerceptionResolver.** Replace the prompt-helper sprawl
   with typed context packs and one perception boundary; add standing assertions
   that out-of-world channels never enter a character projection (`architecture.md`
   §3, charter §9). **These isolation assertions are a hard prerequisite: no
   power surface (Director Notes / Scene Contract / God / cross-world taste) ships
   until they are in place** — channel isolation fails *silently*, so the guard
   must exist before the thing it guards. (Unblocks channel-isolated control
   surfaces.)
3. **Director casting.** Director chooses the active-agent set (cap ≈ 4) and
   ambient cast; remove the hardcoded `tension ≥ 6` introduction in favor of
   Director surfacing decisions (`architecture.md` §13.1).
4. **AgentRuntime.** Make character cognition explicit
   (`perceive → retrieve → intent → speak/act → observe`); keep the end-of-turn
   Reactor.
5. **Memory/Belief upgrade.** Add provenance / confidence / interpretation /
   distortion to subjective records; distinguish observation / hearsay / belief /
   secret / reflection; fold confidence into retrieval scoring.
6. **Offstage + pressure lines.** Represent pressure lines as structured state;
   make offstage reconciliation read threads and evidence; add the three precision
   tiers.
7. **Studio instrumentation.** Emit the trace data the Context Inspector needs,
   and route Director Notes / Scene Contract / God Edit through channel-isolated
   paths.

Plus, before adding more agent calls: an **instance operation lock**
(`architecture.md` §11) so overlapping Director/Reactor/character results cannot
contaminate one branch.

## Phase 1 — Make the MVP feel like a private living-world browser

Goal: every first session proves "this is a real world," and every return makes
it feel personal (`product-design.md` §26 MVP).

1. **Cold-start pool (keyless on-ramp).** Ship a curated set of built-in worlds —
   including different rule configs (faithful drama, distorted horror, a game-y
   dungeon) — each with a baked cold-open + a short scripted **pre-baked taste**
   that a keyless visitor can browse and sample with zero live inference; reactive
   play and generation stay BYO-key (`product-design.md` §4.3). This unblocks the
   top of the funnel without platform inference or a faked reactive loop.
2. **Medium seed contract + canon hardness.** Upgrade generated seeds into
   contracts (rules, tonal gravity, opening locality, anchors, 2–3 pressure lines,
   expansion grammar, canon ledger, narration rule). Give facts a 3-tier hardness
   so anchored facts resist casual contradiction (`architecture.md` §7.1).
3. **Pressure lines.** Structured threads in seed/state, advanced only via a
   validated change, surfaced diegetically, with fairness as a validation rule
   (`architecture.md` §7.2).
4. **Input channels.** Surface Say / Do / Observe / Director Note; the first three
   in-world, Director Note channel-isolated.
5. **Taste Chronicle + Door DNA.** Behavior-sequence store; exploit/bridge/explore
   balance; internal Door DNA so bridge swaps the skin while holding deep
   dimensions (`product-design.md` §14).
6. **Character reality + belief graph.** Wire the provenance/confidence fields
   into play; provide the fact × observer read view; route character context
   through the perception boundary so limited POV is tested, not just prompted.
7. **Entity lifecycle for all types.** Extend `stub → fleshed` to objects and
   characters; promote only on earned persistence; archive (not delete) entities
   that fall idle (`architecture.md` §13).
8. **Consequence Mode polish.** Make return changes visible through local detail
   and social echoes; reconcile by the three precision tiers.
9. **Exit settlement + echoes + Doorway Library.** A bounded settlement on exit
   (trace / unresolved / candidates) and a return-open beat on re-entry; a
   first-class Library page with pin and light return hints
   (`product-design.md` §3.3).
10. **Narration transduction + cheap guard.** Generate prose from the fact
    snapshot; add the lightweight consistency backstop; support a per-world
    narration rule for lawful distortion (`architecture.md` §8).
11. **Metrics funnel.** Instrument the return-rate funnel, local-first
    (`architecture.md` §7.7).
12. **Timeline hygiene.** Keep regenerate/rewind/fork from leaking old-branch
    state.

(The game-y / agentic-Director rule-skill path is **not** in Phase 1 — it moves to
Phase 2, after the drama/return loop is shown to retain. The architecture supports
it; the build waits.)

## Phase 2 — Depth and power-user surfaces

Goal: long-running RP, NSFW, creative steering, and inspection without breaking
default immersion.

- **Director Notes + Scene Contract** — steer pacing/tone/boundaries/intensity,
  channel-isolated.
- **God Mode / Studio Mode** — direct private-branch edits with witness-scoped
  edit-then-reconcile (`architecture.md` §10).
- **Door Passport** — local cross-world identities/preferences; not auto-known to
  characters.
- **World Atlas** — the player's private in-character record.
- **Context Inspector** — Studio/debug view (canon vs belief, witness scope,
  rejected changes, active note/contract).
- **Director Profiles** — product-level presets (slow burn, horror pressure, …).
- **Home / Base / Anchor** — recurring world-native anchors for return value.
- **Depth tiers** — fast / standard / deep as the cost valve on the slow path
  (`architecture.md` §4.1).
- **Agentic Director + game-y rule-skills** — deterministic combat/scoring/puzzle/
  economy adjudication and a proving game-y template (`architecture.md` §9,
  `product-design.md` §22). Gated on the Phase 1 drama/return loop retaining first.

## Phase 3 — Creation, import, and sharing

- **Seed Studio** — author/edit seed contracts (incl. narration rule and, for
  game-y worlds, executable rule-skills); preview a cold-open card and first scene.
- **Imports as native entities** — character-card imports become native world
  entities, never entering through the player's door.
- **Public seeds, private branches** — share seeds/door definitions; private
  deltas, Taste Chronicle, Passport, NSFW settings, and history stay local.

## Later, not now

True real-time multiplayer; always-running server simulation; marketplace /
monetization; voice-first or image-first interaction; deterministic large-map
pre-generation; full physics sandbox across every property; a public social graph
of play history. (Charter §16: large-scale numeric simulation, twitch input, and
human multiplayer are out by design, not deferred.)

## Quality signals

The product is improving when: users judge a door in seconds; first actions
produce visible specific consequences; users return to the same world unprompted;
characters surprise through limited POV, not random prose; the feed avoids both
repetition and incoherent novelty; long worlds accumulate local history, not chat
length; power users steer scenes without destroying the illusion.
