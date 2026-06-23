# 任意门 / Anywhere Door — Product Roadmap

- **日期**: 2026-06-24
- **状态**: aligned to `AGENTS.md` and
  `docs/superpowers/specs/2026-06-24-overall-product-design.md`.
- **职责**: 描述从当前实现走向最新产品设计的路径。本文不是承诺清单;
  实现状态以代码与 `docs/DESIGN.md` 为准。

## 1. Roadmap Principles

- **先让世界更真,再让功能更多。** 新功能必须增强存在、连续、因果、
  记忆、信息差或回访价值。
- **先私有实例,后公共分享。** 用户玩的世界是自己的 private branch;
  可分享的是 seed / door definition,不是默认公开的游玩历史。
- **先 Consequence Mode,后 live simulation。** 默认不做后台空转;用户回来时
  懒补合理后果。
- **先隐藏高级控制,后暴露 Studio。** 默认体验是沉浸 Player Mode;Director /
  God 控制面向 power users、NSFW、高控制创作和调试。
- **先行为序列,后标签生态。** 推荐与生成要看用户历史行为序列,并保持探索
  / 利用平衡。

## 2. Current Foundation

当前代码已经提供这些地基:

- vertical door feed, cold-open cards, open-door transition, play route
- BYO-key, local-first storage, IndexedDB repositories
- `WorldRules + WorldState + Delta` structured world model
- `reactor -> validateDelta -> applyDelta` gate
- append-only `deltaLog`
- location traversal, locked/gated/portable physical constraints
- lore injection and `establishLore`
- subjective memory, reflection, relationship ledger, hearsay
- location `stub -> fleshed` on first visit
- `establishCharacter` and instance-private world characters
- lazy offscreen reconciliation through `evolveWhileAway`
- regenerate-last-turn mechanics

These are foundations, not the whole product. The next work should make them
feel coherent to users.

## 3. Phase 1 — Make The MVP Feel Like A Private Living-World Browser

Goal: every first session proves "this is a real world", and every return makes
the world feel personal.

### 3.1 Doorway Library

- Turn opened instances into a visible, first-class history/library.
- Show last location, latest consequence, unresolved tension, and relationship
  state.
- Add pin/unpin or "my doorway" affordance.
- Keep return hints light; no aggressive notification loop.

### 3.2 Medium Seed Contract

- Upgrade generated seeds from setting summaries into contracts:
  hard rules, tonal gravity, opening locality, anchors, 2-3 pressure lines,
  expansion grammar, canon ledger.
- Ensure new details unfold as native world detail, not as outside imports.
- Keep seed compact enough for cheap generation and fast judging.

### 3.3 Pressure Lines

- Add semi-hidden pressure lines to generation and runtime prompts.
- Surface pressure diegetically: rumor, changed object, avoidance, message,
  absence, altered location, or returning detail.
- Avoid quest-log UI by default.
- Fairness rule: hidden pressure can create signs; strong consequences require
  perception, contact, or prior warning.

### 3.4 Input Channels

Expose user intent without forcing everything through one text box:

- Say
- Do
- Observe / Inspect
- Director Note

The first three are in-world. Director Note is out-of-world steering and must
stay channel-isolated.

### 3.5 Taste Chronicle

- Store local behavior sequences, not just tags.
- Track dwell, quick swipe, returns, abandon, first action, world longevity,
  relationship patterns, intensity preferences, branch/regenerate behavior.
- Feed ranking should balance exploit / bridge / explore / diversity.
- Generation should use taste history as a seed-generator input while protecting
  world character knowledge from cross-world leakage.

### 3.6 Character Reality

- Represent private beliefs, wrong beliefs, secrets, goals, and witnessed facts
  more explicitly.
- Make characters respond to what they plausibly know, not what the engine knows.
- Strengthen social causality: different characters should judge the same action
  through different values.

### 3.7 Entity Lifecycle For All Entity Types

