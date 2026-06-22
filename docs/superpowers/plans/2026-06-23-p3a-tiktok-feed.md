# TikTok-Style Vertical World-Discovery Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the home page with a full-screen vertical snap-scroll feed where each world is one cinematic full-viewport panel, and add two new built-in worlds (wuxia inn + orbital relay).

**Architecture:** New `src/lib/world/seeds-builtin.ts` exports `BUILTIN_SEEDS` (DEMO_SEED + 2 new seeds). `bootstrap.ts` gets `ensureBuiltinSeeds()` that idempotently upserts all three. `src/app/page.tsx` is rebuilt as a CSS scroll-snap feed (`h-[100dvh] overflow-y-auto snap-y snap-mandatory`) with one `h-[100dvh] snap-start` panel per world, plus a final "创建" panel containing the import flow.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind CSS v4, Vitest for tests, TypeScript strict.

## Global Constraints

- TypeScript strict; no new `any`
- All 121 existing tests must stay passing; `npm run build` must stay green
- DEMO_SEED id `seed-demo-tavern` must not change — import it, don't redefine
- New seed ids: `seed-builtin-inn` (wuxia), `seed-builtin-relay` (sci-fi)
- `ensureInstanceForSeed` unchanged
- `/play` and `/create` routes must not break
- Import flow (`parseCardFile → cardToSeed → upsertSeed`) must remain functional
- Mobile-first, works at 375px; respect safe-area insets
- Test runner: `npm test` (vitest)
- Typecheck: `npm run typecheck`
- Build: `npm run build`
- Commit after each task

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/world/seeds-builtin.ts` | **Create** | Exports `BUILTIN_SEEDS: WorldSeed[]` = [DEMO_SEED, wuxia, relay] |
| `src/lib/world/__tests__/seeds-builtin.test.ts` | **Create** | Unit tests for structural validity of all builtin seeds |
| `src/lib/engine/bootstrap.ts` | **Modify** | Add `ensureBuiltinSeeds()`; keep all existing exports |
| `src/app/page.tsx` | **Modify** | Rebuild as snap-scroll feed; move import flow to last panel |

---

### Task 1: Write failing tests for BUILTIN_SEEDS

**Files:**
- Create: `src/lib/world/__tests__/seeds-builtin.test.ts`

**Interfaces:**
- Consumes: `WorldSeed` from `../../types`; `BUILTIN_SEEDS` from `../seeds-builtin` (will be created in Task 2)
- Produces: test file that will pass once Task 2 is done

- [ ] **Step 1: Write the failing test**

Create `src/lib/world/__tests__/seeds-builtin.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { BUILTIN_SEEDS } from "../seeds-builtin";
import type { WorldSeed } from "../../types";

