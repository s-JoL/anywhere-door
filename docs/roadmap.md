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

## Phase 0 — Runtime spine baseline

The first runtime spine now exists as a minimal baseline: WriteGate commits
validated deltas and logs rejections, perception is centralized behind one
subjective projection boundary, Director casting selects active/ambient cast,
AgentRuntime handles active speakers, subjective memory carries provenance and
distortion fields, pressure/offstage structures exist, and the Studio panel has a
compact inspector. Treat this phase as **completed baseline**, not future work.

Remaining Phase 0 hardening:

1. **Boundary completeness.** Keep expanding projection assertions as new
   control channels appear; cross-world taste is still unbuilt and must not enter
   character knowledge when it arrives.
2. **Casting salience.** Move beyond keyword overlap into richer semantic
   parsing and better weight tuning while preserving the active-agent cap.
3. **Trace UI.** Surface the existing trace stream more fully: rejected-change
   detail, structured guard-rejection detail, retrieved-memory detail, and clearer
   commit provenance. The trace stream already records gate commits/rejections,
   God Edit commits, guard drops, casting, and thread activity; the remaining gap
   is presentation and drill-down.
4. **Operation lock coverage.** Normal turns and last-turn timeline operations
   are locked; continue extending the same durability discipline to future
   long-running Studio/branch actions.

## Phase 1 — Make the MVP feel like a private living-world browser

Goal: every first session proves "this is a real world," and every return makes
it feel personal (`product-design.md` §26 MVP).

0. **First-click conversion + model setup integrity.** Before deeper runtime
   slices, make the live product's first click match the product design: the feed
   CTA is a world-specific first action / recommended opening line, not a generic
   "open the door" label; generated and built-in worlds both carry this entry
   action as presentation data. Fix `/settings` so provider, model, and
   OpenRouter-only reasoning stay coherent while the user tests/saves a key. This
   is a funnel repair, not a new mode: users still enter a private world instance,
   but the button now names the first in-world move. Current path covers
   authored/generated `entryAction`, a stronger feed action button, provider/model
   defaults, OpenRouter-only reasoning isolation, empty-key save protection, and
   complete fallback actions instead of hard-clipped derived CTA text; remaining
   work is richer recommendation of the first action from Taste Chronicle / world
   state rather than only seed-authored presentation.
1. **Cold-start pool (keyless on-ramp).** Ship a curated set of built-in worlds —
   including different rule configs (faithful drama, distorted horror, a game-y
   dungeon) — each with a baked cold-open + a short scripted **pre-baked taste**
   that a keyless visitor can browse and sample with zero live inference; reactive
   play and generation stay BYO-key (`product-design.md` §4.3). This unblocks the
   top of the funnel without platform inference or a faked reactive loop. Current
   path has eight quality-gated built-ins across drama, wuxia, hard sci-fi,
   distorted horror, dungeon, fog-market debt intrigue, polar survival science,
   and theater mystery. It requires explicit `source: "builtin"` for the keyless
   sample branch, so source-less/imported/generated worlds cannot masquerade as
   built-in samples.
2. **Medium seed contract + canon hardness.** Upgrade generated seeds into
   contracts (rules, tonal gravity, opening locality, anchors, 2–3 pressure lines,
   expansion grammar, canon ledger, narration rule). Give facts a 3-tier hardness
   so anchored facts resist casual contradiction (`architecture.md` §7.1).
   Current path stores `ambient/anchored/core` facts, blocks non-God revision of
   anchored/core facts, and makes object movement respect protected
   location/hidden facts plus common protected object/character/player state
   contradictions unless the fact is revised first. Remaining work is a richer
   generated seed contract and broader semantic contradiction checks.
3. **Pressure lines.** Structured threads in seed/state, advanced only via a
   validated change, surfaced diegetically, with fairness as a validation rule
   (`architecture.md` §7.2). Director narration source snapshots now anonymize
   active pressure lines that are not yet player-known, so their summaries and
   next signs do not leak through player-facing prose before the world has shown
   a fair sign.
4. **Input channels.** Surface Say / Do / Observe / Director Note / Scene
   Contract; the first three are in-world, while Director Note and Scene
   Contract are channel-isolated and no longer write into the main transcript.
   Do / Observe now keep full text for adjudication but write observer-safe
   character memory, so private action details are not treated as spoken
   omniscient subtitles.
5. **Taste Chronicle + Door DNA.** Behavior-sequence store; exploit/bridge/explore
   balance; internal Door DNA so bridge swaps the skin while holding deep
   dimensions (`product-design.md` §14).
