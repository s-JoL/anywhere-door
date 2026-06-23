# Entity Genesis Primitive — Implementation Plan

> **Historical implementation plan.** This plan records how the first entity
> genesis primitive was implemented. For current product authority, read
> `AGENTS.md` and
> `docs/superpowers/specs/2026-06-24-overall-product-design.md` first.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the World Reactor crystallize a brand-new, persistent character on demand (`establishCharacter`), stored instance-privately so the frozen shared seed is never mutated.

**Architecture:** Add an instance-private `WorldState.characters` map (the seed stays frozen/shared); `presentCharacters` looks up seed ∪ instance characters. Add `establishCharacter` as the 11th `Delta`, flowing through the existing `propose → validate → apply` path; the Reactor learns to emit it. A spawned character lands `present` at a location and joins the next turn's talk loop through the unchanged engine. This is **Plan 1 of 2** — the genesis primitive. Plan 2 (Director-as-caster: active-agent cap + proactive surfacing + lazy flesh-out) builds on this.

**Tech Stack:** TypeScript (strict), Vitest. Run all tests with `npm test`; a single file with `npx vitest run <path>`; types with `npm run typecheck`.

## Global Constraints

- **Rules immutable · propose → validate → apply.** Characters never write state; only validated deltas mutate `WorldState` (`AGENTS.md` §13).
- **The world is the source.** A spawned character is the world *detailing itself*, not an import from outside; the door (任意门) is the player's alone (`AGENTS.md` §7). No "推门进来" framing in this plan (surfacing narration is Plan 2).
- **Seed is frozen & shared.** Never write spawned characters into `seed.characters`; they live in `WorldState.characters` (instance-private).
- **Never delete spawned characters.** Identity is stable because the instance state persists; archival (Plan 2) is a presence flag only.
- **No regressions.** The existing suite must stay green: `npm test`.
- All new optional fields keep existing states/tests valid (no required-field additions to `WorldState`/`Character`).

---

### Task 1: Instance-private characters

**Files:**
- Modify: `src/lib/types.ts` (add `Character.detail?`, `WorldState.characters?`)
- Modify: `src/lib/engine/prompt.ts:11-17` (`presentCharacters` merges seed ∪ instance)
- Test: `src/lib/engine/__tests__/prompt.test.ts`