- Extend `stub -> fleshed` beyond locations into objects, characters, and lore.
- Promote entities only when they earn persistence.
- Summarize or offstage entities that no longer need active context.
- Preserve identity and memory once an entity crystallizes.

### 3.8 Consequence Mode Polish

- Make return reconciliation user-visible through changed local details and
  social echoes.
- Use the delta log as evidence for delayed callbacks and offstage changes.
- Keep major offscreen consequences bounded unless the user had signs.

### 3.9 Timeline Hygiene

- Keep regenerate/rewind/fork mechanics from leaking old branch state into new
  branch memory, relationships, or object state.
- Start with small visible controls before full branch comparison UI.

## 4. Phase 2 — Depth And Power-User Surfaces

Goal: support long-running RP, NSFW, creative steering, and world inspection
without breaking immersion for default users.

### 4.1 Director Notes And Scene Contract

- Director Notes steer pacing, tone, boundaries, and desired direction without
  becoming character speech.
- Scene Contract sets local intensity, consent/boundary rules, relationship
  direction, and NSFW constraints.
- Keep contracts private to the control layer unless deliberately canonized.

### 4.2 God Mode / Studio Mode

- Allow direct private-world edits: canon repair, relationship adjustment,
  object/location fixes, branch cleanup.
- Edits affect the private instance, not the public seed.
- Keep default Player Mode clean.

### 4.3 Door Passport

- Local cross-world profile for user preferences, boundaries, pronouns/identity
  choices, favored dynamics, and control style.
- It can influence recommendations and new seeds.
- Characters do not automatically know passport facts unless canonized.

### 4.4 World Atlas

- Private record of a world: places, characters, relationships, objects, lore,
  pressure lines, open mysteries, and timeline notes.
- The Atlas should feel like the player's memory/notes, not a debug dump.
- Advanced users can reveal more mechanical detail.

### 4.5 Context Inspector

- Studio/debug view for prompts, visible state, injected lore, active memories,
  selected speakers, and proposed deltas.
- Must be hidden from the default play surface.

### 4.6 Director Profiles

- Product-level presets: slow burn, high agency, romance focus, horror pressure,
  sandbox exploration, strict canon, high-control RP.
- Profiles tune pacing, pressure exposure, narration density, and agency without
  exposing raw model knobs first.

### 4.7 Home / Base / Anchor

- Long-running worlds should develop a recurring anchor: place, role,
  relationship, unfinished problem, or personal project.
- Returning should feel like resuming a life, not reopening a chat.

## 5. Phase 3 — Creation, Import, And Sharing

Goal: let creators author doors while keeping each user's world private and
alive.

### 5.1 Seed Studio

- Create and edit seed contracts.
- Author pressure lines, expansion grammar, red lines, initial anchors, and
  opening locality.
- Preview a cold-open card and first scene.
- Validate that seed edits do not violate the charter.

### 5.2 Imports As Native World Entities

- Character-card imports can seed native world entities.
- Imported characters still enter through the world's own logic, never through
  the player's door.
- Imported data should map into private POV, goals, secrets, and memory seeds
  rather than becoming omniscient prompt paste.

### 5.3 Public Seeds, Private Branches

- Users may share seeds / door definitions.
- Private deltas, Taste Chronicle, Door Passport, NSFW settings, and play history
  stay local by default.
- Later sharing can export chronicles, branches, or curated snapshots with
  explicit user action.

## 6. Later, Not Now

- true real-time multiplayer shared worlds
- always-running server simulation
- marketplace / creator monetization
- voice-first or image-first interaction
- deterministic large-map pre-generation
- full physics sandbox across every object property
- public social graph of user play history

These may become valuable, but they are not required to prove the core thesis.

## 7. Product Quality Signals

The product is improving when:

- users can judge a door in seconds
- first actions produce visible, specific consequences
- users return to the same world without being pushed
- characters surprise users through limited POV, not random prose
- the feed avoids both repetition and incoherent novelty
- long-running worlds accumulate local history, not just chat length
- power users can steer scenes without destroying the world illusion