6. **Character reality + belief graph.** Wire the provenance/confidence fields
   into play; provide the fact × observer read view; route character context
   through the perception boundary so limited POV is tested, not just prompted.
   Current path stores player utterances and committed consequences as
   witness-scoped memories for present characters while keeping absent characters
   uninformed. Concealment consequences are now perception-graded: ordinary
   co-present characters get inferred/partial awareness that something was
   concealed, not the hidden value, and gossip only retells witnessed/full
   observations. Relevant old witness memories now reach the next-turn intent
   judge as well as the speaking prompt; when every active character passes, the
   relevant witness can now break the lull ahead of scene-order defaults. Owned
   object consequences now also create owner→player relationship evidence through
   the same write gate, and the latest relationship evidence appears in that
   character's present-target stance. Strong relationship pressure plus a
   current-input-relevant memory can now promote a conservative pass into a speak
   intent, so an affected character may actively push back. The intent layer also
   supports visible avoidance: a character can avoid instead of being forced to
   speak, that withdrawal remains visible even when someone else answers, and it
   becomes witness-scoped memory. Guard-rejected
   character prose is suppressed for that character without spending the turn's
   speak budget, so another active character can still answer; if the rejected
   line was a forced pass-only lull-break, the loop retries the next-best pass
   candidate and finally falls back to a neutral hesitation beat instead of an
   empty turn. Memories are now
   scoped by world instance before character id, preventing cross-door memory
   retrieval, rewind deletion, branch restore replacement, and God-edit correction
   spillover. Studio now shows belief edges with subjective evidence text, and
   character prompts render distortion as what that character misremembers, so
   misbelief is visible as a character-side stance instead of canon. Director
   casting now reads belief edges as salience, especially wrong beliefs about
   hard facts. Remaining work: richer belief salience tuning, richer avoidance
   strategies, richer relationship beats, and a player-facing World Atlas.
7. **Entity lifecycle for all types.** Extend `stub → fleshed` to objects and
   characters; promote only on earned persistence; archive (not delete) entities
   that fall idle (`architecture.md` §13). Current path covers explicit player
   attention to visible named stub objects / present stub characters, first active
   casting for present stub characters, committed object consequences for stub
   objects, committed character consequences for stub characters, plus archive
   deltas. Remaining work: recurrence and richer causal-salience thresholds beyond
   explicit attention / active casting / direct committed consequences.
8. **Consequence Mode polish.** Make return changes visible through local detail
   and social echoes; reconcile by the three precision tiers. Current path now
   sign-gates unknown pressure-line advancement during offstage reconciliation:
   if the player does not know the thread yet, the offscreen proposal must carry
   a player-facing `nextSign` or it is dropped. The same post-proposal bound now
   enforces the precision budget for entity changes: up to three near changes and
   one related change per reconciliation pass, with far targets frozen. Live page
   re-entry now runs that reconciliation before composing the return-open echo, so
   the first beat can narrate the change that just landed instead of replaying an
   old settlement. Return settlement now also derives compact local signs from
   offscreen entity deltas that actually passed the WriteGate. Visible read-only
   presence now refreshes `lastSeenAt` through a locked touch so an in-page pause
   does not become false offstage time; hidden-tab returns still reconcile before
   touch. Remaining work is richer authored local detail and character reactions,
   beyond the compact system beat.
9. **Exit settlement + echoes + Doorway Library.** A bounded settlement on exit
   (trace / unresolved / candidates) and a return-open beat on re-entry; a
   first-class Library page with pin and light return hints
   (`product-design.md` §3.3). Current path stores settlement each turn, filters
   trace/unresolved to player-known truth, synthesizes non-leaking forward
   candidates, prioritizes candidates in Library cards, records return / pin
   funnel events, and emits a return-open beat on live page re-entry after
   meaningful absence, before the next player input. The beat is composed after
   offstage reconciliation, includes elapsed time, trace, relationship bond, and
   a candidate/unresolved hook. Candidate hooks include committed local offscreen
   signs before relationship reaction hooks and pressure-line pulls, and the beat
   is deduped against the next turn. Local relationship changes now carry their
   reason into the return candidate ("someone still remembers what you did") rather
   than collapsing to a generic attitude-change line.
   Visible-page presence touch keeps `lastSeenAt` honest during read-only sessions.
   Remaining work: make object/condition returns richer and more diegetic through
   authored local detail + character reaction, not only a compact system beat.