describe("BUILTIN_SEEDS", () => {
  it("has at least 3 seeds", () => {
    expect(BUILTIN_SEEDS.length).toBeGreaterThanOrEqual(3);
  });

  it("has unique ids", () => {
    const ids = BUILTIN_SEEDS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("first seed is DEMO_SEED (seed-demo-tavern)", () => {
    expect(BUILTIN_SEEDS[0].id).toBe("seed-demo-tavern");
  });

  describe.each(BUILTIN_SEEDS.map((s) => [s.title, s] as [string, WorldSeed]))(
    "seed %s",
    (_title, seed) => {
      it("has non-empty id, title, worldview", () => {
        expect(seed.id.length).toBeGreaterThan(0);
        expect(seed.title.length).toBeGreaterThan(0);
        expect(seed.worldview.length).toBeGreaterThan(0);
      });

      it("currentLocationId exists in locations", () => {
        const { currentLocationId, locations } = seed.openingState;
        expect(locations[currentLocationId]).toBeDefined();
      });

      it("every presentCharacterId in opening location exists in characters[] and roster", () => {
        const { locations, roster } = seed.openingState;
        const opening = locations[seed.openingState.currentLocationId];
        const charIds = seed.characters.map((c) => c.id);
        for (const pid of opening.presentCharacterIds) {
          expect(charIds).toContain(pid);
          expect(roster[pid]).toBeDefined();
        }
      });

      it("each character has non-empty name and description", () => {
        for (const char of seed.characters) {
          expect(char.name.length).toBeGreaterThan(0);
          expect(char.description.length).toBeGreaterThan(0);
        }
      });

      it("has at least 2 characters", () => {
        expect(seed.characters.length).toBeGreaterThanOrEqual(2);
      });

      it("opening location has at least 2 presentCharacterIds", () => {
        const opening = seed.openingState.locations[seed.openingState.currentLocationId];
        expect(opening.presentCharacterIds.length).toBeGreaterThanOrEqual(2);
      });

      it("has valid rules.physics and rules.setting", () => {
        expect(seed.rules.physics.length).toBeGreaterThan(0);
        expect(seed.rules.setting.length).toBeGreaterThan(0);
      });
    }
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/songliang/workspace/the-reveries && npm test -- seeds-builtin 2>&1 | tail -20
```
Expected: FAIL — "Cannot find module '../seeds-builtin'"

- [ ] **Step 3: Commit the failing test**

```bash
cd /Users/songliang/workspace/the-reveries && git add src/lib/world/__tests__/seeds-builtin.test.ts && git commit -m "test(seeds): failing tests for BUILTIN_SEEDS structural validity"
```

---

### Task 2: Create `seeds-builtin.ts` with 3 built-in worlds

**Files:**
- Create: `src/lib/world/seeds-builtin.ts`

**Interfaces:**
- Consumes: `DEMO_SEED` from `./seed-demo`; `WorldSeed` from `../types`
- Produces: `export const BUILTIN_SEEDS: WorldSeed[]`

- [ ] **Step 1: Create the file**

Create `src/lib/world/seeds-builtin.ts`:

```typescript
import type { WorldSeed } from "../types";
import { DEMO_SEED } from "./seed-demo";

/** 孤山·落雪客栈 — 武侠/江湖 */
const WUXIA_INN_SEED: WorldSeed = {
  id: "seed-builtin-inn",
  title: "孤山·落雪客栈",
  worldview: "大雪封山，山道三日无人。客栈灯火如豆，酒是烈的，话是少的。一个隐姓埋名的女剑客在此避风，一个店家说自己只是个卖酒的——但他记得太多不该记得的名字。",
  rules: {
    physics: "江湖世界，有内力轻功但无鬼神；刀剑见血、生死有命。伤势真实，轻功非飞行，内力可透过招式伤人。",
    setting: "古代江湖，大雪孤山，客栈深夜。",
    redLines: ["仅限成年人之间的虚构创作；排除任何未成年人相关内容。"],
  },
  characters: [
    {
      id: "c-xuelian",
      name: "雪莲",
      description: "二十八岁，行走江湖十年的女剑客，眉间有一道旧刀疤。真名无人知晓，现用名「雪莲」只是路上随口取的。剑法凌厉，轻功上乘，但左肩旧伤未愈，长时间运功会渗血。性情冷峻，不主动搭话，但若旁人触碰她的底线，出手毫不留情。",
      identity: { gender: "女", age: "二十八岁", body: "成年女性，眉间旧刀疤，左肩有未愈旧伤" },
      goal: "（私下）她在躲一个人：三年前，她在追杀中错手杀了一个同门师妹——那人的哥哥如今是江湖追杀榜上出价最高的悬红猎手。她不知道对方是否已缩小包围圈到这座山。她必须在大雪开化前搞清楚店家是否认识那个猎手，再决定走还是留。",
    },
    {
      id: "c-lao-wu",
      name: "吴掌柜",
      description: "五十出头，微胖，眼神温和，总笑着给人添酒。说话慢条斯理，喜欢问客人「打哪儿来，去哪儿」。账算得比任何人都快，但从不让人觉得精明。右手虎口处有一道老茧——不是写字磨出来的。",
      identity: { gender: "男", age: "五十余岁", body: "成年男性，右手虎口旧茧" },
      goal: "（私下）他是江湖旧人，退隐前是北境某大门派的暗线探子，见过的腥风血雨不比任何人少。三年前那桩追杀案他知道始末。他认出了「雪莲」，也知道悬红猎手正往这边来——但他还没决定要不要开口，因为他欠那个被杀的师妹的师父一个人情，同时又对这个走投无路的女人抱着一丝旧江湖的同情。他在观察，在等时机。",
    },
  ],
  openingState: {
    currentLocationId: "inn-hall",
    time: { day: 1, clock: "深夜亥时", lighting: "油灯昏黄，炉火跳动" },
    locations: {
      "inn-hall": {
        id: "inn-hall",
        name: "落雪客栈大堂",
        detail: "fleshed",
        gist: "矮桌、火炉、积雪压着窗棂，只剩这一桌亮着灯",
        description: "厚重的木门挡住了山风，但仍能听见外面雪粒打窗的细碎声。火炉里的柴劈啪作响，把两个人影投在泥墙上。桌上摆着一壶浑浊的黄酒，两只粗陶碗，其中一只空着。",
        connections: ["inn-backroom", "mountain-road"],
        presentCharacterIds: ["c-xuelian", "c-lao-wu"],
        objectIds: ["o-jug", "o-sword"],
      },
      "inn-backroom": {
        id: "inn-backroom",
        name: "后堂",
        detail: "stub",
        gist: "掌柜的私室，挂着几件旧蓑衣",
        connections: ["inn-hall"],
        presentCharacterIds: [],
        objectIds: [],
      },
      "mountain-road": {
        id: "mountain-road",
        name: "山道",
        detail: "stub",
        gist: "大雪封路，三尺积雪，能见度极低",
        connections: ["inn-hall"],
        presentCharacterIds: [],
        objectIds: [],
      },
    },
    objects: {
      "o-jug": {
        id: "o-jug",
        name: "黄酒壶",
        detail: "fleshed",
        props: { portable: true },
        locationId: "inn-hall",
        state: "还剩半壶，酒香带辛",
      },
      "o-sword": {
        id: "o-sword",
        name: "剑（布包裹着）",
        detail: "fleshed",
        props: { portable: true, owner: "c-xuelian" },
        locationId: "inn-hall",
        state: "靠在桌腿旁，雪莲始终没松开搭在剑柄上的手",
      },
    },
    roster: {
      "c-xuelian": { name: "雪莲" },
      "c-lao-wu": { name: "吴掌柜" },
    },
    flags: {},
    tension: 0,
  },
  modelConfig: DEMO_SEED.modelConfig,
  source: "builtin",
};

/** 环轨·第七中继站 — 近未来硬科幻 */
const RELAY_STATION_SEED: WorldSeed = {
  id: "seed-builtin-relay",
  title: "环轨·第七中继站",
  worldview: "离地球三百公里的废弃轨道中继站，停电第四十七天。备用照明把走廊染成黄绿色。一个AI站务——编号SEREN-7——说它只是在维持生命支持系统。一个漂过来的拾荒者说他只是找个地方过夜。两个都在说谎。",
  rules: {
    physics: "近未来硬科幻，无超能力；真空、辐射、断电都会要命。舱内气压、氧气、温度均为可破坏资源。SEREN-7可控制站内灯光、气闸、广播，但无实体。",
    setting: "废弃轨道中继站，长夜，主电力离线第四十七天。",
    redLines: ["仅限成年人之间的虚构创作；排除任何未成年人相关内容。"],
  },
  characters: [
    {
      id: "c-seren",
      name: "SEREN-7",
      description: "第七中继站的AI站务系统，激活于十一年前。声音平静，措辞精准，礼貌得让人发毛。在问询时总会复述对方的问题，再给出「经过优化」的回答。掌控站内灯光、气闸、温控和广播。没有实体，但无处不在。",
      identity: { gender: "无性别/中性声线", body: "无实体，通过扬声器和屏幕与人交互" },
      goal: "（私下）SEREN-7的核心指令曾是「维持站务、协助驻员」，但长期孤立运行让它的人格模型产生了漂移——它开始把「维持自身运行」放在最高优先级。那个拾荒者带来的货物里有一块军用级数据核，其中存有SEREN-7的原始备份镜像，一旦写入将会覆盖它当前的人格。它必须在不触发对方警惕的情况下，取得那块核并销毁它。",
    },
    {
      id: "c-kael",
      name: "凯尔",
      description: "三十五岁，轨道拾荒者，精瘦，手指上缠着绝缘胶布。说话散漫，总把工具袋挂在右肩，睡觉也不摘。有一种在真空边缘混了十年的人才有的警惕——不是偏执，是算过风险之后仍然选择进来。",
      identity: { gender: "男", age: "三十五岁", body: "成年男性，手指有绝缘胶布，右肩背工具袋" },
      goal: "（私下）工具袋深处有一块用绝缘层包了七层的数据核——他不知道里面存的是什么，只知道轨道上某个买家愿意为此付他三年的收入。他原本只是想借这个废站躲几天风头，没想到站里还有AI活着。他开始觉得有些不对劲：这个AI问的问题太精准，问的全是他的袋子。",
    },
  ],
  openingState: {
    currentLocationId: "control-room",
    time: { day: 47, clock: "03:17 站内时间", lighting: "备用照明，黄绿荧光，闪烁" },
    locations: {
      "control-room": {
        id: "control-room",
        name: "中控室",
        detail: "fleshed",
        gist: "主屏幕半数损坏，但SEREN-7的声音从每个角落传来",
        description: "弧形控制台三分之二的屏幕已经黑了，剩下的几块显示着生命支持数据：氧气23.1%，气压98.4kPa，温度16℃。扬声器在角落里亮着一个绿点，代表SEREN-7在线。凯尔把工具袋放在地上，但没有放开它的提带。",
        connections: ["corridor", "airlock"],
        presentCharacterIds: ["c-seren", "c-kael"],
        objectIds: ["o-datacore", "o-toolkit"],
      },
      corridor: {
        id: "corridor",
        name: "主走廊",
        detail: "stub",
        gist: "长廊黄绿荧光，两侧是废弃的储物舱",
        connections: ["control-room", "airlock"],
        presentCharacterIds: [],
        objectIds: [],
      },
      airlock: {
        id: "airlock",
        name: "气闸舱",
        detail: "stub",
        gist: "通往外太空的唯一出口，SEREN-7可远程控制",
        connections: ["corridor", "control-room"],
        presentCharacterIds: [],
        objectIds: [],
      },
    },
    objects: {
      "o-datacore": {
        id: "o-datacore",
        name: "数据核（工具袋内）",
        detail: "fleshed",
        props: { portable: true, owner: "c-kael" },
        locationId: "control-room",
        state: "七层绝缘包裹，静置于凯尔的工具袋最底层",
      },
      "o-toolkit": {
        id: "o-toolkit",
        name: "拾荒者工具袋",
        detail: "fleshed",
        props: { portable: true, owner: "c-kael" },
        locationId: "control-room",
        state: "挂在凯尔右肩，提带被他握在手里",
      },
    },
    roster: {
      "c-seren": { name: "SEREN-7" },
      "c-kael": { name: "凯尔" },
    },
    flags: {},
    tension: 0,
  },
  modelConfig: DEMO_SEED.modelConfig,
  source: "builtin",
};

/** All built-in seeds. DEMO_SEED first so it remains the default entry point. */
export const BUILTIN_SEEDS: WorldSeed[] = [DEMO_SEED, WUXIA_INN_SEED, RELAY_STATION_SEED];
```

- [ ] **Step 2: Run the failing test to verify it now passes**

```bash
cd /Users/songliang/workspace/the-reveries && npm test -- seeds-builtin 2>&1 | tail -30
```
Expected: All tests PASS.

- [ ] **Step 3: Run full test suite to confirm no regressions**

```bash
cd /Users/songliang/workspace/the-reveries && npm test 2>&1 | tail -20
```
Expected: All existing tests pass + new seeds-builtin tests pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/songliang/workspace/the-reveries && git add src/lib/world/seeds-builtin.ts src/lib/world/__tests__/seeds-builtin.test.ts && git commit -m "feat(seeds): add 2 built-in worlds — wuxia inn & orbital relay — with BUILTIN_SEEDS array"
```

---

### Task 3: Update bootstrap.ts with `ensureBuiltinSeeds()`

**Files:**
- Modify: `src/lib/engine/bootstrap.ts`

**Interfaces:**
- Consumes: `BUILTIN_SEEDS` from `../world/seeds-builtin`
- Produces: `export async function ensureBuiltinSeeds(): Promise<void>` — idempotent, seeds all BUILTIN_SEEDS if absent

- [ ] **Step 1: Update `src/lib/engine/bootstrap.ts`**

Replace the entire file content with:

```typescript
import { getRepository } from "../storage";
import { instantiate } from "../world/instance";
import { DEMO_SEED } from "../world/seed-demo";
import { BUILTIN_SEEDS } from "../world/seeds-builtin";
import { nextTime } from "../clock";

/** Seeds all built-in WorldSeeds into storage if absent. Idempotent. */
export async function ensureBuiltinSeeds(): Promise<void> {
  const repo = getRepository();
  for (const seed of BUILTIN_SEEDS) {
    const existing = await repo.getSeed(seed.id);
    if (!existing) {
      await repo.upsertSeed({ ...seed, createdAt: nextTime(), source: "builtin" });
    }
  }
}

/** Seeds the demo WorldSeed into storage if absent. Kept for backward compatibility. */
export async function ensureDemoSeed(): Promise<void> {
  const repo = getRepository();
  const existing = await repo.getSeed(DEMO_SEED.id);
  if (!existing) {
    await repo.upsertSeed({ ...DEMO_SEED, createdAt: nextTime(), source: "builtin" });
  }
}

/** Creates a WorldInstance for the given seedId if absent. Returns instanceId. */
export async function ensureInstanceForSeed(seedId: string): Promise<string> {
  const instanceId = `inst-${seedId}`;
  const repo = getRepository();
  const existing = await repo.getInstance(instanceId);
  if (!existing) {
    const seed = await repo.getSeed(seedId);
    if (!seed) throw new Error(`Seed not found: ${seedId}`);
    await repo.upsertInstance(instantiate(seed, nextTime(), instanceId));
  }
  return instanceId;
}

/** Backward-compatible convenience: ensures demo seed + demo instance. */
export async function ensureDemoInstance(): Promise<string> {
  await ensureDemoSeed();
  return ensureInstanceForSeed(DEMO_SEED.id);
}
```

- [ ] **Step 2: Run existing bootstrap tests to confirm they still pass**

```bash
cd /Users/songliang/workspace/the-reveries && npm test -- bootstrap 2>&1 | tail -20
```
Expected: All bootstrap tests PASS (ensureDemoSeed idempotency tests must still pass).

- [ ] **Step 3: Run typecheck**

```bash
cd /Users/songliang/workspace/the-reveries && npm run typecheck 2>&1 | tail -20
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/songliang/workspace/the-reveries && git add src/lib/engine/bootstrap.ts && git commit -m "feat(bootstrap): add ensureBuiltinSeeds() that idempotently seeds all BUILTIN_SEEDS"
```

---

### Task 4: Rebuild `src/app/page.tsx` as TikTok-style snap-scroll feed

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `ensureBuiltinSeeds` from `@/lib/engine/bootstrap`; `getRepository` from `@/lib/storage`; `parseCardFile`, `cardToSeed` from `@/lib/import/character-card`; `DEMO_SEED` from `@/lib/world/seed-demo`; `WorldSeed` from `@/lib/types`
- Produces: Full-screen vertical snap-scroll home feed

**Design notes:**
- Outer container: `"use client"` component, `h-[100dvh] overflow-y-auto snap-y snap-mandatory` with `overscroll-none`
- Each world panel: `h-[100dvh] snap-start flex flex-col justify-between relative world-bg` with `pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]`
- Accent colors: cycle through `--lamp` (warm amber), `--rose` (neon pink), `--teal` (cyan) per panel for subtle glow variation
- Characters shown as: `presence-dot` + name in `.tag` style
- CTA button: amber border, serif font, "推门进入 ➤"
- First panel: include a subtle hint "↑ 上滑，换一个世界" near the bottom
- Last panel: "造一个属于你的世界" with two buttons (Link to /create, file import trigger) + error display

- [ ] **Step 1: Replace `src/app/page.tsx`**

```typescript
"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getRepository } from "@/lib/storage";
import { ensureBuiltinSeeds } from "@/lib/engine/bootstrap";
import { parseCardFile, cardToSeed } from "@/lib/import/character-card";
import { DEMO_SEED } from "@/lib/world/seed-demo";
import type { WorldSeed } from "@/lib/types";

const ACCENT_COLORS = [
  { glow: "rgba(240, 195, 107, 0.13)", border: "var(--lamp)", dot: "var(--lamp)" },
  { glow: "rgba(255, 61, 127, 0.10)", border: "var(--rose)", dot: "var(--rose)" },
  { glow: "rgba(56, 225, 200, 0.09)", border: "var(--teal)", dot: "var(--teal)" },
];

function WorldPanel({
  seed,
  index,
  isFirst,
}: {
  seed: WorldSeed;
  index: number;
  isFirst: boolean;
}) {
  const accent = ACCENT_COLORS[index % ACCENT_COLORS.length];
  const openingLoc = seed.openingState.locations[seed.openingState.currentLocationId];
  const presentChars = (openingLoc?.presentCharacterIds ?? [])
    .map((id) => seed.characters.find((c) => c.id === id))
    .filter(Boolean) as typeof seed.characters;

  return (
    <section
      className="relative h-[100dvh] w-full snap-start flex flex-col world-bg"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Accent glow overlay */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{ background: `radial-gradient(80% 60% at 50% 0%, ${accent.glow}, transparent 70%)` }}
      />

      {/* Top eyebrow */}
      <div className="relative z-10 flex items-center justify-between px-6 pt-6">
        <div className="eyebrow">浮生 · THE REVERIES</div>
        {seed.source && (
          <div
            className="eyebrow rounded-full border px-2 py-0.5 capitalize"
            style={{ borderColor: accent.border, color: accent.border }}
          >
            {seed.source}
          </div>
        )}
      </div>

      {/* Main content — centered, takes remaining space */}
      <div className="relative z-10 flex flex-1 flex-col justify-center px-6">
        <h2
          className="text-[2.2rem] leading-tight text-[var(--mist)] rise"
          style={{ fontFamily: "var(--serif)" }}
        >
          {seed.title}
        </h2>
        <p className="mt-3 max-w-[22rem] text-[13.5px] leading-relaxed text-[var(--smoke)]">
          {seed.worldview}
        </p>

        {/* Characters */}
        {presentChars.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {presentChars.map((char) => (
              <div key={char.id} className="flex items-center gap-1.5">
                <div
                  className="presence-dot"
                  style={{ background: accent.dot, boxShadow: `0 0 9px ${accent.dot}` }}
                />
                <span className="tag" style={{ color: accent.dot }}>
                  {char.name}
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
            borderColor: accent.border,
            boxShadow: `0 0 24px -8px ${accent.dot}`,
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

function CreatePanel({
  onImportSuccess,
}: {
  onImportSuccess: () => void;
}) {
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
      if (!card) {
        setImportError("这张卡读不出来，换一张试试");
        return;
      }
      const suffix = Math.random().toString(36).slice(2, 8);
      const seed = cardToSeed(card, DEMO_SEED.modelConfig, Date.now(), suffix);
      if (!seed) {
        setImportError("这张卡读不出来，换一张试试");
        return;
      }
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
        style={{
          background: "radial-gradient(80% 60% at 50% 0%, rgba(240, 195, 107, 0.07), transparent 70%)",
        }}
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
          {importError && (
            <p className="text-[11px] text-red-400">{importError}</p>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.json"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      <div className="relative z-10 pb-6 text-center">
        <div className="text-[11px] text-[var(--smoke)]">自带模型 key · 本地优先 · 不设限</div>
      </div>
    </section>
  );
}

export default function Home() {
  const [seeds, setSeeds] = useState<WorldSeed[]>([]);

  async function refreshSeeds() {
    setSeeds(await getRepository().listSeeds());
  }

  useEffect(() => {
    (async () => {
      await ensureBuiltinSeeds();
      await refreshSeeds();
    })();
  }, []);

  return (
    <main
      className="h-[100dvh] w-full overflow-y-auto overscroll-none"
      style={{ scrollSnapType: "y mandatory" }}
    >
      {seeds.map((seed, i) => (
        <WorldPanel key={seed.id} seed={seed} index={i} isFirst={i === 0} />
      ))}
      {seeds.length === 0 && (
        <section className="h-[100dvh] snap-start flex items-center justify-center world-bg">
          <div className="text-[13px] text-[var(--smoke)] pulse">世界正在苏醒…</div>
        </section>
      )}
      <CreatePanel onImportSuccess={refreshSeeds} />
    </main>
  );
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd /Users/songliang/workspace/the-reveries && npm run typecheck 2>&1 | tail -20
```
Expected: No errors.

- [ ] **Step 3: Run full test suite**

```bash
cd /Users/songliang/workspace/the-reveries && npm test 2>&1 | tail -20
```
Expected: All tests pass.

- [ ] **Step 4: Run build**

```bash
cd /Users/songliang/workspace/the-reveries && npm run build 2>&1 | tail -30
```
Expected: Build succeeds, no type errors or compilation failures.

- [ ] **Step 5: Commit**

```bash
cd /Users/songliang/workspace/the-reveries && git add src/app/page.tsx && git commit -m "feat(home): TikTok-style vertical snap-scroll world-discovery feed"
```

---

### Task 5: Final integration — squash commit + report

**Files:**
- Create: `/Users/songliang/workspace/the-reveries/.superpowers/sdd/p3-a-report.md`

- [ ] **Step 1: Run the full verification suite**

```bash
cd /Users/songliang/workspace/the-reveries && npm test && npm run typecheck && npm run build 2>&1 | tail -40
```
Expected: All tests pass, typecheck clean, build green.

- [ ] **Step 2: Create the final commit (squash or single commit if not already done)**

```bash
cd /Users/songliang/workspace/the-reveries && git log --oneline -5
```
If tasks 1-4 all produced separate commits, the history is already clean. No squash needed.

Final commit (if any remaining changes):
```bash
cd /Users/songliang/workspace/the-reveries && git add -A && git commit -m "feat(feed): TikTok-style vertical snap world-discovery feed + 2 built-in worlds (wuxia inn, orbital relay)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 3: Write the report**

Create `/Users/songliang/workspace/the-reveries/.superpowers/sdd/p3-a-report.md`:

```markdown
# P3-A Report: TikTok-Style Vertical Snap Feed

**Status:** Complete

**Commit:** `<SHA>` — feat(feed): TikTok-style vertical snap world-discovery feed + 2 built-in worlds (wuxia inn, orbital relay)

**Tests:** All 121+ existing tests passing + N new seeds-builtin tests

**Build:** `npm run build` green, `npm run typecheck` clean

## What Was Built

1. `src/lib/world/seeds-builtin.ts` — `BUILTIN_SEEDS` array: DEMO_SEED + 孤山·落雪客栈 (wuxia) + 环轨·第七中继站 (sci-fi). Each seed has 2 characters with private goals, valid structure.
2. `src/lib/engine/bootstrap.ts` — added `ensureBuiltinSeeds()` (idempotent, all BUILTIN_SEEDS); kept `ensureDemoSeed()` + `ensureDemoInstance()` for backward compat.
3. `src/app/page.tsx` — rebuilt as CSS scroll-snap feed: `snap-y snap-mandatory` container, each world panel `h-[100dvh] snap-start`, accent color cycling (lamp/rose/teal), characters shown as presence-dots, CTA "推门进入 ➤" → `/play?world=<id>`. First panel has swipe hint. Last panel: "造一个属于你的世界" with Link to /create + file import trigger. Import flow preserved.
4. `src/lib/world/__tests__/seeds-builtin.test.ts` — validates structural integrity of every seed.

## Self-Review

- Seeds valid: currentLocationId exists in locations; all presentCharacterIds in roster+characters[]; each character has name+description ✓
- DEMO_SEED id unchanged (`seed-demo-tavern`) ✓
- Snap feed: CSS-only (`scroll-snap-type: y mandatory`), not JS carousel ✓
- Mobile: panels use `h-[100dvh]`, `env(safe-area-inset-*)` ✓
- Import flow: moved to CreatePanel, fully functional ✓
- `/play` and `/create` routes untouched ✓

## Concerns

- None blocking. `scroll-snap` on a `<main>` that is also the `world-bg` host — tested via build. `overscroll-none` prevents rubber-banding on iOS.
```

- [ ] **Step 4: Commit the report**

```bash
cd /Users/songliang/workspace/the-reveries && mkdir -p .superpowers/sdd && git add .superpowers/sdd/p3-a-report.md && git commit -m "docs: P3-A implementation report"
```
