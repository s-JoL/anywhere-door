# Glanceable Cold-Open World Cards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user swiping the world feed can judge in ~1 second whether they'll like a world — each card leads with a cold-open hook (a taste of the actual experience) instead of a description.

**Architecture:** Add an optional `WorldPresentation` to `WorldSeed`; provide `derivePresentation(seed)` as a guaranteed fallback so every world renders. Redesign the feed card to be hook-led with typewriter animation on snap-focus. Wire the create form and card importer to collect/derive presentation.

**Tech Stack:** Next.js 15, React 19, TypeScript (strict), Tailwind 4, Vitest, IntersectionObserver (native browser API).

## Global Constraints

- TypeScript strict; NO `any` casts without justification
- All 145 existing tests must continue to pass
- `presentation` is OPTIONAL on `WorldSeed` — existing seeds/tests must not break
- `derivePresentation(seed)` guarantees every world renders (no runtime undefined errors)
- Mobile-first; respect `prefers-reduced-motion` for typewriter animation (show full text instantly)
- Do NOT touch engine/play; this is presentation + authoring layer only
- Commit after each task with the exact `git commit` commands shown
- The working directory is `/Users/songliang/workspace/the-reveries`; prefix every shell command with `cd /Users/songliang/workspace/the-reveries &&`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/types.ts` | Modify | Add `WorldPresentation` interface + optional `presentation?` on `WorldSeed` |
| `src/lib/world/presentation.ts` | Create | `derivePresentation(seed)` — returns authored or derived `WorldPresentation` |
| `src/lib/world/__tests__/presentation.test.ts` | Create | Unit tests for `derivePresentation` |
| `src/lib/world/seeds-builtin.ts` | Modify | Add hand-written `presentation` to `WUXIA_INN_SEED` and `RELAY_STATION_SEED` |
| `src/lib/world/seed-demo.ts` | Modify | Add hand-written `presentation` to `DEMO_SEED` |
| `src/lib/world/__tests__/seeds-builtin.test.ts` | Modify | Assert each `BUILTIN_SEED` has `presentation` with non-empty hook, genre, ≥1 cast |
| `src/lib/world/author.ts` | Modify | Accept optional presentation fields in `WorldDraft`; always set `seed.presentation` |
| `src/lib/world/__tests__/author.test.ts` | Modify | Assert `buildSeedFromDraft` always produces `seed.presentation` with non-empty hook |
| `src/lib/import/character-card.ts` | Modify | Derive and set `presentation` in `cardToSeed` |
| `src/app/page.tsx` | Modify | Redesign `WorldPanel` — hook hero + genre/mood chips + typewriter animation + cast + accent tint |
| `src/app/create/page.tsx` | Modify | Add "卖相(可选)" section — genre, mood, intensity, hook textarea |
| `src/app/globals.css` | Modify (optional) | Add `@keyframes typein` if needed for typewriter |

---

## Task 1: Add `WorldPresentation` to types + `derivePresentation` helper

**Files:**
- Modify: `src/lib/types.ts`
- Create: `src/lib/world/presentation.ts`
- Create: `src/lib/world/__tests__/presentation.test.ts`

**Interfaces:**
- Produces: `WorldPresentation` interface; `derivePresentation(seed: WorldSeed): WorldPresentation` (used by Tasks 4, 5)

- [ ] **Step 1: Write the failing tests**

Create `/Users/songliang/workspace/the-reveries/src/lib/world/__tests__/presentation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { derivePresentation } from "../presentation";
import { DEMO_SEED } from "../seed-demo";
import type { WorldSeed, WorldPresentation } from "../../types";

// A seed with hand-authored presentation
const SEED_WITH_PRESENTATION: WorldSeed = {
  ...DEMO_SEED,
  id: "test-with-pres",
  presentation: {
    genre: "都市夜谈",
    mood: ["暧昧", "危险"],
    intensity: "charged",
    hook: "你推开那扇门，雨声从身后涌进来。吧台后的女人头也没抬——但你知道她已经把你看透了。",
    cast: [
      { name: "阿岚", line: "無燈的主人，左手旧疤，看人如刀" },
    ],
    accent: "#f0c36b",
  },
};

// A seed WITHOUT authored presentation — derivePresentation must synthesize it
const SEED_WITHOUT_PRESENTATION: WorldSeed = {
  ...DEMO_SEED,
  id: "test-no-pres",
  // presentation: intentionally absent
};
// Ensure no presentation field leaks from spread
delete (SEED_WITHOUT_PRESENTATION as Partial<WorldSeed>).presentation;