10. **Narration transduction + cheap guard.** Generate prose from the fact
    snapshot; add the lightweight consistency backstop; support a per-world
    narration rule for lawful distortion (`architecture.md` §8). Director ambient
    narration now receives `narrationRule` plus a compact committed-truth snapshot;
    not-yet-known pressure lines are anonymized in that snapshot instead of
    leaking summary/nextSign, and facts not marked player-known are omitted from
    the player-facing source snapshot;
    the cheap guard now catches offstage characters, offstage objects, and far
    non-adjacent locations, plus conservative visible-object contradictions for
    lock/light state and common state opposites (empty/full, broken/intact,
    wet/dry, open/closed), and obvious narrator-side inner knowledge attribution
    when unsupported by that character's own memories. Inner-knowledge support is
    phrase-level rather than loose CJK keyword overlap: the claim or a normalized
    phrase variant must appear in that character's own memory text.
    The Director guard also receives the seed narration rule; per-world lawful
    distortion now has a narrow media-proximity allowance for offstage names and
    visible-state contradictions, so mirror / recording / doorplate beats can
    survive without making the entity present or changing committed truth.
    Character-authored prose now runs through a projection-level guard before it
    is shown or persisted: offstage entity names require support from that
    character's visible scene, own memories, or triggered lore. Remaining work is
    fuller prose-from-snapshot coverage and deeper
    semantic contradiction checks beyond the cheap pattern layer.
11. **Metrics funnel.** Instrument the return-rate funnel, local-first
    (`architecture.md` §7.7). The core stages are wired. `first-consequence`
    now records the first player-caused anchored fact and has an engine floor:
    when Reactor commits a clear player-caused object/condition state change but
    omits `setFact`, the turn derives one player-known anchored fact from the
    validated change and submits it through WriteGate. The keyless sample
    boundary now records `prebaked-taste`, carries the sampled world id into
    Settings, and records `key-add` when a non-empty key is saved from that
    handoff. Remaining: richer analytics views.
12. **Timeline hygiene.** Keep regenerate/rewind/fork from leaking old-branch
    state. Regenerate + rewind now restore state/messages/memories/delta log to
    the snapshot waterline; fork + restore now persist superseded branch
    snapshots; new log/memory records now inherit the active branch id, and
    memory operations are additionally filtered by `instanceId`, so branch restore
    and rewind cannot delete another private door's subjective records. Legacy
    unstamped memory/log records are stamped into the active/restored branch when
    archived or restored; ambiguous legacy memories from multi-instance upgrades
    stay out of active character reads but remain visible through audit reads.
    Explicit audit reads now expose archived messages, memories, and delta logs
    without leaking them into the active play view.
    Remaining: rename/delete/full branch manager and
    fork-from-arbitrary-turn UI, plus more compact branch snapshot storage for
    very long-running worlds.
13. **Two single-language deployments + UI redesign (zh/en).** Foundation exists:
    a build-time locale constant, typed UI catalog, authored en UI, `<html lang>`,
    locale-aware fonts, and one shared language-agnostic kernel. Remaining:
    extract language-facing prompt wording, build an en-native world/seed content
    pool, and keep zh/en as separate deployments rather than a runtime toggle.

(The game-y / agentic-Director rule-skill path is **not** in Phase 1 — it moves to
Phase 2, after the drama/return loop is shown to retain. The architecture supports
it; the build waits.)

## Phase 2 — Depth and power-user surfaces

Goal: long-running RP, NSFW, creative steering, and inspection without breaking
default immersion.

- **Director Notes + Scene Contract** — minimal channel-isolated steering exists;
  deepen semantics for pacing, boundaries, intensity, and scene goals.
- **God Mode / Studio Mode** — structured delta JSON commits through the
  WriteGate with rollback-protected minimal witness reconcile for facts,
  conditions, and relationship stances; common condition / relationship
  paraphrase evidence is covered by conservative subject-hinted clusters. Build
  the full edit UI, rejected proposal detail, full semantic belief-graph repair,
  and richer scene repair (`architecture.md` §10).
- **Door Passport** — local cross-world identities/preferences; not auto-known to
  characters.
- **World Atlas** — the player's private in-character record.
- **Context Inspector** — compact view exists; expand into a full Studio/debug
  view for canon vs belief, witness scope, rejected changes, active note/contract,
  and retrieved-memory evidence.
- **Director Profiles** — product-level presets (slow burn, horror pressure, …).
- **Home / Base / Anchor** — recurring world-native anchors for return value.
- **Depth tiers** — fast / standard / deep as the cost valve on the slow path
  (`architecture.md` §4.1).
- **Agentic Director + game-y rule-skills** — deterministic combat/scoring/puzzle/
  economy adjudication and a proving game-y template (`architecture.md` §9,
  `product-design.md` §22). This may become a Director-led specialist team when
  measured context pressure or precise adjudication justifies it, but the team is
  an execution layer behind one hub and one write gate. Gated on the Phase 1
  drama/return loop retaining first.

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
