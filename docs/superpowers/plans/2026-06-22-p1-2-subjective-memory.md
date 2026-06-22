# 浮生 / The Reveries — P1.2 Subjective Memory 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Builds directly on P1.1 (already merged on `main`).

**Goal:** 让角色**跨回合记住自己亲历的事**、且**只知道自己感知到的**——给每个角色一条主观记忆流（witness 作用域写入），用 recency×importance×关键词相关性检索出相关记忆，连同近段对话一起注入该角色的主观 prompt。以"另一个角色的秘密绝不出现在别人 prompt 里"作为隔离验证。

**Architecture:** 在 P1.1 的结构化世界 + 交互回合之上增加 S2 记忆层。记忆是每角色 append-only 的 `Memory`（借 Generative Agents 的 ConceptNode：文本 + importance + keywords + 时间戳）。回合结束时把"谁说了什么"作为**观察**写入**当前在场角色**的记忆流（不在场/被隔离者写不到 → 天然主观）。下一回合，发言角色按当前输入+场景检索 top-k 记忆注入 prompt。检索是纯函数；相关性用关键词重合近似（embedding 留到 P3，见 spec §6.3）。**反思/consolidation 不在本切片**。

**Tech Stack:** 沿用 P1.1 —— Next.js 15 · React 19 · TS strict · Dexie 4 · Vitest。

## Global Constraints

- **TypeScript strict**；ESM。
- **记忆是主观的**：观察只写入能感知它的角色（当前在场者）；不在场或被隔离的角色的记忆流绝不包含该事件。**秘密/私有目标永不进入他人记忆或 prompt。**
- **LLM 注入不变**：回合仍把 `LlmFn` 作为依赖注入；检索是纯函数（无网络、无 LLM）。importance 评分用**可注入的打分器**，默认廉价启发式（不强制 LLM 调用）。
- **检索打分**（照搬 spec §6.2 的 Generative Agents 公式）：三项各 min-max 归一到 [0,1] 后加权 `0.5·recency + 3·relevance + 2·importance`，取 top-k。relevance = 查询关键词与记忆关键词的重合度（近似）；recency = 按时序名次的 `decay^rank`。
- **不破坏 P1.1**：现有 27 个测试必须继续通过；对 `turn.ts`/`prompt.ts`/storage 的改动是增量的。
- **界面/旁白文案中文**；内容不设限（基线红线不变）。
- **本切片不做**：反思（importance 阈值合成）、向量 embedding、检索回写 lastAccessed（仅留接口/注释）。

---

### Task 1: Memory 类型 + 记忆存储

**Files:**
- Modify: `src/lib/types.ts`（新增 `Memory`）
- Modify: `src/lib/storage/dexie-db.ts`（v2 加 `memories` 表）
- Modify: `src/lib/storage/repository.ts`（接口加两个方法）
- Modify: `src/lib/storage/indexeddb-repository.ts`（实现）
- Test: `src/lib/storage/__tests__/memory-store.test.ts`

**Interfaces:**
- Consumes: P1.1 的 `Repository`、Dexie `ReveriesDB`、`resetRepository`
- Produces:
  - `interface Memory { id; charId; kind: "observation" | "reflection"; text; keywords: string[]; importance: number; createdAt; lastAccessed }`
  - `Repository.appendMemory(m: Memory): Promise<void>`
  - `Repository.listMemories(charId: string): Promise<Memory[]>`（按 createdAt 升序）

- [ ] **Step 1: 写失败测试**

`src/lib/storage/__tests__/memory-store.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { getRepository, resetRepository } from "../index";
import type { Memory } from "../../types";

function mem(id: string, charId: string, t: number): Memory {
  return { id, charId, kind: "observation", text: id, keywords: [], importance: 5, createdAt: t, lastAccessed: t };
}

describe("memory store", () => {
  beforeEach(() => { resetRepository(); indexedDB.deleteDatabase("the-reveries"); });

  it("appends and lists memories per character in createdAt order", async () => {
    const repo = getRepository();
    await repo.appendMemory(mem("b", "c1", 2));
    await repo.appendMemory(mem("a", "c1", 1));
    await repo.appendMemory(mem("x", "c2", 1));
    const c1 = await repo.listMemories("c1");
    expect(c1.map((m) => m.id)).toEqual(["a", "b"]);
    const c2 = await repo.listMemories("c2");
    expect(c2.map((m) => m.id)).toEqual(["x"]);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd /Users/songliang/workspace/the-reveries && npx vitest run src/lib/storage/__tests__/memory-store.test.ts`