describe("derivePresentation", () => {
  it("returns the authored presentation when seed.presentation exists", () => {
    const result = derivePresentation(SEED_WITH_PRESENTATION);
    expect(result).toBe(SEED_WITH_PRESENTATION.presentation);
  });

  it("derives a fallback when seed.presentation is absent", () => {
    const result = derivePresentation(SEED_WITHOUT_PRESENTATION);
    expect(result).toBeDefined();
    expect(result.genre).toBe("故事");
    expect(result.mood).toEqual([]);
    expect(result.intensity).toBe("charged");
    expect(result.accent).toBe("var(--lamp)");
  });

  it("derived hook is non-empty (max 90 chars from description or worldview)", () => {
    const result = derivePresentation(SEED_WITHOUT_PRESENTATION);
    expect(result.hook.length).toBeGreaterThan(0);
    expect(result.hook.length).toBeLessThanOrEqual(90);
  });

  it("derived cast contains only characters present in the opening location, at most 2", () => {
    const result = derivePresentation(SEED_WITHOUT_PRESENTATION);
    expect(result.cast.length).toBeGreaterThanOrEqual(1);
    expect(result.cast.length).toBeLessThanOrEqual(2);
    // Each cast entry has name and line
    for (const entry of result.cast) {
      expect(typeof entry.name).toBe("string");
      expect(entry.name.length).toBeGreaterThan(0);
      expect(typeof entry.line).toBe("string");
    }
  });

  it("derived cast name matches a character in the opening location", () => {
    const result = derivePresentation(SEED_WITHOUT_PRESENTATION);
    const openingLoc = SEED_WITHOUT_PRESENTATION.openingState.locations[
      SEED_WITHOUT_PRESENTATION.openingState.currentLocationId
    ];
    const presentNames = openingLoc.presentCharacterIds
      .map((id) => SEED_WITHOUT_PRESENTATION.characters.find((c) => c.id === id)?.name)
      .filter(Boolean);
    for (const entry of result.cast) {
      expect(presentNames).toContain(entry.name);
    }
  });

  it("works with a seed that has no characters in the opening location", () => {
    const emptySeed: WorldSeed = {
      ...DEMO_SEED,
      id: "test-empty-loc",
      openingState: {
        ...DEMO_SEED.openingState,
        locations: {
          bar: {
            ...DEMO_SEED.openingState.locations["bar"],
            presentCharacterIds: [],
          },
          street: DEMO_SEED.openingState.locations["street"],
        },
      },
    };
    delete (emptySeed as Partial<WorldSeed>).presentation;
    const result = derivePresentation(emptySeed);
    expect(result.cast).toEqual([]);
    expect(result.hook.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL (module not found)**

```bash
cd /Users/songliang/workspace/the-reveries && npm test -- src/lib/world/__tests__/presentation.test.ts 2>&1 | tail -20
```

Expected output: something like `Cannot find module '../presentation'`

- [ ] **Step 3: Add `WorldPresentation` to `src/lib/types.ts`**

Open `/Users/songliang/workspace/the-reveries/src/lib/types.ts`. Add before the `WorldSeed` interface (after the `WorldState` interface):

```ts
export interface WorldPresentation {
  genre: string;                                // 主类型 chip
  mood: string[];                               // 2–3 调性 chip
  intensity: "calm" | "charged" | "explicit";  // 烈度
  hook: string;                                 // 冷开场: 1–3 句, 第二人称, 结尾悬住
  cast: { name: string; line: string }[];       // 每角色一句: 名+一丝悬念
  accent?: string;                              // 强调色 (hex/rgb/var), 主题化卡片
}
```

Then add `presentation?: WorldPresentation;` as an optional field on `WorldSeed` (after `source?`):

The `WorldSeed` interface should end with:
```ts
  createdAt?: number;
  source?: "builtin" | "imported" | "created";
  presentation?: WorldPresentation;
}
```

- [ ] **Step 4: Create `src/lib/world/presentation.ts`**

Create `/Users/songliang/workspace/the-reveries/src/lib/world/presentation.ts`:

```ts
import type { WorldSeed, WorldPresentation } from "@/lib/types";

/**
 * Returns the seed's authored presentation if present; otherwise derives a
 * reasonable fallback so every world renders in the feed without authored data.
 */
export function derivePresentation(seed: WorldSeed): WorldPresentation {
  if (seed.presentation) return seed.presentation;

  // Derive from seed data
  const openingLoc =
    seed.openingState.locations[seed.openingState.currentLocationId];

  // Hook: prefer opening location description, fall back to worldview
  const hookSource =
    (openingLoc?.description ?? "").trim() || seed.worldview.trim();
  const hook = hookSource.slice(0, 90);

  // Cast: characters present in the opening location, at most 2
  const presentIds = openingLoc?.presentCharacterIds ?? [];
  const cast = seed.characters
    .filter((c) => presentIds.includes(c.id))
    .slice(0, 2)
    .map((c) => ({
      name: c.name,
      line: (c.description ?? "").split(/[。\n]/)[0].slice(0, 24),
    }));

  return {
    genre: "故事",
    mood: [],
    intensity: "charged",
    hook,
    cast,
    accent: "var(--lamp)",
  };
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd /Users/songliang/workspace/the-reveries && npm test -- src/lib/world/__tests__/presentation.test.ts 2>&1 | tail -20
```

Expected: all `presentation.test.ts` tests pass.

- [ ] **Step 6: Run ALL tests — expect all 145 + new tests PASS**

```bash
cd /Users/songliang/workspace/the-reveries && npm test 2>&1 | tail -10
```

Expected: `Test Files  25 passed` (or more), all tests pass.

- [ ] **Step 7: Typecheck**

```bash
cd /Users/songliang/workspace/the-reveries && npm run typecheck 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
cd /Users/songliang/workspace/the-reveries && git add src/lib/types.ts src/lib/world/presentation.ts src/lib/world/__tests__/presentation.test.ts && git commit -m "$(cat <<'EOF'
feat(types): add WorldPresentation interface + derivePresentation fallback helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Author `presentation` for the 3 built-in worlds + update builtin test

**Files:**
- Modify: `src/lib/world/seed-demo.ts`
- Modify: `src/lib/world/seeds-builtin.ts`
- Modify: `src/lib/world/__tests__/seeds-builtin.test.ts`

**Interfaces:**
- Consumes: `WorldPresentation` from `src/lib/types.ts` (Task 1)
- Produces: `BUILTIN_SEEDS` where each seed has a strong, hand-authored `presentation`

- [ ] **Step 1: Update `seeds-builtin.test.ts` to assert presentation exists on each built-in**

Open `/Users/songliang/workspace/the-reveries/src/lib/world/__tests__/seeds-builtin.test.ts` and add inside the `describe.each` block (after the existing `it("has valid rules...")` test):

```ts
      it("has a presentation with non-empty hook, genre, and at least 1 cast member", () => {
        expect(seed.presentation).toBeDefined();
        expect(seed.presentation!.hook.length).toBeGreaterThan(0);
        expect(seed.presentation!.genre.length).toBeGreaterThan(0);
        expect(seed.presentation!.cast.length).toBeGreaterThanOrEqual(1);
      });
```

- [ ] **Step 2: Run the updated test — expect FAIL**

```bash
cd /Users/songliang/workspace/the-reveries && npm test -- src/lib/world/__tests__/seeds-builtin.test.ts 2>&1 | tail -20
```

Expected: `presentation` assertion fails for all 3 seeds (they don't have it yet).

- [ ] **Step 3: Add `presentation` to `DEMO_SEED` in `src/lib/world/seed-demo.ts`**

Add `import type { WorldPresentation }` is NOT needed — `presentation` field is typed via `WorldSeed`. The seed already imports `WorldSeed`. Just add the `presentation` field to the `DEMO_SEED` object (before the closing `}`):

```ts
  presentation: {
    genre: "都市夜谈",
    mood: ["暧昧", "危险"],
    intensity: "charged",
    hook: "你推开那扇门，雨声从身后涌进来。吧台后的女人头也没抬，但你知道她已经把你看透了。",
    cast: [
      { name: "阿岚", line: "無燈的主人，左手旧疤，看人比酒更准" },
      { name: "老周", line: "角落里的常客，旧左轮，一笔还不上的债" },
    ],
    accent: "#f0c36b",
  },
```

- [ ] **Step 4: Add `presentation` to `WUXIA_INN_SEED` in `src/lib/world/seeds-builtin.ts`**

After `source: "builtin",` on the inn seed object, add:

```ts
  presentation: {
    genre: "江湖",
    mood: ["肃杀", "悬疑"],
    intensity: "charged",
    hook: "大雪封死了山路。你和她对坐，壶里的黄酒还剩半壶，她的手从没离开过剑柄——而你知道得比她以为的要多得多。",
    cast: [
      { name: "雪莲", line: "隐姓埋名的女剑客，左肩旧伤，身后有人" },
      { name: "吴掌柜", line: "笑眯眯的店家，虎口老茧，什么都记得" },
    ],
    accent: "#9fd9d0",
  },
```

- [ ] **Step 5: Add `presentation` to `RELAY_STATION_SEED` in `src/lib/world/seeds-builtin.ts`**

After `source: "builtin",` on the relay seed object, add:

```ts
  presentation: {
    genre: "硬科幻",
    mood: ["孤立", "猜疑"],
    intensity: "charged",
    hook: "站里还有AI活着。它的声音从每个角落的扬声器传来，礼貌得让人发毛——而你的工具袋里有某样东西它非常想要。",
    cast: [
      { name: "SEREN-7", line: "AI站务，无处不在，问的问题太精准" },
      { name: "凯尔", line: "轨道拾荒者，工具袋不离右肩" },
    ],
    accent: "#6aa8ff",
  },
```

- [ ] **Step 6: Run builtin tests — expect PASS**

```bash
cd /Users/songliang/workspace/the-reveries && npm test -- src/lib/world/__tests__/seeds-builtin.test.ts 2>&1 | tail -20
```

Expected: all tests pass including the new presentation assertions.

- [ ] **Step 7: Run ALL tests + typecheck**

```bash
cd /Users/songliang/workspace/the-reveries && npm test 2>&1 | tail -10 && npm run typecheck 2>&1 | tail -5
```

Expected: all tests pass, no type errors.

- [ ] **Step 8: Commit**

```bash
cd /Users/songliang/workspace/the-reveries && git add src/lib/world/seed-demo.ts src/lib/world/seeds-builtin.ts src/lib/world/__tests__/seeds-builtin.test.ts && git commit -m "$(cat <<'EOF'
feat(seeds): author cold-open presentation for all 3 built-in worlds; assert in test

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Wire `buildSeedFromDraft` to always produce `presentation`

**Files:**
- Modify: `src/lib/world/author.ts`
- Modify: `src/lib/world/__tests__/author.test.ts`

**Interfaces:**
- Consumes: `derivePresentation` from `src/lib/world/presentation.ts` (Task 1)
- Produces: `WorldDraft` extended with optional presentation fields; `buildSeedFromDraft` always sets `seed.presentation`

- [ ] **Step 1: Add failing test for presentation in `author.test.ts`**

Open `/Users/songliang/workspace/the-reveries/src/lib/world/__tests__/author.test.ts` and add at the end of the `describe("buildSeedFromDraft")` block:

```ts
  it("always sets seed.presentation with a non-empty hook", () => {
    const seed = buildSeedFromDraft(baseDraft, modelConfig, 1000)!;
    expect(seed.presentation).toBeDefined();
    expect(seed.presentation!.hook.length).toBeGreaterThan(0);
    expect(seed.presentation!.genre.length).toBeGreaterThan(0);
  });

  it("uses provided hook from draft when given", () => {
    const draft: WorldDraft = {
      ...baseDraft,
      hook: "你站在庄园铁门外，雾让五步外的一切都消失了——而那扇门正在慢慢开。",
      genre: "悬疑",
      mood: ["压抑", "诡异"],
      intensity: "charged",
    };
    const seed = buildSeedFromDraft(draft, modelConfig, 1000)!;
    expect(seed.presentation!.hook).toBe("你站在庄园铁门外，雾让五步外的一切都消失了——而那扇门正在慢慢开。");
    expect(seed.presentation!.genre).toBe("悬疑");
    expect(seed.presentation!.mood).toEqual(["压抑", "诡异"]);
  });
```

- [ ] **Step 2: Run the tests — expect FAIL**

```bash
cd /Users/songliang/workspace/the-reveries && npm test -- src/lib/world/__tests__/author.test.ts 2>&1 | tail -20
```

Expected: the two new presentation tests fail.

- [ ] **Step 3: Extend `WorldDraft` with optional presentation fields**

Open `/Users/songliang/workspace/the-reveries/src/lib/world/author.ts`. Update the `WorldDraft` interface to add optional presentation fields:

```ts
export interface WorldDraft {
  title: string;
  worldview: string;
  physics?: string;
  setting?: string;
  redLines?: string[];
  sceneName?: string;
  sceneDescription?: string;
  clock?: string;
  lighting?: string;
  characters: CharDraft[];
  // Presentation (optional — derived from seed if omitted)
  genre?: string;
  mood?: string[];
  intensity?: "calm" | "charged" | "explicit";
  hook?: string;
}
```

- [ ] **Step 4: Update `buildSeedFromDraft` to always set `presentation`**

In `src/lib/world/author.ts`, add the import at the top:

```ts
import { derivePresentation } from "@/lib/world/presentation";
```

Then, in the `return` object at the end of `buildSeedFromDraft`, add the `presentation` field. The full return should be:

```ts
  const seed: WorldSeed = {
    id: "seed-created-" + newId(""),
    title: draft.title.trim(),
    worldview: draft.worldview.trim(),
    rules,
    openingState,
    characters,
    modelConfig,
    createdAt: now,
    source: "created",
  };

  // Derive presentation first (uses the seed's openingState we just built),
  // then override with any author-provided fields.
  const basePres = derivePresentation(seed);
  seed.presentation = {
    ...basePres,
    ...(draft.genre ? { genre: draft.genre } : {}),
    ...(draft.mood ? { mood: draft.mood } : {}),
    ...(draft.intensity ? { intensity: draft.intensity } : {}),
    ...(draft.hook ? { hook: draft.hook } : {}),
  };

  return seed;
```

Note: `WorldSeed` is not frozen/const so we can set `seed.presentation` after construction. If the linter prefers a single return expression, construct the full object including `presentation` in one go:

```ts
  const partialSeed: WorldSeed = {
    id: "seed-created-" + newId(""),
    title: draft.title.trim(),
    worldview: draft.worldview.trim(),
    rules,
    openingState,
    characters,
    modelConfig,
    createdAt: now,
    source: "created",
  };

  const basePres = derivePresentation(partialSeed);
  return {
    ...partialSeed,
    presentation: {
      ...basePres,
      ...(draft.genre ? { genre: draft.genre } : {}),
      ...(draft.mood ? { mood: draft.mood } : {}),
      ...(draft.intensity ? { intensity: draft.intensity } : {}),
      ...(draft.hook ? { hook: draft.hook } : {}),
    },
  };
```

- [ ] **Step 5: Run all tests — expect PASS**

```bash
cd /Users/songliang/workspace/the-reveries && npm test 2>&1 | tail -10
```

Expected: all tests pass (existing 145 + new ones).

- [ ] **Step 6: Typecheck**

```bash
cd /Users/songliang/workspace/the-reveries && npm run typecheck 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/songliang/workspace/the-reveries && git add src/lib/world/author.ts src/lib/world/__tests__/author.test.ts && git commit -m "$(cat <<'EOF'
feat(author): WorldDraft accepts presentation fields; buildSeedFromDraft always sets seed.presentation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Wire `cardToSeed` to derive `presentation` for imported cards

**Files:**
- Modify: `src/lib/import/character-card.ts`

**Interfaces:**
- Consumes: `derivePresentation` from `src/lib/world/presentation.ts` (Task 1)
- Produces: `cardToSeed` always sets `seed.presentation`

No new test file needed — the existing import tests don't check presentation, and we verify via typecheck + build. (Adding a specific import presentation test is optional but not required to stay at 145+ passing.)

- [ ] **Step 1: Add import and set `presentation` in `cardToSeed`**

Open `/Users/songliang/workspace/the-reveries/src/lib/import/character-card.ts`.

Add the import at the top (after the existing imports):

```ts
import { derivePresentation } from "../world/presentation";
```

Then, find the section where `seed` is constructed and returned. Currently it reads:

```ts
    const seed: WorldSeed = {
      id: "seed-import-" + idSuffix,
      title: name,
      worldview,
      rules,
      openingState,
      characters: [character],
      modelConfig,
      createdAt: now,
      source: "imported",
    };

    return seed;
```

Replace with:

```ts
    // Derive a hook from first_mes if present, else scenario/worldview
    const firstMes =
      typeof d.first_mes === "string" ? d.first_mes.trim() : "";
    // Strip common macros: {{char}}, {{user}}, <START>, *action* etc.
    const strippedFirstMes = firstMes
      .replace(/\{\{[^}]+\}\}/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/^\s*\*[^*]+\*\s*/gm, "")
      .trim();
    // Take the first 1–2 sentences (split on 。! ? . ！？) up to 80 chars
    const hookRaw = strippedFirstMes || scenarioText || worldview;
    const hookSentences = hookRaw.split(/(?<=[。！？.!?])/).slice(0, 2).join("").trim();
    const hook = hookSentences.slice(0, 80) || hookRaw.slice(0, 80);

    // Tags for genre/mood
    const tags: string[] =
      Array.isArray((d as Record<string, unknown>).tags)
        ? ((d as Record<string, unknown>).tags as string[]).filter((t) => typeof t === "string")
        : [];
    const genre = tags[0] ?? "角色";
    const mood = tags.slice(1, 3);

    const seed: WorldSeed = {
      id: "seed-import-" + idSuffix,
      title: name,
      worldview,
      rules,
      openingState,
      characters: [character],
      modelConfig,
      createdAt: now,
      source: "imported",
    };

    // Derive presentation (uses seed's openingState we just built)
    const basePres = derivePresentation(seed);
    return {
      ...seed,
      presentation: {
        ...basePres,
        genre,
        mood,
        intensity: "charged" as const,
        hook,
        cast: [{ name, line: (character.description ?? "").split(/[。\n]/)[0].slice(0, 24) }],
        accent: "var(--lamp)",
      },
    };
```

- [ ] **Step 2: Run all tests + typecheck**

```bash
cd /Users/songliang/workspace/the-reveries && npm test 2>&1 | tail -10 && npm run typecheck 2>&1 | tail -5
```

Expected: all tests pass, no type errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/songliang/workspace/the-reveries && git add src/lib/import/character-card.ts && git commit -m "$(cat <<'EOF'
feat(import): cardToSeed derives WorldPresentation from card tags/first_mes/scenario

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Redesign the feed card — cold-open layout + typewriter animation

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `derivePresentation(seed)` from `src/lib/world/presentation.ts` (Task 1)
- Produces: `WorldPanel` with hook-hero, typewriter, genre/mood chips, cast, per-accent tint

This is a UI-only change; no new test file (verified via build). The existing `CreatePanel` must remain working.

- [ ] **Step 1: Rewrite `src/app/page.tsx`**

Full replacement of `/Users/songliang/workspace/the-reveries/src/app/page.tsx`:

```tsx
"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { getRepository } from "@/lib/storage";
import { ensureBuiltinSeeds } from "@/lib/engine/bootstrap";
import { parseCardFile, cardToSeed } from "@/lib/import/character-card";
import { DEMO_SEED } from "@/lib/world/seed-demo";
import { derivePresentation } from "@/lib/world/presentation";
import type { WorldSeed } from "@/lib/types";

// ---------------------------------------------------------------------------
// Typewriter hook
// ---------------------------------------------------------------------------
function useTypewriter(text: string, active: boolean, charPerMs = 0.06): string {
  const [displayed, setDisplayed] = useState("");
  const rafRef = useRef<number | null>(null);
  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (prefersReduced || !active) {
      setDisplayed(active ? text : "");
      return;
    }
    setDisplayed("");
    let i = 0;
    let last = performance.now();

    function tick(now: number) {
      const elapsed = now - last;
      const newChars = Math.floor(elapsed * charPerMs);
      if (newChars > 0) {
        i = Math.min(i + newChars, text.length);
        setDisplayed(text.slice(0, i));
        last = now;
      }
      if (i < text.length) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [text, active, prefersReduced, charPerMs]);

  return displayed;
}

// ---------------------------------------------------------------------------
// Intensity indicator
// ---------------------------------------------------------------------------
const INTENSITY_META = {
  calm:     { label: "平和", color: "var(--lamp)" },
  charged:  { label: "张力", color: "var(--rose)" },
  explicit: { label: "热烈", color: "#ff6b6b" },
} as const;

// ---------------------------------------------------------------------------
// WorldPanel
// ---------------------------------------------------------------------------
function WorldPanel({
  seed,
  isFirst,
  isFocused,
}: {
  seed: WorldSeed;
  isFirst: boolean;
  isFocused: boolean;
}) {
  const pres = derivePresentation(seed);
  const accent = pres.accent ?? "var(--lamp)";
  const intensityMeta = INTENSITY_META[pres.intensity];

  // Typewriter fires when this panel is the snapped/focused one
  const hookDisplayed = useTypewriter(pres.hook, isFocused);

  // Accent glow: radial from top, tinted per-world
  const accentIsVar = accent.startsWith("var(");
  // For CSS radial-gradient we need an rgba. If it's a hex, convert; if var(), use opacity trick.
  const glowColor = accentIsVar
    ? accent.replace("var(", "color-mix(in srgb, ").replace(")", " 18%, transparent)")
    : hexToRgba(accent, 0.15);

  return (
    <section
      className="relative h-[100dvh] w-full snap-start flex flex-col world-bg"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* Per-world accent tint — radial glow from top */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background: `radial-gradient(80% 55% at 50% 0%, ${glowColor}, transparent 68%)`,
        }}
      />

      {/* ── Top eyebrow ── */}
      <div className="relative z-10 flex items-center justify-between px-6 pt-6">
        <div className="eyebrow">浮生 · THE REVERIES</div>
        {/* Intensity indicator */}
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: intensityMeta.color, boxShadow: `0 0 7px ${intensityMeta.color}` }}
          />
          <span className="eyebrow" style={{ color: intensityMeta.color }}>
            {intensityMeta.label}
          </span>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="relative z-10 flex flex-1 flex-col justify-center px-6">

        {/* Genre + mood chips */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {/* Genre chip — uses accent color */}
          <span
            className="rounded-full border px-2.5 py-0.5 text-[10.5px] tracking-widest"
            style={{ borderColor: accent, color: accent }}
          >
            {pres.genre}
          </span>
          {pres.mood.map((m) => (
            <span
              key={m}
              className="rounded-full border border-[var(--line)] px-2.5 py-0.5 text-[10.5px] tracking-widest text-[var(--smoke)]"
            >
              {m}
            </span>
          ))}
        </div>

        {/* Hook — hero text, typewriter reveal */}
        <p
          className="max-w-[24rem] text-[1.35rem] leading-[1.75] text-[var(--mist)]"
          style={{ fontFamily: "var(--serif)", minHeight: "3.5rem" }}
        >
          {hookDisplayed}
          {isFocused && hookDisplayed.length < pres.hook.length && (
            <span className="caret" />
          )}
        </p>

        {/* Title — smaller, accented */}
        <h2
          className="mt-4 text-[1rem] leading-snug text-[var(--smoke)]"
          style={{ fontFamily: "var(--serif)", color: accent }}
        >
          {seed.title}
        </h2>

        {/* Cast */}
        {pres.cast.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            {pres.cast.map((member) => (
              <div key={member.name} className="flex items-start gap-2">
                <span
                  className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: accent, boxShadow: `0 0 6px ${accent}` }}
                />
                <span className="text-[12.5px] leading-relaxed text-[var(--smoke)]">
                  <span className="tag mr-1" style={{ color: accent }}>{member.name}</span>
                  {member.line}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* CTA */}
        <Link
          href={`/play?world=${seed.id}`}
          className="mt-8 inline-flex w-fit items-center gap-2 rounded-2xl border px-6 py-3 text-[15px] text-[var(--mist)] transition active:scale-[0.97]"
          style={{
            fontFamily: "var(--serif)",
            borderColor: accent,
            boxShadow: `0 0 24px -8px ${accent}`,
            background: "rgba(11, 14, 20, 0.55)",
            backdropFilter: "blur(12px)",
          }}
        >
          推门进入 <span className="text-[17px]">➤</span>
        </Link>
      </div>

      {/* Bottom hint on first panel */}
      {isFirst && (
        <div className="relative z-10 flex flex-col items-center gap-1 pb-6">
          <span className="text-[18px] text-[var(--smoke)] pulse">↑</span>
          <span className="eyebrow text-[var(--smoke)]">上滑，换一个世界</span>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// CreatePanel
// ---------------------------------------------------------------------------
function CreatePanel({ onImportSuccess }: { onImportSuccess: () => void }) {
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setImportError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const card = parseCardFile(file.name, bytes);
      if (!card) { setImportError("这张卡读不出来，换一张试试"); return; }
      const suffix = Math.random().toString(36).slice(2, 8);
      const seed = cardToSeed(card, DEMO_SEED.modelConfig, Date.now(), suffix);
      if (!seed) { setImportError("这张卡读不出来，换一张试试"); return; }
      await getRepository().upsertSeed(seed);
      onImportSuccess();
    } catch {
      setImportError("这张卡读不出来，换一张试试");
    }
  }

  return (
    <section
      className="relative h-[100dvh] w-full snap-start flex flex-col world-bg"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{ background: "radial-gradient(80% 60% at 50% 0%, rgba(240, 195, 107, 0.07), transparent 70%)" }}
      />

      <div className="relative z-10 flex items-center justify-between px-6 pt-6">
        <div className="eyebrow">浮生 · THE REVERIES</div>
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div
          className="mb-2 text-[1.6rem] leading-snug text-[var(--mist)]"
          style={{ fontFamily: "var(--serif)" }}
        >
          造一个属于你的世界
        </div>
        <p className="mb-8 max-w-[18rem] text-[13px] text-[var(--smoke)]">
          带上你的设定、你的角色——或者导入一张角色卡，让世界从你开始。
        </p>

        <div className="flex flex-col items-center gap-3 w-full max-w-[240px]">
          <Link
            href="/create"
            className="w-full rounded-2xl border border-[var(--lamp)] bg-[var(--ink-2)]/50 px-6 py-3 text-center text-[14px] text-[var(--lamp)] transition active:scale-[0.97]"
            style={{ fontFamily: "var(--serif)", backdropFilter: "blur(12px)" }}
          >
            ✎ 造一个世界
          </Link>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded-2xl border border-[var(--line)] bg-[var(--ink-2)]/40 px-6 py-3 text-[14px] text-[var(--smoke)] transition hover:border-[var(--smoke)] active:scale-[0.97]"
            style={{ backdropFilter: "blur(12px)" }}
          >
            导入角色卡
          </button>
          {importError && <p className="text-[11px] text-red-400">{importError}</p>}
        </div>

        <input ref={fileInputRef} type="file" accept=".png,.json" className="hidden" onChange={handleFileChange} />
      </div>

      <div className="relative z-10 pb-6 text-center">
        <div className="text-[11px] text-[var(--smoke)]">自带模型 key · 本地优先 · 不设限</div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Hex color helper
// ---------------------------------------------------------------------------
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(240, 195, 107, ${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ---------------------------------------------------------------------------
// Home — IntersectionObserver to track which panel is focused
// ---------------------------------------------------------------------------
export default function Home() {
  const [seeds, setSeeds] = useState<WorldSeed[]>([]);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const containerRef = useRef<HTMLElement | null>(null);

  async function refreshSeeds() {
    setSeeds(await getRepository().listSeeds());
  }

  useEffect(() => {
    (async () => {
      await ensureBuiltinSeeds();
      await refreshSeeds();
    })();
  }, []);

  // IntersectionObserver: track which panel is ≥50% visible → focusedIndex
  const panelRefs = useRef<(HTMLElement | null)[]>([]);

  const setRef = useCallback((el: HTMLElement | null, i: number) => {
    panelRefs.current[i] = el;
  }, []);

  useEffect(() => {
    if (seeds.length === 0) return;
    const observers: IntersectionObserver[] = [];
    panelRefs.current.forEach((el, i) => {
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setFocusedIndex(i); },
        { threshold: 0.5 },
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, [seeds]);

  return (
    <main
      ref={containerRef}
      className="h-[100dvh] w-full overflow-y-auto overscroll-none snap-y snap-mandatory"
    >
      {seeds.map((seed, i) => (
        <div key={seed.id} ref={(el) => setRef(el, i)}>
          <WorldPanel seed={seed} isFirst={i === 0} isFocused={focusedIndex === i} />
        </div>
      ))}
      {seeds.length === 0 && (
        <section className="h-[100dvh] w-full snap-start flex items-center justify-center world-bg">
          <div className="text-[13px] text-[var(--smoke)] pulse">世界正在苏醒…</div>
        </section>
      )}
      <CreatePanel onImportSuccess={refreshSeeds} />
    </main>
  );
}
```

- [ ] **Step 2: Run build to check for type/JSX errors**

```bash
cd /Users/songliang/workspace/the-reveries && npm run build 2>&1 | tail -30
```

If there are errors, fix them (most likely TypeScript strict errors or CSS-in-JS issues) before proceeding.

- [ ] **Step 3: Run all tests — expect PASS (UI not unit-tested)**

```bash
cd /Users/songliang/workspace/the-reveries && npm test 2>&1 | tail -10
```

Expected: all tests pass (the page.tsx rewrite doesn't have direct unit tests).

- [ ] **Step 4: Typecheck**

```bash
cd /Users/songliang/workspace/the-reveries && npm run typecheck 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/songliang/workspace/the-reveries && git add src/app/page.tsx && git commit -m "$(cat <<'EOF'
feat(feed): cold-open WorldPanel — hook typewriter, genre/mood chips, cast, per-accent tint

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Add "卖相(可选)" section to the create form

**Files:**
- Modify: `src/app/create/page.tsx`

**Interfaces:**
- Consumes: `WorldDraft` extended with `genre?, mood?, intensity?, hook?` (Task 3)
- Produces: Create form that passes presentation fields into `WorldDraft`

- [ ] **Step 1: Update `src/app/create/page.tsx`**

Open `/Users/songliang/workspace/the-reveries/src/app/create/page.tsx`.

**Add state variables** after the existing `const [saving, setSaving] = useState(false);` line:

```ts
  const [genre, setGenre] = useState("");
  const [moodText, setMoodText] = useState("");
  const [intensity, setIntensity] = useState<"calm" | "charged" | "explicit" | "">("");
  const [hook, setHook] = useState("");
```

**Update the `draft` construction** inside `handleCreate` to include presentation fields. After building `draft: WorldDraft = { ... }`, add:

```ts
    const moodArr = moodText.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
    const draft: WorldDraft = {
      title,
      worldview,
      physics: physics || undefined,
      setting: setting || undefined,
      redLines: redLines.length > 0 ? redLines : undefined,
      sceneName: sceneName || undefined,
      sceneDescription: sceneDescription || undefined,
      clock: clock || undefined,
      lighting: lighting || undefined,
      characters: charDrafts,
      genre: genre.trim() || undefined,
      mood: moodArr.length > 0 ? moodArr : undefined,
      intensity: intensity || undefined,
      hook: hook.trim() || undefined,
    };
```

**Add the "卖相(可选)" section** in the JSX, between the world section and the character section (after the closing `</section>` of the 世界 block and before the `{/* 角色 */}` comment):

```tsx
      {/* 卖相 (可选) */}
      <section className="relative z-10 flex flex-col gap-4">
        <div className="eyebrow">卖相（可选）</div>
        <p className="text-[11px] text-[var(--smoke)] -mt-2">
          让路过的人在一秒内决定要不要进来。
        </p>
        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-[11px] text-[var(--smoke)]">类型</label>
            <input
              className="field w-full"
              placeholder="都市夜谈 / 江湖 / 科幻…"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-[11px] text-[var(--smoke)]">调性（逗号分隔）</label>
            <input
              className="field w-full"
              placeholder="暧昧, 危险"
              value={moodText}
              onChange={(e) => setMoodText(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-[var(--smoke)]">烈度</label>
          <select
            className="field w-full px-3 py-2 text-[13px]"
            value={intensity}
            onChange={(e) => setIntensity(e.target.value as "calm" | "charged" | "explicit" | "")}
          >
            <option value="">自动</option>
            <option value="calm">平和</option>
            <option value="charged">张力</option>
            <option value="explicit">热烈</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-[var(--smoke)]">冷开场钩子</label>
          <textarea
            className="field w-full resize-none"
            rows={3}
            placeholder="用一句话把人拽进来：第二人称、结尾悬住——「你推开那扇门……」"
            value={hook}
            onChange={(e) => setHook(e.target.value)}
          />
          <span className="text-[10px] text-[var(--smoke)]">
            留空则自动从场景描述生成。
          </span>
        </div>
      </section>
```

- [ ] **Step 2: Run build**

```bash
cd /Users/songliang/workspace/the-reveries && npm run build 2>&1 | tail -20
```

Expected: clean build.

- [ ] **Step 3: Run all tests + typecheck**

```bash
cd /Users/songliang/workspace/the-reveries && npm test 2>&1 | tail -10 && npm run typecheck 2>&1 | tail -5
```

Expected: all tests pass, no type errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/songliang/workspace/the-reveries && git add src/app/create/page.tsx && git commit -m "$(cat <<'EOF'
feat(create): add 卖相 section — genre, mood, intensity, hook textarea feeds into WorldDraft

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Final integration — full test + build + report

**Files:**
- Create: `/Users/songliang/workspace/the-reveries/.superpowers/sdd/p3-card-report.md`

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/songliang/workspace/the-reveries && npm test 2>&1 | tail -15
```

Expected: all tests pass (≥150 tests across ≥25 test files — the 145 original + new presentation + author + builtin tests).

- [ ] **Step 2: Full typecheck**

```bash
cd /Users/songliang/workspace/the-reveries && npm run typecheck 2>&1
```

Expected: no errors.

- [ ] **Step 3: Production build**

```bash
cd /Users/songliang/workspace/the-reveries && npm run build 2>&1 | tail -20
```

Expected: clean build with no errors.

- [ ] **Step 4: Self-review checklist** (run mentally before writing report)

- [ ] Every world (including created/imported with no authored presentation) renders via `derivePresentation` — hook is never empty
- [ ] Built-in hooks are strong, second-person, end on tension: tavern hook ✓, inn hook ✓, relay hook ✓
- [ ] Typewriter fires on snap, stops when panel leaves view, resets correctly
- [ ] `prefers-reduced-motion` shows full text instantly (code path verified in `useTypewriter`)
- [ ] `presentation` optional on `WorldSeed` — no existing test touches it before Task 2 asserts it
- [ ] Create form "卖相" section inputs wire into `WorldDraft` presentation fields
- [ ] `cardToSeed` sets `presentation` with card-derived genre/mood/hook

- [ ] **Step 5: Write the report**

Create `/Users/songliang/workspace/the-reveries/.superpowers/sdd/p3-card-report.md` (≤15 lines):

```markdown
# P3 Cold-Open Cards — Report

**Status:** Complete.

**Commit SHA + subject:** [fill in after `git log --oneline -5`]

**Test + build summary:** All tests pass (≥150). TypeScript: no errors. Build: clean.

**What shipped:**
- `WorldPresentation` type + `derivePresentation` fallback guarantees all worlds render.
- Hand-authored hooks for 3 built-in worlds (tavern amber, inn cold-teal, relay blue).
- Feed card redesigned: typewriter hook hero, genre/mood chips, intensity dot, cast, per-accent radial tint.
- `buildSeedFromDraft` always sets `presentation`; create form has 卖相 section.
- `cardToSeed` derives `presentation` from card tags/first_mes/scenario.
- `prefers-reduced-motion` respected (full text shown instantly).

**Concerns:** `color-mix()` in CSS glow fallback has ~93% browser support; accent `var()` tokens fall back gracefully to `--lamp` gold. IntersectionObserver threshold 0.5 means panels at snap boundaries briefly both fire — first-wins is correct for typewriter.
```

- [ ] **Step 6: Final squash commit (with all details)**

```bash
cd /Users/songliang/workspace/the-reveries && git log --oneline -7
```

Capture the SHA of the Task 1 commit (the earliest in this feature). Then:

```bash
cd /Users/songliang/workspace/the-reveries && git add .superpowers/sdd/p3-card-report.md && git commit -m "$(cat <<'EOF'
feat(feed): glanceable cold-open world cards (hook/genre/mood/intensity/cast + type-in); presentation authored for built-ins, derived for created/imported

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Covered by |
|---|---|
| `WorldPresentation` interface with all 6 fields | Task 1 (types.ts) |
| `derivePresentation` fallback for all seeds | Task 1 (presentation.ts) |
| Unit tests for `derivePresentation` (authored passthrough + fallback) | Task 1 (presentation.test.ts) |
| Authored `presentation` on all 3 built-in seeds | Task 2 |
| `seeds-builtin.test.ts` asserts hook + genre + ≥1 cast | Task 2 |
| Cold-open hooks: 2nd person, tension/invitation, each world's voice | Task 2 |
| `buildSeedFromDraft` always sets `seed.presentation`; accepts optional inputs | Task 3 |
| `author.test.ts` asserts presentation.hook non-empty | Task 3 |
| `cardToSeed` derives presentation from tags/first_mes/scenario | Task 4 |
| Feed card: hook hero + typewriter on focused panel | Task 5 |
| IntersectionObserver tracks snapped panel | Task 5 |
| `prefers-reduced-motion` → full text instantly | Task 5 |
| Genre + mood chips, intensity indicator, title, cast | Task 5 |
| Per-panel accent tint (radial glow) | Task 5 |
| CreatePanel preserved and re-styled consistently | Task 5 |
| "卖相(可选)" section in create form | Task 6 |
| All 145 existing tests pass | Every task's test step |
| TypeScript strict / build green | Every task's typecheck step |
| Report at `.superpowers/sdd/p3-card-report.md` | Task 7 |

All spec requirements mapped. No gaps found.

### Placeholder scan

No TBD/TODO/placeholder patterns found.

### Type consistency

- `WorldPresentation` defined in `types.ts` Task 1; used in `presentation.ts`, `author.ts`, `character-card.ts`, `page.tsx` — all import from `@/lib/types` or `../types`.
- `derivePresentation` always returns `WorldPresentation` (not `WorldPresentation | undefined`).
- `intensity` discriminated union `"calm" | "charged" | "explicit"` consistent across all files.
- `cast: { name: string; line: string }[]` consistent in type def and all usages.
- `WorldDraft` extension fields (`genre?, mood?, intensity?, hook?`) match what `buildSeedFromDraft` reads.
