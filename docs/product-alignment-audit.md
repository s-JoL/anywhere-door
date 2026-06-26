# Product-Alignment Audit — Living-World WIP

> **Status: non-authoritative working doc.** A punch-list, not design authority.
> It audits the current **uncommitted** living-world code changes against the
> product truth (`product-design.md`) and the charter (`AGENTS.md`), ranked by
> impact on the felt player experience. Conflicts resolve upward to docs 1–4.
> Delete or fold into `roadmap.md` once worked through.
>
> **Scope note.** Audited against a snapshot of the working tree; the code may
> have moved since. Re-verify each `file:line` before acting.

## Systemic root cause (read first)

The single perception boundary (`resolvePerception`), the single write gate, and
the no-idle-sim baseline are all **sound**. Almost every finding traces to the
**new "truth → audience" bridges** added in this WIP, which do **not** reuse the
witness-scoping / `playerKnown` discipline the boundary enforces:

- consequence-observation (#1) used to broadcast to all co-present, not
  witnesses; this is now fixed for concealment facts by observer-safe action
  memory, inferred/partial concealment records, and gossip limited to
  witnessed/full observations;
- narration snapshot (#2) emits not-yet-known thread data to player-facing prose;
- offstage commit (#14) used to commit away-deltas with no sign / awareness
  check; pressure-line advancement and return-local entity signs now close the
  player-facing fairness gap for the current runtime.

Fixing these three reconnects the new channels to the main pipe. That is the
spine of the recommended sequence below.

## Recommended fix sequence (by product leverage)

1. Sweep the rest by tier (#12–#23 metrics / observability / edges).

---

## Resolved since this audit snapshot

- Keyless sample now hides Studio, channel tabs, timeline controls, textarea, and
  send button; the bottom surface is a single "add key so the world can respond"
  CTA.
- Seed-embedded API keys are ignored at runtime; live play only uses the current
  local user config. The dev-only `.env.local` fallback remains an API/proxy smoke
  path, but Settings refuses empty-key model tests so it is not mistaken for real
  user play access.
- Director tension updates and offstage surfacing now commit as typed deltas
  through the WriteGate (`setTension` / `moveCharacter`), with delta-log
  attribution.
- Rewind/regenerate/fork still hide superseded records from the active timeline,
  but repository audit reads expose archived messages, memories, and delta logs.
- The projection leak assertion runs in production too.
- Director Note and Scene Contract persist as out-of-world control state and no
  longer enter the main transcript.
- God Edit now rolls back to the pre-edit waterline if a later persistence step
  fails.
- Concealment consequences no longer broadcast hidden values to every
  co-present character. Do / Observe inputs write observer-safe character memory;
  hidden consequences produce inferred/partial awareness for ordinary observers;
  gossip only retells witnessed/full observations.
- Player-facing narration snapshots anonymize not-yet-known pressure lines; their
  summaries and next signs no longer leak before a fair diegetic sign exists.
- Offstage advancement of unknown pressure lines is now sign-gated: the proposal
  must carry a player-facing `nextSign` or it is dropped.
- Player-facing narration / settlement / Library now use player-known truth only:
  hidden fact values without `playerKnown` are omitted, unknown pressure summaries
  stay out of unresolved lines, and unknown threads can only contribute safe
  generic/next-sign hooks.
- Return page-open now runs offstage reconciliation through the WriteGate before
  composing the return echo; `lastSeenAt` is refreshed so the next action does not
  silently replay the same absence.
- Doorway Library hooks now prefer forward candidates before unresolved lines,
  past trace, and bond.
- Partial/inferred concealment memories derive keywords from their safe visible
  text only, not the raw hidden action.
- Ambiguous legacy memories from multi-instance IndexedDB upgrades stay out of
  active character reads but remain visible through audit reads.
- Opening-turn first consequence no longer depends on Reactor voluntarily
  writing `setFact`: if there is no previous player-caused anchored fact and a
  clear player action has already committed an object/condition state change,
  the engine derives one player-known anchored fact from that validated change
  and commits it through the same WriteGate. The prior-anchor check also ignores
  God/offscreen/non-player facts, so author edits no longer suppress the
  player's first-consequence funnel event.
- God-edit reconcile now covers rewritten `setFact`, `setCondition`, and
  `setRelationship` changes. It appends authored correction memories only for
  memories that mention the old value and, for entity-scoped facts / conditions /
  relationships, also mention the relevant subject name or id; this prevents
  generic old-value mentions from being treated as witnesses.
- God-edit reconcile now also catches a conservative paraphrase band for common
  old-value evidence such as injury / health and trust / wariness, still requiring
  the relevant subject hint before a memory is treated as a witness.
- Inner-knowledge guard support no longer uses loose CJK single-character overlap.
  A character's own memories must contain the claimed inner knowledge as a
  contiguous phrase, or a normalized phrase variant with leading perspective
  pronouns / common particles removed.
- Lawful-distortion narration rules now reach the Director guard. Offstage names
  and visible-state contradictions may pass only when the prose ties that
  entity/object to an allowed distortion medium from the narration rule, so a
  mirror/recording/doorplate beat can survive without making the figure present
  or changing the underlying committed truth.
- Guard-rejected forced lull-breaks no longer produce a fully empty turn. The
  active-agent loop retries the next-best pass candidate before honoring the
  forced break; if every forced candidate is rejected, it emits a neutral,
  projection-safe narration beat instead of leaking the rejected prose.
- The keyless sample conversion cliff is now instrumented locally: `/play`
  records `prebaked-taste` when a built-in scripted sample is shown, the sample
  CTA opens Settings with the sampled world id, and a non-empty key save from
  that handoff records `key-add` for the same seed. `computeFunnel` now reports
  `prebaked-taste→key-add` and `key-add→first-action`.
- Offstage reconciliation now enforces actual tier budgets after model proposal:
  far targets are frozen, near entity-bearing changes are capped to three, and
  related entity-bearing changes are capped to one. World-global deltas and the
  existing player-facing sign gate for unknown pressure-line advancement remain
  separate.
- Return settlement now consumes the offscreen deltas that actually passed the
  WriteGate and turns committed near-scene entity changes into compact local
  signs before composing the return-open echo.
- Play now keeps read-only visible presence fresh via a locked `lastSeenAt`
  touch, while hidden-tab returns still run reconciliation before touching.
- God Edit commits now enter the Studio trace with `god` provenance; guard
  rejections have structured trace records instead of only note text.
- Derived `entryAction` fallbacks no longer hard-slice text mid-phrase; overlong
  source names fall back to complete short actions.
- The keyless built-in pool now has eight quality-gated doors instead of five,
  adding fog-market debt intrigue, polar-station survival science, and final-show
  theater mystery to reduce visible feed repetition.

---

## Tier 1 — weakens a core promise (fix first)

### 1. Concealment consequences broadcast to every co-present character — resolved
- **Location**: `src/lib/memory/observe.ts`, `src/lib/engine/input-router.ts`, `src/lib/memory/gossip.ts`
- **Intent**: §6 / §6.1 limited POV; §24 POV-asymmetry; canonical key example (`product-design.md:168-174`)
- **Original gap**: `setFact{field:"hidden"}` was written verbatim to every present character as `witnessed`/full, and gossip could spread it one more hop.
- **Current status**: Do / Observe write observer-safe character memory; concealment consequences create inferred/partial awareness for ordinary observers without the hidden value; gossip only retells witnessed/full observations.
- **Residual risk**: true attention modeling is still heuristic. Future work should let Director/Reactor pass explicit exact witness ids when a character really sees the hidden detail.

### 2. Not-yet-known pressure threads leak into player-facing narration — resolved
- **Location**: `src/lib/world/narration.ts:40-46` → consumed at `src/lib/engine/director.ts:206`
- **Intent**: §12 narration-from-truth; §5.2 fairness; charter §9 perception boundary
- **Original gap**: `formatNarrationSourceSnapshot` emitted each active thread's `summary` + `nextSign` regardless of `thread.playerKnown`, injected as the truth snapshot into the player-facing narration prompt. The guard could not catch it because it was a real fact, not a phantom entity.
- **Current status**: not-yet-known active threads are rendered only as anonymous pressure with status/intensity; `summary` and `nextSign` are stripped until the player knows the thread.
- **Residual risk**: deeper semantic fairness still depends on the Director /
  offscreen proposal quality, but unknown pressure-line advancement no longer
  hardens without `nextSign` and committed local entity changes now get
  player-visible return signs.

### 3. Return echo fires before the world advances; the advance then lands silently — resolved
- **Location**: `src/app/play/page.tsx:128` (`emitReturnOpenBeat` on load) + `src/lib/engine/turn.ts:576` (`evolveWhileAway` only inside `runTurn`)
- **Intent**: §3.3 / §3.4 step 6 — "returning **advances** the world"
- **Original gap**: re-entry composed the echo from stored settlement without running `evolveWhileAway` or updating `lastSeenAt`. Offstage reconciliation only happened on the next action; by then the echo was idempotent-suppressed.
- **Current status**: live page-open calls the return reconciler first, commits away deltas as `offscreen`, derives a fresh settlement, composes the echo from that new state, then marks the prior absence as seen.
- **Residual risk**: the echo is still compact system narration; richer local signs / character reactions remain roadmap work.

### 4. Echo candidates almost always empty → Library hook + echo replay the past — resolved for runtime
- **Location**: `src/lib/world/settlement.ts:58-62` (candidates from `nextSign`), `:81-84` (`settlementLibraryHook`); `src/lib/world/seed-demo.ts` (no pressure lines); `seeds-builtin.ts` (only 2 `nextSign`)
- **Intent**: §3.3 open risk — the Library must resurface with "enough pull (its echo)"
- **Original gap**: candidates needed active pressure lines with `nextSign`; empty candidates made echo fall back to unresolved/trace, and `settlementLibraryHook` ordered trace (past) before candidate (future).
- **Current status**: runtime synthesizes non-leaking forward candidates, hides unknown summaries from unresolved lines, and Library hook order is candidate → unresolved → trace → bond.
- **Residual risk**: seed/content quality still matters; richer authored `nextSign` coverage remains useful, but the runtime no longer collapses to past-only replay.

### 5. "Earn a canon" rides one silence-biased reactor call, no engine floor — resolved
- **Location**: `src/lib/engine/turn.ts:689-715`; `src/lib/engine/reactor.ts:139,179,265-267`
- **Intent**: §3.2/§3.4 (earn canon in first minutes); §24 first-consequence; first-principles §4.3 "when uncertain, run"
- **Original gap**: funnel fired only on a committed non-ambient `setFact`. The reactor prompt repeatedly biases toward silence; `react()` swallows errors to `[]`. The player's genuinely consequential opening action could mint no canon — the opposite of bias-to-run.
- **Current status**: after Reactor commits, the turn loop checks whether this instance already has a player-caused anchored fact. If not, and the current clear player action has committed a durable object/condition state mutation but no fact, the engine derives one player-known anchored fact from that validated mutation and submits it through WriteGate as Director provenance. The funnel then fires from either the Reactor fact or this floor fact.
- **Residual risk**: the floor is intentionally narrow; relationship-only, movement-only, and richer semantic consequences still need either better Reactor output or later floor coverage.

---

## Tier 2 — clear experience gap (not core-breaking)

### 6. God-edit reconcile only supersedes `setFact` → world snaps back to old belief — resolved
- **Location**: `src/lib/engine/reconcile.ts:32-33`
- **Intent**: §10.4 "contradicted memories/beliefs are superseded"
- **Original gap**: `setRelationship` / `setCondition` God edits committed to state but produced zero supersession memories; characters could re-assert the pre-edit belief next turn.
- **Current status**: `reconcileGodEditMemories` derives reconcile targets for rewritten facts, conditions, and relationship stances, then appends authored correction memories for same-instance witnesses whose old memories reference that old value in the relevant subject context.
- **Residual risk**: common paraphrases for injury / health and trust / wariness are covered, but this is still a conservative whitelist rather than a full semantic belief-graph rewrite.

### 7. Inner-knowledge guard is near-decorative (CJK 2-char overlap passes) — resolved
- **Location**: `src/lib/engine/guard.ts:163-171` (`projectionSupportsClaim`) + `keywords.ts:30-35`
- **Intent**: §12 / charter — no knowledge outside projection
- **Original gap**: `threshold = min(2, claimKeywords.length)` counted shared single CJK chars; two-char overlap was ubiquitous, so most attributed knowledge could wave through.
- **Current status**: `projectionSupportsClaim` now accepts only phrase containment: the character's own memories must contain the claim or a normalized variant with leading perspective pronouns/common particles removed. Loose keyword overlap no longer supports inner-knowledge attribution.
- **Residual risk**: this is still a conservative, verbatim-ish backstop; paraphrased valid knowledge may be rejected until a semantic belief-graph check exists.

### 8. Lawful-distortion worlds lose their signature beats to the guard — resolved
- **Location**: `src/lib/engine/guard.ts` (contradiction/offstage logic) vs seed `narrationRule` (`seeds-builtin.ts:265`)
- **Intent**: §12 lawful distortion is a rules-level seed property
- **Original gap**: a seed declaring mirror/recording distortion had the narrator faithfully render an absent figure; `consistencyGuard` had no awareness of the distortion rule and flagged it as an offstage slip, dropping the correct beat.
- **Current status**: `guardSnapshot` accepts the seed narration rule. When the rule declares lawful distortion, the guard creates a narrow media allowance (mirror / recording / doorplate / similar display surfaces) and relaxes only offstage-name or visible-state contradiction slips where that medium appears near the affected name/object in the prose.
- **Residual risk**: still a conservative text backstop, not a semantic proof. Paraphrased or unusual distortion media may need seed wording / guard vocabulary updates.

### 9. A guard-rejected forced lull-break yields a fully empty turn — resolved
- **Location**: `src/lib/engine/agent-runtime.ts:139-143` + `:165`
- **Intent**: §12 graceful fallback
- **Original gap**: on `sel.forced`, a rejected speaker `continue`d and then `if (sel.forced) break` exited unconditionally — no other speaker, no substitute narration. Player input met with silence, turn budget spent.
- **Current status**: forced guard rejections are tracked separately from normal explicit-speak rejections. The loop first retries the next-best remaining pass candidate; if all forced candidates are rejected and nothing visible has happened, it appends a neutral narration line about the last rejected character's hesitation.
- **Residual risk**: the fallback is intentionally generic; richer Director-authored fallback beats would need a separate narration path and guard accounting.

### 10. Studio Inspector reachable by keyless visitors in sample mode — resolved
- **Location**: `src/app/play/page.tsx` (toggle `disabled={busy}` ~506; `studioControlsDisabled = busy || prebakedMode` ~333)
- **Intent**: charter §6 clean sample; advanced surfaces "hidden, discoverable"
- **Gap**: prebaked disables studio *channel* buttons but the Studio toggle is gated only on `busy`; a keyless taster can open the full Context Inspector (facts/hardness/threads/beliefs/notes).
- **Impact**: **Medium**.
- **Direction**: gate the toggle with `|| prebakedMode`; hide the studio/channel bar entirely in sample mode.

### 11. Sample renders a wall of disabled live controls (reads as a broken reactive loop) — resolved
- **Location**: `src/app/play/page.tsx` channel grid ~485; rewind/regen/fork/send ~660-700
- **Intent**: §4.3 / charter §6 — "plainly a sample, never a faked reactive loop"
- **Gap**: prebaked shows greyed channel tabs, studio tab, rewind/regen/fork/send + disabled textarea; only a `sampleNotice` line signals "sample." Dead control surface frames key-add as "unlock broken UI."
- **Impact**: **Medium** (sits on the conversion cliff).
- **Direction**: in sample mode replace the control bar with one prominent "Add a key to make the world respond" CTA.

---

## Tier 3 — metric fidelity / edge correctness / observability

| # | Issue | Location | Impact |
|---|---|---|---|
| 12 | Keyless sample emits **no funnel event** — **resolved** with `prebaked-taste` / `key-add` local funnel events and sample→Settings world handoff | `play/page.tsx`, `settings/page.tsx`, `funnel.ts` | Med |
| 13 | Offstage evolution not bounded to §7.1 per-tier budgets — **resolved** with post-proposal near/related entity-change caps | `offstage.ts` | Med |
| 14 | Offstage commit emits no sign / no awareness check → a thread can harden offstage with no prior sign (§5.1) — **resolved** for current runtime by pressure-line `nextSign` gating plus return-local signs derived only from committed offscreen entity deltas | `world/offstage.ts`, `world/offscreen.ts`, `settlement.ts`, `turn.ts` | Med |
| 15 | God-edit witness scope is raw substring match on old value — **resolved for current runtime** with subject-hinted matching plus conservative paraphrase evidence clusters for common condition / relationship rewrites; broader belief-graph semantic repair remains Phase 2 depth | `reconcile.ts` | Med |
| 16 | `lastSeenAt` tracks "last action" not "last exit": read-only sessions don't refresh settlement; a mid-session 6h pause then input mis-fires a full echo — **resolved** with visible-page presence touch plus hidden-tab reconcile before touch | `turn.ts`, `play/page.tsx` | Med |
| 17 | `first-consequence` `priorAnchored` scans the whole log regardless of source — **resolved** by filtering prior anchors to player-caused facts and excluding God/offscreen/flesh/materializer sources | `turn.ts` | Med (metric only) |
| 18 | God-edit commit skips the Studio trace (`GateCtx` missing `trace`) — **resolved**; God Edit now passes `trace` into the WriteGate and emits completed / rolled-back traces | `turn.ts`, `trace.ts` | Med |
| 19 | Consequence memories are gossip-eligible, so #1's leak propagates one more hop — **resolved** by limiting gossip to witnessed/full observations | `memory/observe.ts` + `memory/gossip.ts` | Med (amplifier of #1) |
| 20 | Guard rejection logged only to trace, no counter — **resolved** with structured `guardRejections` in `TurnTrace` for Director and character projection guard drops | `trace.ts`, `turn.ts`, `agent-runtime.ts` | Low (observability) |
| 21 | Keyless feed is now the 5 builtins on a loop — visible repetition weakens top-of-funnel dwell — **resolved for MVP** by expanding the quality-gated built-in pool to 8 non-repeating doors, each with a distinct `entryAction` and `prebakedTaste` | `seeds-builtin.ts` | Low (charter-correct; content depth) |
| 22 | `entryAction` derive-fallback `.slice(0,24)` can clip a CTA mid-phrase (derive path only) — **resolved** with complete short fallback actions instead of hard slicing | `presentation.ts` | Low |
| 23 | `runTurn` accepts any `inputChannel` with no authority gate (UI-enforced only) — fine for single-user local; matters only for shared worlds | `turn.ts:48-51` | Low (single-user non-issue) |

---

## Verified clean (so they aren't re-flagged)

- Every durable write, incl. God edits, routes through the single `commit` gate (`turn.ts:687`); authority only widens which deltas validate (`delta.ts:361` `source !== "god"`). Gate never bypassed.
- God edits commit on `branchId` (private branch), never mutate the public `seed` (charter §15.8).
- Anchored/core facts revisable only by `source === "god"` (`delta.ts:357-368`).
- `directorNotes`/`sceneContract` reach only Director casting/narration orchestration, never character prompt/perception; out-of-world `characterText` is `""` (`input-router.ts`); `assertNoOutOfWorldLeak` guards the projection (`perception.ts:69-94`).
- Keyless sample is genuinely static: `shouldUsePrebakedTaste` requires `source==="builtin"` + payload + no key; no `streamChat`/`runTurn` reachable; non-builtin worlds can't masquerade.
- No idle/background timer or server simulation anywhere — the no-idle-sim invariant holds.
- Streaming agent deltas are buffered until the projection guard passes (`agent-runtime.ts:133-153`); a rejected leak never reaches the UI. Rejected director beats are not appended before the reactor reads `recentLines`, so a slipped "fact" can't seed a reactor delta.
- Empty-key save blocked; provider/model/OpenRouter-only-reasoning coherence enforced (`applyProviderDefaults` + `normalizeUserConfig`). Funnel events stay local-first, never touch characters.
- Seed-embedded keys are stripped/ignored by runtime model resolution; content records are not secret stores.
- Director `setTension` and surfacing `moveCharacter` now pass through WriteGate and log with `director` provenance.
- Active timeline views hide superseded branch records while explicit audit reads expose archived messages/memories/delta logs.
- Director Note / Scene Contract no longer write into the main transcript.
- God Edit uses a rollback waterline for partial persistence failure.
- Concealment memories are perception-graded and gossip-safe: non-exact
  observers learn only that something was concealed, not the hidden value.
- Not-yet-known pressure lines are anonymized in the Director narration source
  snapshot.
- Unknown pressure-line advancement during offstage reconciliation is dropped
  unless it carries a player-facing `nextSign`.
- `reconcile.ts` is god-edit memory reconciliation (append-only / supersede-not-overwrite), correct in shape.