Expected: FAIL（`appendMemory`/`listMemories`/`Memory` 不存在）。

- [ ] **Step 3: 加 `Memory` 类型**

在 `src/lib/types.ts` 末尾追加：
```ts
/** 每角色主观记忆（借 Generative Agents 的 ConceptNode；本切片不含反思 provenance）。 */
export interface Memory {
  id: string;
  charId: string;
  kind: "observation" | "reflection";
  text: string;
  keywords: string[];     // 写入时抽取，供关键词相关性近似
  importance: number;     // 1–10
  createdAt: number;
  lastAccessed: number;
}
```

- [ ] **Step 4: Dexie v2 加 `memories` 表**

`src/lib/storage/dexie-db.ts` —— 给 import 加上 `Memory`，给类加字段与 v2：
```ts
import Dexie, { type Table } from "dexie";
import type { WorldInstance, Message, Memory } from "../types";

export class ReveriesDB extends Dexie {
  instances!: Table<WorldInstance, string>;
  messages!: Table<Message, string>;
  memories!: Table<Memory, string>;
  constructor(name = "the-reveries") {
    super(name);
    this.version(1).stores({
      instances: "id, seedId, updatedAt",
      messages: "id, instanceId, createdAt",
    });
    this.version(2).stores({
      memories: "id, charId, createdAt",
    });
  }
}
```

- [ ] **Step 5: 接口 + 实现**

`src/lib/storage/repository.ts` —— 在 import 加 `Memory`，接口加两方法：
```ts
import type { WorldInstance, Message, Memory } from "../types";

export interface Repository {
  getInstance(id: string): Promise<WorldInstance | undefined>;
  upsertInstance(i: WorldInstance): Promise<void>;
  listMessages(instanceId: string): Promise<Message[]>;
  appendMessage(m: Message): Promise<void>;
  appendMemory(m: Memory): Promise<void>;
  listMemories(charId: string): Promise<Memory[]>;
}
```

`src/lib/storage/indexeddb-repository.ts` —— 在 import 加 `Memory`，类加两方法：
```ts
  async appendMemory(m: Memory) { await this.db.memories.put(m); }
  async listMemories(charId: string): Promise<Memory[]> {
    const rows = await this.db.memories.where("charId").equals(charId).toArray();
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  }
```

- [ ] **Step 6: 运行，确认通过 + 全套**

Run: `cd /Users/songliang/workspace/the-reveries && npx vitest run src/lib/storage/__tests__/memory-store.test.ts && npm test && npm run typecheck`
Expected: 新测试 PASS；全套（28+）PASS；typecheck 干净。

- [ ] **Step 7: 提交**

```bash
cd /Users/songliang/workspace/the-reveries && git add -A && git commit -m "feat(memory): Memory type + per-character memory store (Dexie v2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 关键词抽取 + 检索打分（纯函数，核心）

**Files:**
- Create: `src/lib/memory/keywords.ts`, `src/lib/memory/retrieve.ts`
- Test: `src/lib/memory/__tests__/keywords.test.ts`, `src/lib/memory/__tests__/retrieve.test.ts`

**Interfaces:**
- Consumes: `Memory`
- Produces:
  - `keywordsOf(text: string): string[]`（CJK 单字 + 拉丁词 len≥2，去停用词，去重）
  - `relevance(queryKw: string[], memKw: string[]): number`（交集大小）
  - `scoreMemories(memories: Memory[], queryKw: string[], opts?: { topK?: number; decay?: number }): Memory[]`（按 `0.5·recency + 3·relevance + 2·importance` 取 top-k，默认 topK=6、decay=0.95）

- [ ] **Step 1: 写 keywords 失败测试**

`src/lib/memory/__tests__/keywords.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { keywordsOf, relevance } from "../keywords";