**Interfaces:**
- Produces: `WorldState.characters?: Record<string, Character>` (instance-private, optional); `Character.detail?: "stub" | "fleshed"`; `presentCharacters(seed, state)` now also resolves ids from `state.characters`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/engine/__tests__/prompt.test.ts` (add `import type { Character, WorldState } from "../../types";` at the top if not present):

```ts
describe("presentCharacters — instance-private characters", () => {
  it("resolves ids from state.characters as well as seed.characters", () => {
    const spawned: Character = { id: "c-stranger", name: "陌生人", description: "角落里的人", detail: "stub" };
    const state: WorldState = {
      ...DEMO_SEED.openingState,
      characters: { "c-stranger": spawned },
      locations: {
        ...DEMO_SEED.openingState.locations,
        bar: {
          ...DEMO_SEED.openingState.locations.bar,
          presentCharacterIds: [...DEMO_SEED.openingState.locations.bar.presentCharacterIds, "c-stranger"],
        },
      },
    };
    const present = presentCharacters(DEMO_SEED, state);
    expect(present.map((c) => c.id)).toContain("c-stranger"); // instance-private resolved
    expect(present.map((c) => c.id)).toContain("c-lan");        // seed character still resolved
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/engine/__tests__/prompt.test.ts -t "instance-private"`
Expected: FAIL — `c-stranger` is not in the result (current `presentCharacters` only reads `seed.characters`).

- [ ] **Step 3: Add the optional types**

In `src/lib/types.ts`, add `detail` to `Character`:

```ts
export interface Character {
  id: string;
  name: string;
  description: string;   // 设定（含性格）
  detail?: "stub" | "fleshed";  // 实例内按需生长的角色：stub 待充实，fleshed 已完整（seed 角色视为 fleshed）
  identity?: Identity;   // 不可变硬事实
  goal?: string;         // 当前目标（被 Director/God 注入主观 prompt）
  systemPrompt?: string;             // 角色覆盖系统前缀（支持 {{original}}）
  postHistoryInstructions?: string;  // 角色覆盖末尾后置强化（支持 {{original}}）
}
```

In `src/lib/types.ts`, add `characters` to `WorldState` (place it after `roster`):

```ts
  roster: Record<string, CharObjective>;
  /** 实例私有、按需生长的角色（seed 冻结共享，新角色绝不写回 seed）。 */
  characters?: Record<string, Character>;
  flags: Record<string, string | number | boolean>;
```

- [ ] **Step 4: Make `presentCharacters` merge seed ∪ instance**

Replace the body of `presentCharacters` in `src/lib/engine/prompt.ts`:

```ts
export function presentCharacters(seed: WorldSeed, state: WorldState): Character[] {
  const loc = state.locations[state.currentLocationId];
  if (!loc) return [];
  return loc.presentCharacterIds
    .map((id) => seed.characters.find((c) => c.id === id) ?? state.characters?.[id])
    .filter((c): c is Character => !!c);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/engine/__tests__/prompt.test.ts -t "instance-private"`
Expected: PASS

- [ ] **Step 6: Typecheck + full suite (no regressions)**

Run: `npm run typecheck && npm test`
Expected: typecheck clean; all tests pass (322 + the new one).

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/lib/engine/prompt.ts src/lib/engine/__tests__/prompt.test.ts
git commit -m "feat(world): instance-private WorldState.characters; presentCharacters merges seed ∪ instance

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `establishCharacter` delta (type + validate + apply)

**Files:**
- Modify: `src/lib/world/delta.ts` (union member + `validateDelta` case + `applyDelta` case)
- Test: `src/lib/world/__tests__/delta.test.ts`

**Interfaces:**
- Consumes: `WorldState.characters?` and `Character.detail?` from Task 1.
- Produces: `Delta` gains `{ kind: "establishCharacter"; id: string; name: string; role?: string; goal?: string; locationId: string }`. `applyDelta` writes the new `Character` (`detail:"stub"`, `description: role ?? ""`) into `state.characters`, adds `{ name }` to `roster`, and appends the id to `locations[locationId].presentCharacterIds`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/world/__tests__/delta.test.ts`:

```ts
describe("establishCharacter", () => {
  it("validateDelta rejects empty name", () => {
    const r = validateDelta(baseState(), rules, { kind: "establishCharacter", id: "c-new", name: "", locationId: "bar" });
    expect(r.ok).toBe(false);
  });
  it("validateDelta rejects id already in roster (covers seed characters)", () => {
    const r = validateDelta(baseState(), rules, { kind: "establishCharacter", id: "c1", name: "冒牌", locationId: "bar" });
    expect(r.ok).toBe(false);
  });
  it("validateDelta rejects a nonexistent location", () => {
    const r = validateDelta(baseState(), rules, { kind: "establishCharacter", id: "c-new", name: "守卫", locationId: "nowhere" });
    expect(r.ok).toBe(false);
  });
  it("validateDelta accepts a valid new character", () => {
    const r = validateDelta(baseState(), rules, { kind: "establishCharacter", id: "c-new", name: "守卫", role: "门口的守卫", locationId: "bar" });
    expect(r.ok).toBe(true);
  });
  it("applyDelta adds a stub character to state.characters with role→description", () => {
    const next = applyDelta(baseState(), { kind: "establishCharacter", id: "c-new", name: "守卫", role: "门口的守卫", goal: "盘问来客", locationId: "bar" });
    expect(next.characters?.["c-new"]).toMatchObject({
      id: "c-new",
      name: "守卫",
      description: "门口的守卫",
      detail: "stub",
      goal: "盘问来客",
    });
  });
  it("applyDelta registers the character in roster and makes it present", () => {
    const next = applyDelta(baseState(), { kind: "establishCharacter", id: "c-new", name: "守卫", locationId: "bar" });
    expect(next.roster["c-new"]).toEqual({ name: "守卫" });
    expect(next.locations.bar.presentCharacterIds).toContain("c-new");
  });
  it("applyDelta does NOT mutate input state", () => {
    const s = baseState();
    applyDelta(s, { kind: "establishCharacter", id: "c-new", name: "守卫", locationId: "bar" });
    expect(s.characters).toBeUndefined();
    expect(s.roster["c-new"]).toBeUndefined();
    expect(s.locations.bar.presentCharacterIds).not.toContain("c-new");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/world/__tests__/delta.test.ts -t "establishCharacter"`
Expected: FAIL / typecheck error — `"establishCharacter"` is not a member of `Delta`.

- [ ] **Step 3: Add the union member**

In `src/lib/world/delta.ts`, add to the `Delta` union (after the `establishLore` line):

```ts
  | { kind: "establishLore"; id: string; keys: string[]; content: string }
  | { kind: "establishCharacter"; id: string; name: string; role?: string; goal?: string; locationId: string };
```

Add the import for `Character` at the top of `src/lib/world/delta.ts`:

```ts
import type { WorldState, WorldRules, Character } from "../types";
```

- [ ] **Step 4: Add the `validateDelta` case**

In `src/lib/world/delta.ts`, add a case inside `validateDelta`'s switch (after the `establishLore` case):

```ts
    case "establishCharacter": {
      if (!d.name) return { ok: false, reason: "角色名不能为空" };
      if (state.roster[d.id]) return { ok: false, reason: `角色 ${d.id} 已存在` };
      if (!state.locations[d.locationId])
        return { ok: false, reason: `地点 ${d.locationId} 不存在` };
      return { ok: true };
    }
```

- [ ] **Step 5: Add the `applyDelta` case**

In `src/lib/world/delta.ts`, add a case inside `applyDelta`'s switch (after the `establishLore` case):

```ts
    case "establishCharacter": {
      const loc = state.locations[d.locationId];
      const char: Character = {
        id: d.id,
        name: d.name,
        description: d.role ?? "",
        detail: "stub",
        ...(d.goal ? { goal: d.goal } : {}),
      };
      return {
        ...state,
        characters: { ...(state.characters ?? {}), [d.id]: char },
        roster: { ...state.roster, [d.id]: { name: d.name } },
        locations: {
          ...state.locations,
          [d.locationId]: {
            ...loc,
            presentCharacterIds: loc.presentCharacterIds.includes(d.id)
              ? loc.presentCharacterIds
              : [...loc.presentCharacterIds, d.id],
          },
        },
      };
    }
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npx vitest run src/lib/world/__tests__/delta.test.ts -t "establishCharacter" && npm run typecheck`
Expected: PASS; typecheck clean (the switch exhaustiveness now covers all 11 kinds).

- [ ] **Step 7: Commit**

```bash
git add src/lib/world/delta.ts src/lib/world/__tests__/delta.test.ts
git commit -m "feat(world): add establishCharacter delta (the 11th) — world details a new persistent character

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Reactor can propose `establishCharacter`

**Files:**
- Modify: `src/lib/engine/reactor.ts` (`VALID_KINDS`, `parseDeltas` branch, `buildReactorPrompt` system text)
- Test: `src/lib/engine/__tests__/reactor.test.ts`

**Interfaces:**
- Consumes: the `establishCharacter` `Delta` member from Task 2.
- Produces: `parseDeltas` accepts a well-formed `establishCharacter` object and drops it when `id`/`name`/`locationId` is missing; the Reactor system prompt documents the format.

- [ ] **Step 1: Write the failing tests**

Append to the `describe("parseDeltas", ...)` block in `src/lib/engine/__tests__/reactor.test.ts`:

```ts
  it("accepts establishCharacter with required fields", () => {
    const text = '[{"kind":"establishCharacter","id":"c-guard","name":"守卫","role":"门口的守卫","locationId":"bar"}]';
    const result = parseDeltas(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ kind: "establishCharacter", id: "c-guard", name: "守卫", role: "门口的守卫", locationId: "bar" });
  });

  it("drops establishCharacter missing id/name/locationId", () => {
    const text = JSON.stringify([
      { kind: "establishCharacter", name: "守卫", locationId: "bar" }, // missing id
      { kind: "establishCharacter", id: "c-guard", locationId: "bar" }, // missing name
      { kind: "establishCharacter", id: "c-guard", name: "守卫" },       // missing locationId
    ]);
    expect(parseDeltas(text)).toHaveLength(0);
  });
```

Append to the `describe("buildReactorPrompt", ...)` block:

```ts
  it("system prompt documents establishCharacter for new persistent people", () => {
    const msgs = buildReactorPrompt(baseState(), [], { "c-lan": "阿岚", you: "你" });
    expect(msgs[0].content).toContain("establishCharacter");
  });
```

Append to the `describe("react", ...)` block:

```ts
  it("react: returns establishCharacter delta from fake llm", async () => {
    const fakeLlm = async () => ({
      content: '[{"kind":"establishCharacter","id":"c-guard","name":"守卫","role":"门口的守卫","locationId":"bar"}]',
    });
    const deltas = await react({
      state: baseState(),
      recentLines: ["你：门口那个守卫是谁？"],
      nameById: { "c-lan": "阿岚", you: "你" },
      llm: fakeLlm,
    });
    expect(deltas).toHaveLength(1);
    expect(deltas[0].kind).toBe("establishCharacter");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/engine/__tests__/reactor.test.ts -t "establishCharacter"`
Expected: FAIL — `establishCharacter` objects are dropped (not in `VALID_KINDS` / no parse branch); system prompt lacks the string.

- [ ] **Step 3: Register the kind**

In `src/lib/engine/reactor.ts`, add to the `VALID_KINDS` set (after `"establishLore"`):

```ts
  "establishLore",
  "establishCharacter",
]);
```

- [ ] **Step 4: Add the parse branch**

In `src/lib/engine/reactor.ts` `parseDeltas`, add a branch after the `establishLore` branch (before the `if (result.length >= 12) break;` line):

```ts
      } else if (item.kind === "establishCharacter" && typeof item.id === "string" && typeof item.name === "string" && typeof item.locationId === "string") {
        result.push(item as Delta);
      }
```

- [ ] **Step 5: Document it in the Reactor system prompt**

In `src/lib/engine/reactor.ts` `buildReactorPrompt`, change the format-list header count from 10 to 11:

```ts
Delta JSON 格式（11 种，选用实际发生的）：
```

Add the format line immediately after the `establishLore` format line:

```ts
{"kind":"establishLore","id":"新设定id","keys":["会再次被提到的词","别名"],"content":"一句永久世界设定"}
{"kind":"establishCharacter","id":"新角色id","name":"角色名","role":"一句话身份/定位","goal":"(可选)当前目标","locationId":"<locations中的id>"}
```

Add a guidance paragraph immediately after the existing `establishLore` guidance paragraph (the one beginning "当某个**重要且持久的世界事实**"):

```ts
当剧情中出现一个**此前不存在、且会持续存在或重要的人物**时,用 establishCharacter 把他/她确立为世界的一部分(locationId 填其所在地点)——这是**世界细化出它自己的一部分,不是从外部引入**。只在确有新人物且值得持久时使用;一次性的、无名的过场路人不要确立。
```

- [ ] **Step 6: Run tests + full suite**

Run: `npx vitest run src/lib/engine/__tests__/reactor.test.ts && npm test`
Expected: the new tests PASS; full suite green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/engine/reactor.ts src/lib/engine/__tests__/reactor.test.ts
git commit -m "feat(engine): Reactor can propose establishCharacter (world details a new person)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Integration — genesis primitive end-to-end

**Files:**
- Test: `src/lib/engine/__tests__/genesis.test.ts` (create)

**Interfaces:**
- Consumes: `parseDeltas` (Task 3), `validateDelta`/`applyDelta` (Task 2), `presentCharacters` (Task 1).
- Produces: nothing new — this task proves the layers compose.

- [ ] **Step 1: Write the integration test**

Create `src/lib/engine/__tests__/genesis.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseDeltas } from "../reactor";
import { validateDelta, applyDelta } from "../../world/delta";
import { presentCharacters } from "../prompt";
import { DEMO_SEED } from "../../world/seed-demo";
import type { WorldState } from "../../types";

describe("entity genesis primitive (compose)", () => {
  it("a reactor-proposed establishCharacter becomes a present, persistent character", () => {
    const llmText =
      '[{"kind":"establishCharacter","id":"c-stranger","name":"陌生人","role":"角落里一直坐着的人","locationId":"bar"}]';
    const deltas = parseDeltas(llmText);
    expect(deltas).toHaveLength(1);

    let state: WorldState = DEMO_SEED.openingState;
    for (const d of deltas) {
      const v = validateDelta(state, DEMO_SEED.rules, d);
      expect(v.ok).toBe(true);
      if (v.ok) state = applyDelta(state, d);
    }

    // present in the bar scene through the unchanged lookup
    const present = presentCharacters(DEMO_SEED, state);
    expect(present.map((c) => c.id)).toContain("c-stranger");
    const stranger = present.find((c) => c.id === "c-stranger")!;
    expect(stranger.name).toBe("陌生人");
    expect(stranger.detail).toBe("stub");

    // persisted instance-privately (NOT in the frozen seed) + in roster
    expect(state.characters?.["c-stranger"]).toBeDefined();
    expect(DEMO_SEED.characters.find((c) => c.id === "c-stranger")).toBeUndefined();
    expect(state.roster["c-stranger"]).toEqual({ name: "陌生人" });
  });

  it("rejects establishCharacter colliding with a seed character id", () => {
    const v = validateDelta(DEMO_SEED.openingState, DEMO_SEED.rules, {
      kind: "establishCharacter",
      id: "c-lan",
      name: "假兰",
      locationId: "bar",
    });
    expect(v.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `npx vitest run src/lib/engine/__tests__/genesis.test.ts`
Expected: PASS (both cases).

- [ ] **Step 3: Full suite + typecheck (final gate)**

Run: `npm run typecheck && npm test`
Expected: typecheck clean; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/engine/__tests__/genesis.test.ts
git commit -m "test(engine): end-to-end genesis primitive — reactor → validate → apply → present

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage (vs `docs/entity-genesis-design.md`):**
- "instance-private `WorldState.characters`; `presentCharacters` merges seed ∪ state" → Task 1. ✓
- "`establishCharacter` = 11th delta; payload `{id,name,role,goal?,locationId}`, `detail:"stub"`" → Task 2. ✓
- "Reactor can propose it (reactive crystallization)" → Task 3. ✓
- "identity stable; never delete; seed frozen" → enforced by Task 2 (writes to `state.characters`, never `seed`) + Task 4's seed-immutability assertion. ✓
- **Out of scope for Plan 1 (Plan 2):** Director-as-caster (active-agent cap + proactive surfacing + world-consistent narration), lazy flesh-out on first speak (`detail:"stub" → "fleshed"`), killing `introductionBeat`, `stub→fleshed` for locations/objects. The `Character.detail` field is added here and *written* as `"stub"`; it is first *read* in Plan 2.

**Placeholder scan:** none — every code/step is concrete.

**Type consistency:** `establishCharacter` payload `{id,name,role?,goal?,locationId}` is identical across the union (Task 2), the parse branch (Task 3), and all tests. `state.characters?` / `Character.detail?` introduced in Task 1 are consumed unchanged in Tasks 2–4.

## Next: Plan 2 (write after Plan 1 lands)

Director-as-caster, against the real code Plan 1 produces: per-turn active-agent designation (`maxActiveAgents` in `engine/config.ts`; gate the intent loop in `turn.ts`), proactive surfacing decision in `director.ts` (when/who/how, tension as input), world-consistent generated narration replacing `introduce.ts`'s `introductionBeat`, and lazy flesh-out (`detail:"stub" → "fleshed"`) on first activation.