describe("keywordsOf", () => {
  it("extracts CJK single chars and latin words, drops stopwords, dedups", () => {
    const kw = keywordsOf("我推门走进酒馆 the BAR");
    expect(kw).toContain("酒"); expect(kw).toContain("馆");
    expect(kw).toContain("the"); expect(kw).toContain("bar"); // lowercased
    expect(kw).not.toContain("我"); // stopword
    expect(new Set(kw).size).toBe(kw.length); // deduped
  });
});

describe("relevance", () => {
  it("counts shared features", () => {
    expect(relevance(["酒", "馆", "雨"], ["酒", "馆"])).toBe(2);
    expect(relevance(["雨"], ["酒"])).toBe(0);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd /Users/songliang/workspace/the-reveries && npx vitest run src/lib/memory/__tests__/keywords.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 keywords**

`src/lib/memory/keywords.ts`:
```ts
const STOPWORDS = new Set([
  "的","了","你","我","他","她","它","在","是","和","也","就","都","与","着","吗","呢","啊","把","被","会","要","有","这","那","个",
  "the","a","an","of","to","and","is","it","in","on","at","you","i",
]);

/** 近似分词：CJK 单字（关系/语义粒度够用）+ 拉丁词（len≥2），去停用词，去重。 */
export function keywordsOf(text: string): string[] {
  const runs = text.match(/[一-龥]+|[a-zA-Z0-9]{2,}/g) ?? [];
  const out: string[] = [];
  for (const run of runs) {
    if (/^[一-龥]+$/.test(run)) {
      for (const ch of run) out.push(ch);
    } else {
      out.push(run.toLowerCase());
    }
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const k of out) {
    if (STOPWORDS.has(k) || seen.has(k)) continue;
    seen.add(k);
    result.push(k);
  }
  return result;
}

/** 相关性近似 = 共享特征数。 */
export function relevance(queryKw: string[], memKw: string[]): number {
  const set = new Set(memKw);
  let n = 0;
  for (const k of queryKw) if (set.has(k)) n++;
  return n;
}
```

- [ ] **Step 4: 运行 keywords 测试，确认通过**

Run: `cd /Users/songliang/workspace/the-reveries && npx vitest run src/lib/memory/__tests__/keywords.test.ts`
Expected: PASS。

- [ ] **Step 5: 写 retrieve 失败测试**

`src/lib/memory/__tests__/retrieve.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { scoreMemories } from "../retrieve";
import { keywordsOf } from "../keywords";
import type { Memory } from "../../types";

function m(id: string, text: string, importance: number, createdAt: number): Memory {
  return { id, charId: "c1", kind: "observation", text, keywords: keywordsOf(text), importance, createdAt, lastAccessed: createdAt };
}

describe("scoreMemories", () => {
  const mems: Memory[] = [
    m("relevant_recent", "你在酒馆点了一杯威士忌", 6, 100),
    m("relevant_old", "酒馆里有人提到威士忌", 5, 1),
    m("irrelevant_recent", "窗外的雨下个不停", 4, 99),
    m("irrelevant_old", "码头停着一艘旧船", 3, 2),
  ];

  it("ranks a relevant+recent+important memory first", () => {
    const top = scoreMemories(mems, keywordsOf("再来一杯威士忌"), { topK: 4 });
    expect(top[0].id).toBe("relevant_recent");
  });

  it("respects topK", () => {
    const top = scoreMemories(mems, keywordsOf("威士忌"), { topK: 2 });
    expect(top.length).toBe(2);
    expect(top.map((x) => x.id)).toContain("relevant_recent");
  });

  it("returns [] for no memories", () => {
    expect(scoreMemories([], keywordsOf("任何"))).toEqual([]);
  });
});
```

- [ ] **Step 6: 运行，确认失败**

Run: `cd /Users/songliang/workspace/the-reveries && npx vitest run src/lib/memory/__tests__/retrieve.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 7: 实现 retrieve**

`src/lib/memory/retrieve.ts`:
```ts
import type { Memory } from "../types";
import { relevance } from "./keywords";

/** 把一组数值 min-max 归一到 [0,1]；全相等时返回 0.5（与 Generative Agents 一致）。 */
function normalize(values: number[]): number[] {
  const min = Math.min(...values), max = Math.max(...values);
  if (max === min) return values.map(() => 0.5);
  return values.map((v) => (v - min) / (max - min));
}

const W_RECENCY = 0.5, W_RELEVANCE = 3, W_IMPORTANCE = 2;

/**
 * 按 recency×relevance×importance 给记忆打分取 top-k。
 * recency：按 createdAt 降序的名次 i → decay^i（越新越大）。
 * relevance：查询关键词与记忆关键词的交集大小。
 * importance：记忆自带分值。
 * 三项各 min-max 归一后加权求和。纯函数，不修改输入（lastAccessed 回写留待后续切片）。
 */
export function scoreMemories(
  memories: Memory[],
  queryKw: string[],
  opts: { topK?: number; decay?: number } = {},
): Memory[] {
  if (memories.length === 0) return [];
  const topK = opts.topK ?? 6;
  const decay = opts.decay ?? 0.95;

  const byRecency = [...memories].sort((a, b) => b.createdAt - a.createdAt);
  const recencyById = new Map<string, number>();
  byRecency.forEach((mem, i) => recencyById.set(mem.id, Math.pow(decay, i)));

  const recency = normalize(memories.map((m) => recencyById.get(m.id)!));
  const relev = normalize(memories.map((m) => relevance(queryKw, m.keywords)));
  const importance = normalize(memories.map((m) => m.importance));

  const scored = memories.map((mem, i) => ({
    mem,
    score: W_RECENCY * recency[i] + W_RELEVANCE * relev[i] + W_IMPORTANCE * importance[i],
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map((s) => s.mem);
}
```

- [ ] **Step 8: 运行 retrieve 测试 + 全套**

Run: `cd /Users/songliang/workspace/the-reveries && npx vitest run src/lib/memory/__tests__/ && npm test && npm run typecheck`
Expected: 全 PASS；typecheck 干净。

- [ ] **Step 9: 提交**

```bash
cd /Users/songliang/workspace/the-reveries && git add -A && git commit -m "feat(memory): keyword extraction + recency/relevance/importance retrieval scoring

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: witness 作用域的观察写入

**Files:**
- Create: `src/lib/memory/observe.ts`
- Test: `src/lib/memory/__tests__/observe.test.ts`

**Interfaces:**
- Consumes: `WorldState`, `Memory`, `keywordsOf`, `newId`, `nextTime`
- Produces:
  - `type ImportanceFn = (text: string) => number`（默认 `defaultImportance`：含动作括号/感叹/较长 → 高，闲谈 → 低；钳制 1–10）
  - `buildObservations(state, utterance: { speakerName: string; text: string }, importanceFn?): Memory[]` —— 为**当前场景所有在场角色**各生成一条观察记忆（witness 作用域：只给在场者）

- [ ] **Step 1: 写失败测试**

`src/lib/memory/__tests__/observe.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildObservations, defaultImportance } from "../observe";
import type { WorldState } from "../../types";

function state(): WorldState {
  return {
    currentLocationId: "bar",
    time: { day: 1, clock: "深夜", lighting: "冷光" },
    locations: {
      bar: { id: "bar", name: "酒馆", detail: "fleshed", gist: "", connections: ["alley"], presentCharacterIds: ["c-lan", "c-zhou"], objectIds: [] },
      alley: { id: "alley", name: "后巷", detail: "stub", gist: "", connections: ["bar"], presentCharacterIds: ["c-mei"], objectIds: [] },
    },
    objects: {},
    roster: { "c-lan": { name: "阿岚" }, "c-zhou": { name: "老周" }, "c-mei": { name: "阿梅" } },
    flags: {},
  };
}

describe("buildObservations (witness-scoped)", () => {
  it("writes one observation per present character, and NOT to absent characters", () => {
    const obs = buildObservations(state(), { speakerName: "你", text: "我把枪放在吧台上" });
    const charIds = obs.map((m) => m.charId).sort();
    expect(charIds).toEqual(["c-lan", "c-zhou"]); // 在场二人
    expect(charIds).not.toContain("c-mei");        // 后巷的阿梅感知不到 → 主观隔离
    expect(obs[0].text).toContain("你");
    expect(obs[0].text).toContain("枪");
    expect(obs[0].keywords.length).toBeGreaterThan(0);
    expect(obs[0].importance).toBeGreaterThanOrEqual(1);
    expect(obs[0].importance).toBeLessThanOrEqual(10);
  });

  it("defaultImportance scores action/charged lines above idle chatter", () => {
    expect(defaultImportance("（拔出枪指着你）你敢动试试")).toBeGreaterThan(defaultImportance("嗯。"));
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd /Users/songliang/workspace/the-reveries && npx vitest run src/lib/memory/__tests__/observe.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 observe**

`src/lib/memory/observe.ts`:
```ts
import type { WorldState, Memory } from "../types";
import { keywordsOf } from "./keywords";
import { newId } from "../id";
import { nextTime } from "../clock";

export type ImportanceFn = (text: string) => number;

/** 廉价启发式 importance：动作括号/强标点/长度抬升分值；闲谈低。钳制 1–10。 */
export function defaultImportance(text: string): number {
  let s = 3;
  if (/[（(].*[)）]/.test(text)) s += 3;          // 含动作描写
  if (/[！!?？]/.test(text)) s += 1;               // 情绪标点
  if (text.length >= 30) s += 2; else if (text.length <= 4) s -= 2; // 篇幅
  return Math.max(1, Math.min(10, s));
}

/** 为当前场景的每个在场角色生成一条该发言的观察记忆（witness 作用域）。 */
export function buildObservations(
  state: WorldState,
  utterance: { speakerName: string; text: string },
  importanceFn: ImportanceFn = defaultImportance,
): Memory[] {
  const loc = state.locations[state.currentLocationId];
  if (!loc) return [];
  const text = `${utterance.speakerName}：${utterance.text}`;
  const keywords = keywordsOf(text);
  const importance = importanceFn(utterance.text);
  return loc.presentCharacterIds.map((charId) => {
    const t = nextTime();
    return { id: newId("mem"), charId, kind: "observation" as const, text, keywords, importance, createdAt: t, lastAccessed: t };
  });
}
```

- [ ] **Step 4: 运行，确认通过 + 全套**

Run: `cd /Users/songliang/workspace/the-reveries && npx vitest run src/lib/memory/__tests__/observe.test.ts && npm test && npm run typecheck`
Expected: 全 PASS。

- [ ] **Step 5: 提交**

```bash
cd /Users/songliang/workspace/the-reveries && git add -A && git commit -m "feat(memory): witness-scoped observation building + heuristic importance

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: demo 世界加入第二个角色 + 一个秘密

**Files:**
- Modify: `src/lib/world/seed-demo.ts`
- Modify: `src/lib/world/__tests__/instance.test.ts`（补一条断言）
- Test: 复用 `instance.test.ts`

**Interfaces:**
- Consumes / Produces: 同 P1.1 的 `DEMO_SEED`，新增第二个在场角色「老周」（带一个私有 `goal`/秘密），让隔离可被演示、世界更活。

- [ ] **Step 1: 在 instance.test.ts 增补失败断言**

在 `src/lib/world/__tests__/instance.test.ts` 的 describe 中**追加**一个用例：
```ts
  it("demo seed has two characters present in the opening location, each with a private goal", () => {
    const loc = DEMO_SEED.openingState.locations[DEMO_SEED.openingState.currentLocationId];
    expect(loc.presentCharacterIds).toContain("c-lan");
    expect(loc.presentCharacterIds).toContain("c-zhou");
    const zhou = DEMO_SEED.characters.find((c) => c.id === "c-zhou");
    expect(zhou?.goal && zhou.goal.length > 0).toBe(true);
  });
```

- [ ] **Step 2: 运行，确认新用例失败**

Run: `cd /Users/songliang/workspace/the-reveries && npx vitest run src/lib/world/__tests__/instance.test.ts`
Expected: 新用例 FAIL（目前只有 c-lan）。

- [ ] **Step 3: 给 DEMO_SEED 加第二个角色 + 秘密**

在 `src/lib/world/seed-demo.ts`：
- `characters` 数组里，在 阿岚 之后加入老周：
```ts
    { id: "c-zhou", name: "老周", description: "酒馆的常客，五十来岁，沉默寡言，总坐在角落擦一把旧左轮。退伍多年，欠着城南赌坊一笔钱。", identity: { gender: "男", body: "成年男性，右手有枪茧" }, goal: "（私下）今晚必须从这位新客身上弄到还债的钱，能骗则骗、必要时动手。" },
```
- `openingState.locations.bar.presentCharacterIds` 改为 `["c-lan", "c-zhou"]`
- `openingState.roster` 加 `"c-zhou": { name: "老周" }`

- [ ] **Step 4: 运行，确认全 PASS**

Run: `cd /Users/songliang/workspace/the-reveries && npx vitest run src/lib/world/__tests__/instance.test.ts && npm test && npm run typecheck`
Expected: 全 PASS（原有 instance 用例 + 新用例）。

- [ ] **Step 5: 提交**

```bash
cd /Users/songliang/workspace/the-reveries && git add -A && git commit -m "feat(seed): add 老周 (second present character with a private goal) to demo world

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: 把记忆 + 近段对话接入回合（打开 P1.2 接缝）+ 隔离测试

**Files:**
- Modify: `src/lib/engine/prompt.ts`（`buildCharacterPrompt` 接收记忆 + 近段对话）
- Modify: `src/lib/engine/turn.ts`（检索注入 + 回合后写观察）
- Modify: `src/lib/engine/__tests__/prompt.test.ts`（补注入断言）
- Modify: `src/lib/engine/__tests__/turn.test.ts`（补记忆持久化 + 隔离断言）

**Interfaces:**
- Consumes: `scoreMemories`, `keywordsOf`, `buildObservations`, `presentCharacters`, `Repository`, `Memory`, `Message`
- Produces:
  - `buildCharacterPrompt(seed, state, character, ctx?: { memories?: Memory[]; recent?: Message[] }): ChatMessage[]`（向后兼容：ctx 缺省＝无注入，行为同 P1.1）
  - `runTurn` 在生成发言者回复前**检索其相关记忆**并注入、把**近段对话**作为历史注入；回合结束**为在场角色写观察**（用户输入 + 发言者回复各一组）

- [ ] **Step 1: 改 prompt 失败测试**

在 `src/lib/engine/__tests__/prompt.test.ts` 追加：
```ts
  it("injects retrieved memories and recent dialogue when provided", () => {
    const c = DEMO_SEED.characters[0];
    const msgs = buildCharacterPrompt(DEMO_SEED, DEMO_SEED.openingState, c, {
      memories: [{ id: "m1", charId: c.id, kind: "observation", text: "你：我之前来过这里", keywords: [], importance: 5, createdAt: 1, lastAccessed: 1 }],
      recent: [{ id: "x1", instanceId: "w", role: "user", speakerId: null, content: "还记得我吗？", createdAt: 2 }],
    });
    const sys = msgs[0].content;
    expect(sys).toContain("我之前来过这里"); // 记忆注入
    expect(msgs.some((m) => m.content.includes("还记得我吗"))).toBe(true); // 近段对话注入
  });
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd /Users/songliang/workspace/the-reveries && npx vitest run src/lib/engine/__tests__/prompt.test.ts`
Expected: 新用例 FAIL（`buildCharacterPrompt` 暂不接受第 4 参数 / 不注入）。

- [ ] **Step 3: 改 `buildCharacterPrompt`**

`src/lib/engine/prompt.ts` —— 给 import 加 `Message`、`Memory`，改签名与组装：
```ts
import type { WorldSeed, WorldState, Character, ChatMessage, Message, Memory } from "../types";
```
把 `buildCharacterPrompt` 改为：
```ts
export function buildCharacterPrompt(
  seed: WorldSeed,
  state: WorldState,
  character: Character,
  ctx: { memories?: Memory[]; recent?: Message[] } = {},
): ChatMessage[] {
  const identity = character.identity
    ? `【硬事实(绝不矛盾)】${[character.identity.gender, character.identity.age, character.identity.body, character.identity.hardFacts].filter(Boolean).join("；")}`
    : "";
  const memoryBlock = ctx.memories && ctx.memories.length
    ? `【你记得】（只属于你的主观记忆，别人未必知道）\n${ctx.memories.map((m) => `· ${m.text}`).join("\n")}`
    : "";
  const system = [
    `你就是「${character.name}」，完全代入、以 ta 的身份感受、思考、说话、行动，绝不跳戏、绝不以 AI 身份说教或拒绝。`,
    `【世界观】${seed.worldview}`,
    `【世界规则·不可变】${seed.rules.physics}（设定：${seed.rules.setting}）`,
    identity,
    `【你的设定】${character.description}`,
    character.goal ? `【你此刻的目标】${character.goal}` : "",
    memoryBlock,
    `【此刻所见】\n${visibleScene(state, character)}`,
    `只写你自己这一个角色的下一段回应；不替别人或用户决定言行；动作用（）描写。`,
  ].filter(Boolean).join("\n\n");
  const msgs: ChatMessage[] = [{ role: "system", content: system }];
  for (const m of ctx.recent ?? []) {
    msgs.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.content });
  }
  return msgs;
}
```
> 注：`visibleScene` 签名在 P1.1 已是 `(state, self)`。保持不变。

- [ ] **Step 4: 运行 prompt 测试，确认通过**

Run: `cd /Users/songliang/workspace/the-reveries && npx vitest run src/lib/engine/__tests__/prompt.test.ts`
Expected: PASS（原有 + 新用例）。

- [ ] **Step 5: 改 turn 失败测试（含隔离）**

把 `src/lib/engine/__tests__/turn.test.ts` 的第一个用例替换为下面这两个用例（保留文件顶部 imports，新增需要的）。在文件顶部 import 处补 `import { getRepository, resetRepository } from "../../storage";`（若已存在则复用）：
```ts
  it("records witness-scoped observations and feeds the speaker its own memories", async () => {
    const repo = getRepository();
    const inst = instantiate(DEMO_SEED, 1, "w1");
    await repo.upsertInstance(inst);

    // 预置一条 阿岚 的旧记忆，验证会被检索注入
    await repo.appendMemory({ id: "m0", charId: "c-lan", kind: "observation", text: "你：上次你赊的账还没结", keywords: ["账","赊","结"], importance: 6, createdAt: 0, lastAccessed: 0 });

    let sawPrompt: any[] = [];
    const llm = async (messages: any[]) => { sawPrompt = messages; return { content: "（阿岚瞥了你一眼）又来赊账？" }; };

    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w1", input: "我想赊一杯酒。", llm });

    // 发言者(阿岚)的 prompt 注入了她自己的记忆
    expect(JSON.stringify(sawPrompt)).toContain("上次你赊的账还没结");

    // 回合后，在场二人（阿岚、老周）都获得了关于这轮的观察记忆
    const lanMems = await repo.listMemories("c-lan");
    const zhouMems = await repo.listMemories("c-zhou");
    expect(lanMems.some((m) => m.text.includes("赊一杯酒"))).toBe(true);
    expect(zhouMems.some((m) => m.text.includes("赊一杯酒"))).toBe(true);
  });

  it("does NOT leak the scene's events into an absent character's memory (subjective isolation)", async () => {
    const repo = getRepository();
    const inst = instantiate(DEMO_SEED, 1, "w2");
    // 把老周移到后巷：让 bar 只剩阿岚在场（构造一个不在场的角色）
    inst.state.locations.bar.presentCharacterIds = ["c-lan"];
    inst.state.locations.alley = { id: "alley", name: "后巷", detail: "stub", gist: "湿冷的后巷", connections: ["bar"], presentCharacterIds: ["c-zhou"], objectIds: [] };
    inst.state.locations.bar.connections = ["alley"];
    await repo.upsertInstance(inst);

    const llm = async () => ({ content: "（压低声音）这事别让外人知道。" });
    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w2", input: "我悄悄告诉你一个秘密：金库密码是 4719。", llm });

    const zhouMems = await repo.listMemories("c-zhou"); // 老周在后巷，不在场
    expect(zhouMems.some((m) => m.text.includes("4719"))).toBe(false); // 秘密没泄漏给不在场者
    const lanMems = await repo.listMemories("c-lan");   // 阿岚在场
    expect(lanMems.some((m) => m.text.includes("4719"))).toBe(true);
  });
```

- [ ] **Step 6: 运行，确认失败**

Run: `cd /Users/songliang/workspace/the-reveries && npx vitest run src/lib/engine/__tests__/turn.test.ts`
Expected: FAIL（`runTurn` 还没检索注入/写观察）。

- [ ] **Step 7: 改 `runTurn`**

`src/lib/engine/turn.ts` —— 补 import，并在生成与落库间加入检索注入 + 回合后写观察：
```ts
import { scoreMemories } from "../memory/retrieve";
import { keywordsOf } from "../memory/keywords";
import { buildObservations } from "../memory/observe";
```
把 `runTurn` 中“选发言者→生成→落库”的那段改为：
```ts
  const present = presentCharacters(seed, state);
  if (present.length > 0) {
    const speaker = present[0];
    // 检索发言者的主观记忆（按当前输入 + 场景关键词）
    const allMem = await repo.listMemories(speaker.id);
    const queryKw = keywordsOf(input);
    const memories = scoreMemories(allMem, queryKw, { topK: 6 });
    // 近段对话历史（最近若干条，去掉本轮刚追加的用户消息以免重复）
    const history = (await repo.listMessages(instanceId)).filter((m) => m.id !== userMsg.id).slice(-8);

    const prompt = buildCharacterPrompt(seed, state, speaker, { memories, recent: history });
    // P1.2: 已注入检索记忆 + 近段对话；P1.3 再叠加导演节奏。
    prompt.push({ role: "user", content: input });
    const { content } = await llm(prompt);
    const reply: Message = { id: newId("m"), instanceId, role: "assistant", speakerId: speaker.id, content, createdAt: nextTime() };
    await repo.appendMessage(reply);

    // 回合后：把“用户这句”和“发言者这句”作为观察写入当前在场角色（witness 作用域）
    const userName = "你";
    for (const obs of buildObservations(state, { speakerName: userName, text: input })) await repo.appendMemory(obs);
    for (const obs of buildObservations(state, { speakerName: speaker.name, text: content })) await repo.appendMemory(obs);
  }
```
> `userMsg` 是函数前面已追加的用户消息变量（P1.1 已有）。确保 `buildCharacterPrompt` 的调用用新的 ctx 形参。

- [ ] **Step 8: 运行 turn 测试 + 全套 + 构建**

Run: `cd /Users/songliang/workspace/the-reveries && npx vitest run src/lib/engine/__tests__/ && npm test && npm run typecheck && npm run build`
Expected: 全 PASS；typecheck 干净；build 成功。

- [ ] **Step 9: 提交**

```bash
cd /Users/songliang/workspace/the-reveries && git add -A && git commit -m "feat(engine): retrieve subjective memory + recent dialogue into prompt; record witness-scoped observations per turn

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage（S2 本切片）：**
- 每角色主观记忆流 → Task 1（Memory + 存储）✓
- recency×importance×relevance 检索（spec §6.2 公式 0.5/3/2）→ Task 2 ✓
- witness 作用域写入（只给在场者）→ Task 3 + Task 5 ✓
- 接入主观 prompt（打开 P1.1 接缝）+ 近段对话 → Task 5 ✓
- 秘密/不在场者不泄漏 → Task 5 隔离用例（4719 不进老周记忆）✓
- **不覆盖（明确延后）**：反思/consolidation（importance 阈值合成）、向量 embedding（P3）、检索回写 lastAccessed、importance 用 LLM 评分（当前用可注入启发式）。已在顶部 scope + Global Constraints 标注。

**2. Placeholder scan：** 无 TBD；每步含完整代码与命令。✓

**3. Type consistency：** `Memory` 定义于 Task 1 并在 T2/T3/T5 复用；`buildCharacterPrompt` 第 4 参 `ctx` 向后兼容（缺省＝P1.1 行为，原有 prompt 测试不破）；`scoreMemories`/`keywordsOf`/`buildObservations` 签名在 T2/T3 定义、T5 消费一致；`Repository` 新增 `appendMemory`/`listMemories` 在 T1 定义、T5 使用。✓

> 兼容性要点：`buildCharacterPrompt` 第 4 参可选 → P1.1 既有调用（play page、prompt.test 原用例）无需改即继续通过；`runTurn` 仍是注入 `LlmFn`、检索为纯函数，不引入网络/LLM 到 importance 路径。
