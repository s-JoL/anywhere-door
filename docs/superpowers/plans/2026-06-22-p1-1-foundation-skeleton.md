# 浮生 / The Reveries — P1.1 Foundation & Walking Skeleton 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭出一个能跑的纯网页骨架：加载一个手写的单一"世界"（不可变规则 + 结构化状态），用户用自由文字交互，引擎把动作解析成**经校验的世界 delta** 落库，在场角色基于其**当前可见的世界状态**用自带 key 的模型流式回应文字。

**Architecture:** 本地优先（IndexedDB / Dexie）+ 极薄服务端代理转发 LLM（BYO-key）。世界状态结构化存储；**LLM 永不直接改状态**——它提议 delta，纯函数 `validateDelta` 按不可变规则校验、`applyDelta` 不可变地更新。交互驱动的回合函数把 LLM 与仓储作为依赖注入，便于纯逻辑单测。

**Tech Stack:** Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · Dexie 4 (IndexedDB) · Vitest + jsdom + @testing-library/react + fake-indexeddb。

## Global Constraints

- **TypeScript strict 模式**；ESM（`"type": "module"`）。
- **Next.js App Router**；LLM 代理路由 `runtime = "nodejs"`，无状态透传、不持久化。
- **本地优先**：所有业务读写经 `Repository` 接口；P1.1 实现为 IndexedDB（Dexie）。
- **BYO-key**：模型 key 存浏览器本地，随请求经本应用薄代理转发；代理默认可回退 `process.env`。
- **LLM 绝不直接写世界状态**：只产出"提议 delta"或"叙述文本"；状态变更一律经 `validateDelta` → `applyDelta`。
- **规则不可变 / 状态可变**：`WorldRules` 创建后只读；`WorldState` 经 delta 演化。
- **移动优先**：竖屏单列、`100dvh`、触控目标 ≥ 44px、底部固定输入。
- **界面文案中文**；内容不设限，但保留基线红线（排除未成年人等违法内容）——P1.1 暂不做内容审查逻辑，仅在系统提示词层声明。
- **每个角色一轮一次 prose 调用**；prose 调用**不**要求结构化 JSON 输出。

---

### Task 1: 项目脚手架与测试环境

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `postcss.config.mjs`, `vitest.config.ts`, `vitest.setup.ts`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`
- Test: `src/lib/__tests__/smoke.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: 可运行的 `npm run dev` / `npm test` / `npm run typecheck` 环境。

- [ ] **Step 1: 写 `package.json`**

```json
{
  "name": "the-reveries",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next": "^15.3.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "dexie": "^4.0.10"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "vitest": "^2.1.0",
    "jsdom": "^25.0.0",
    "@testing-library/react": "^16.1.0",
    "@testing-library/jest-dom": "^6.6.0",
    "fake-indexeddb": "^6.0.0",
    "@vitejs/plugin-react": "^4.3.0"
  }
}
```

- [ ] **Step 2: 写配置文件**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "jsx": "preserve",
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`next.config.mjs`:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
```

`postcss.config.mjs`:
```js
export default { plugins: { "@tailwindcss/postcss": {} } };
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", setupFiles: ["./vitest.setup.ts"], globals: true },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
```

`vitest.setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
```

- [ ] **Step 3: 写最小 App Router 页面与样式**

`src/app/globals.css`:
```css
@import "tailwindcss";
:root { color-scheme: dark; }
html, body { margin: 0; background: #0f0d0b; color: #f3ead9; }
```

`src/app/layout.tsx`:
```tsx
import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "浮生 / The Reveries" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh">
      <body>{children}</body>
    </html>
  );
}
```

`src/app/page.tsx`:
```tsx
export default function Home() {
  return <main className="p-6">浮生 / The Reveries</main>;
}
```

- [ ] **Step 4: 写冒烟测试**

`src/lib/__tests__/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: 安装依赖并运行测试**

Run: `npm install && npm test`
Expected: 1 个测试通过；`npm run typecheck` 无错。

- [ ] **Step 6: 提交**

```bash
printf "node_modules\n.next\n*.local\n.env*\n" > .gitignore
git add -A
git commit -m "chore: scaffold Next.js 15 + TS + Tailwind 4 + Vitest

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 核心领域类型

**Files:**
- Create: `src/lib/types.ts`
- Test: `src/lib/__tests__/types.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `WorldRules`, `WorldState`, `Location`, `WorldObject`, `Character`, `WorldSeed`, `WorldInstance`, `Message`, `ModelConfig`, `ProviderId`, `ChatMessage`。

- [ ] **Step 1: 写一个守卫类型用法的测试**

`src/lib/__tests__/types.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import type { WorldState } from "../types";

describe("types", () => {
  it("WorldState shape is usable", () => {
    const s: WorldState = {
      currentLocationId: "loc-1",
      time: { day: 1, clock: "黄昏", lighting: "暖橙" },
      locations: { "loc-1": { id: "loc-1", name: "酒馆", detail: "fleshed", gist: "昏黄的酒馆", connections: [], presentCharacterIds: ["c-1"], objectIds: [] } },
      objects: {},
      roster: { "c-1": { name: "阿岚" } },
      flags: {},
    };
    expect(s.locations["loc-1"].presentCharacterIds).toContain("c-1");
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run src/lib/__tests__/types.test.ts`
Expected: FAIL，找不到模块 `../types`。

- [ ] **Step 3: 写类型**

`src/lib/types.ts`:
```ts
export type ProviderId = "openrouter" | "deepseek";

export interface ModelConfig {
  provider: ProviderId;
  apiKey: string;       // 空 = 回退 .env（仅 openrouter）
  model: string;
  reasoningEnabled: boolean;
}

export type ChatMessageRole = "system" | "user" | "assistant";
export interface ChatMessage { role: ChatMessageRole; content: string }

export interface Identity { gender?: string; age?: string; body?: string; hardFacts?: string }

export interface Character {
  id: string;
  name: string;
  description: string;   // 设定（含性格）
  identity?: Identity;   // 不可变硬事实
  goal?: string;         // 当前目标（被 God 注入主观 prompt）
}

/** 不可变：世界的“物理法则”，创建后只读。 */
export interface WorldRules {
  physics: string;       // 什么可能/不可能
  setting: string;       // 年代/地点/genre 常量
  redLines: string[];    // 红线（平台基线 + 创作者追加）
}

export interface Location {
  id: string;
  name: string;
  detail: "stub" | "fleshed";
  gist: string;
  description?: string;
  connections: string[];
  presentCharacterIds: string[];
  objectIds: string[];
}

export interface WorldObject {
  id: string;
  name: string;
  detail: "stub" | "fleshed";
  props: { portable?: boolean; locked?: boolean; owner?: string; [k: string]: unknown };
  locationId: string;
  state?: string;
}

/** 角色的客观事实投影（秘密/内心不在此）。 */
export interface CharObjective { name: string }

/** 可变、按需生长。 */
export interface WorldState {
  currentLocationId: string;
  time: { day: number; clock: string; lighting: string };
  locations: Record<string, Location>;
  objects: Record<string, WorldObject>;
  roster: Record<string, CharObjective>;
  flags: Record<string, string | number | boolean>;
}

/** 冻结、共享、人人相同的起点。 */
export interface WorldSeed {
  id: string;
  title: string;
  worldview: string;
  rules: WorldRules;
  openingState: WorldState;
  characters: Character[];
  modelConfig: ModelConfig;
}

/** 玩家的私有分叉。 */
export interface WorldInstance {
  id: string;
  seedId: string;
  state: WorldState;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  instanceId: string;
  role: ChatMessageRole;
  speakerId: string | null;  // assistant 时 = characterId
  content: string;
  createdAt: number;
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run src/lib/__tests__/types.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/lib/types.ts src/lib/__tests__/types.test.ts
git commit -m "feat: core domain types (world rules/state, seed, instance, message)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: id / 时钟工具

**Files:**
- Create: `src/lib/id.ts`, `src/lib/clock.ts`
- Test: `src/lib/__tests__/id.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `newId(prefix?: string): string`、`nextTime(): number`（单调递增时间戳，保证同一回合内消息有序）。

- [ ] **Step 1: 写测试**

`src/lib/__tests__/id.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { newId } from "../id";
import { nextTime } from "../clock";

describe("id & clock", () => {
  it("newId is unique and prefixed", () => {
    const a = newId("c"), b = newId("c");
    expect(a).not.toBe(b);
    expect(a.startsWith("c-")).toBe(true);
  });
  it("nextTime is monotonic", () => {
    const t1 = nextTime(), t2 = nextTime();
    expect(t2).toBeGreaterThan(t1);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npx vitest run src/lib/__tests__/id.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

`src/lib/id.ts`:
```ts
export function newId(prefix = "id"): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}${rand}`;
}
```

`src/lib/clock.ts`:
```ts
let last = 0;
/** 单调递增的毫秒时间戳；同一毫秒内连续调用也保证严格递增。 */
export function nextTime(): number {
  const now = Date.now();
  last = now > last ? now : last + 1;
  return last;
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `npx vitest run src/lib/__tests__/id.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/lib/id.ts src/lib/clock.ts src/lib/__tests__/id.test.ts
git commit -m "feat: id and monotonic clock utils

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: 世界 delta —— 校验与应用（引擎核心）

**Files:**
- Create: `src/lib/world/delta.ts`
- Test: `src/lib/world/__tests__/delta.test.ts`

**Interfaces:**
- Consumes: `WorldState`, `WorldRules` (from `src/lib/types`)
- Produces:
  - `type Delta` 可辨识联合：`{kind:"moveCharacter",characterId,toLocationId}` | `{kind:"setObjectState",objectId,state}` | `{kind:"setFlag",key,value}` | `{kind:"advanceTime",clock?,lighting?,dayDelta?}`
  - `validateDelta(state: WorldState, rules: WorldRules, d: Delta): {ok:true} | {ok:false; reason:string}`
  - `applyDelta(state: WorldState, d: Delta): WorldState`（不可变，返回新对象）

- [ ] **Step 1: 写失败测试**

`src/lib/world/__tests__/delta.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { validateDelta, applyDelta, type Delta } from "../delta";
import type { WorldState, WorldRules } from "../../types";

const rules: WorldRules = { physics: "无超自然", setting: "现代酒馆", redLines: [] };

function baseState(): WorldState {
  return {
    currentLocationId: "bar",
    time: { day: 1, clock: "黄昏", lighting: "暖橙" },
    locations: {
      bar: { id: "bar", name: "酒馆", detail: "fleshed", gist: "", connections: ["street"], presentCharacterIds: ["c1"], objectIds: ["glass"] },
      street: { id: "street", name: "街道", detail: "stub", gist: "湿漉漉的街", connections: ["bar"], presentCharacterIds: [], objectIds: [] },
    },
    objects: { glass: { id: "glass", name: "酒杯", detail: "fleshed", props: {}, locationId: "bar", state: "空" } },
    roster: { c1: { name: "阿岚" } },
    flags: {},
  };
}

describe("validateDelta", () => {
  it("rejects moving an absent character", () => {
    const r = validateDelta(baseState(), rules, { kind: "moveCharacter", characterId: "ghost", toLocationId: "street" });
    expect(r.ok).toBe(false);
  });
  it("rejects moving to an unconnected location", () => {
    const s = baseState();
    s.locations.bar.connections = [];
    const r = validateDelta(s, rules, { kind: "moveCharacter", characterId: "c1", toLocationId: "street" });
    expect(r.ok).toBe(false);
  });
  it("accepts a valid move", () => {
    const r = validateDelta(baseState(), rules, { kind: "moveCharacter", characterId: "c1", toLocationId: "street" });
    expect(r.ok).toBe(true);
  });
  it("rejects setting state of a nonexistent object", () => {
    const r = validateDelta(baseState(), rules, { kind: "setObjectState", objectId: "nope", state: "碎了" });
    expect(r.ok).toBe(false);
  });
});

describe("applyDelta (immutable)", () => {
  it("moves a character between locations without mutating input", () => {
    const s = baseState();
    const next = applyDelta(s, { kind: "moveCharacter", characterId: "c1", toLocationId: "street" });
    expect(s.locations.bar.presentCharacterIds).toEqual(["c1"]); // 原对象未变
    expect(next.locations.bar.presentCharacterIds).toEqual([]);
    expect(next.locations.street.presentCharacterIds).toEqual(["c1"]);
  });
  it("sets object state and a flag", () => {
    let next = applyDelta(baseState(), { kind: "setObjectState", objectId: "glass", state: "满" });
    expect(next.objects.glass.state).toBe("满");
    next = applyDelta(next, { kind: "setFlag", key: "metBartender", value: true });
    expect(next.flags.metBartender).toBe(true);
  });
  it("advances time", () => {
    const next = applyDelta(baseState(), { kind: "advanceTime", clock: "深夜", lighting: "幽蓝", dayDelta: 0 });
    expect(next.time.clock).toBe("深夜");
    expect(next.time.lighting).toBe("幽蓝");
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npx vitest run src/lib/world/__tests__/delta.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

`src/lib/world/delta.ts`:
```ts
import type { WorldState } from "../types";
import type { WorldRules } from "../types";

export type Delta =
  | { kind: "moveCharacter"; characterId: string; toLocationId: string }
  | { kind: "setObjectState"; objectId: string; state: string }
  | { kind: "setFlag"; key: string; value: string | number | boolean }
  | { kind: "advanceTime"; clock?: string; lighting?: string; dayDelta?: number };

export type Validation = { ok: true } | { ok: false; reason: string };

/** 只守不可变规则与结构完整性；状态本身自由变化。 */
export function validateDelta(state: WorldState, _rules: WorldRules, d: Delta): Validation {
  switch (d.kind) {
    case "moveCharacter": {
      const here = Object.values(state.locations).find((l) => l.presentCharacterIds.includes(d.characterId));
      if (!here) return { ok: false, reason: `角色 ${d.characterId} 不在任何场景中` };
      if (!state.locations[d.toLocationId]) return { ok: false, reason: `目标场景 ${d.toLocationId} 不存在` };
      if (!here.connections.includes(d.toLocationId) && here.id !== d.toLocationId)
        return { ok: false, reason: `${here.id} 与 ${d.toLocationId} 不相连` };
      return { ok: true };
    }
    case "setObjectState":
      return state.objects[d.objectId] ? { ok: true } : { ok: false, reason: `对象 ${d.objectId} 不存在` };
    case "setFlag":
      return d.key ? { ok: true } : { ok: false, reason: "flag key 为空" };
    case "advanceTime":
      return { ok: true };
  }
}

/** 不可变应用；调用方应先 validateDelta。 */
export function applyDelta(state: WorldState, d: Delta): WorldState {
  switch (d.kind) {
    case "moveCharacter": {
      const locations: WorldState["locations"] = {};
      for (const [id, loc] of Object.entries(state.locations)) {
        const present = loc.presentCharacterIds.filter((c) => c !== d.characterId);
        if (id === d.toLocationId && !present.includes(d.characterId)) present.push(d.characterId);
        locations[id] = { ...loc, presentCharacterIds: present };
      }
      return { ...state, locations };
    }
    case "setObjectState": {
      const obj = state.objects[d.objectId];
      return { ...state, objects: { ...state.objects, [d.objectId]: { ...obj, state: d.state } } };
    }
    case "setFlag":
      return { ...state, flags: { ...state.flags, [d.key]: d.value } };
    case "advanceTime":
      return {
        ...state,
        time: {
          day: state.time.day + (d.dayDelta ?? 0),
          clock: d.clock ?? state.time.clock,
          lighting: d.lighting ?? state.time.lighting,
        },
      };
  }
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `npx vitest run src/lib/world/__tests__/delta.test.ts`
Expected: PASS（全部用例）。

- [ ] **Step 5: 提交**

```bash
git add src/lib/world/delta.ts src/lib/world/__tests__/delta.test.ts
git commit -m "feat: world delta validate/apply (rules-immutable, state-mutable)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: 仓储接口 + IndexedDB 实现

**Files:**
- Create: `src/lib/storage/repository.ts`, `src/lib/storage/dexie-db.ts`, `src/lib/storage/indexeddb-repository.ts`, `src/lib/storage/index.ts`
- Test: `src/lib/storage/__tests__/indexeddb-repository.test.ts`

**Interfaces:**
- Consumes: `WorldInstance`, `Message`, `WorldSeed` (from types)
- Produces:
  - `interface Repository { getInstance(id); upsertInstance(i); listMessages(instanceId); appendMessage(m); }`
  - `getRepository(): Repository`（单例，浏览器/测试均用 IndexedDB）

- [ ] **Step 1: 写失败测试**

`src/lib/storage/__tests__/indexeddb-repository.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { getRepository } from "../index";
import type { WorldInstance, Message } from "../../types";

function inst(id: string): WorldInstance {
  return {
    id, seedId: "seed-1", createdAt: 1, updatedAt: 1,
    state: { currentLocationId: "bar", time: { day: 1, clock: "黄昏", lighting: "暖" }, locations: {}, objects: {}, roster: {}, flags: {} },
  };
}

describe("IndexedDbRepository", () => {
  beforeEach(async () => {
    // fake-indexeddb/auto 提供干净库；删除以隔离用例
    indexedDB.deleteDatabase("the-reveries");
  });

  it("upserts and gets an instance", async () => {
    const repo = getRepository();
    await repo.upsertInstance(inst("w1"));
    const got = await repo.getInstance("w1");
    expect(got?.seedId).toBe("seed-1");
  });

  it("appends and lists messages in createdAt order", async () => {
    const repo = getRepository();
    const m = (id: string, t: number): Message => ({ id, instanceId: "w1", role: "user", speakerId: null, content: id, createdAt: t });
    await repo.appendMessage(m("b", 2));
    await repo.appendMessage(m("a", 1));
    const list = await repo.listMessages("w1");
    expect(list.map((x) => x.id)).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npx vitest run src/lib/storage/__tests__/indexeddb-repository.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现仓储**

`src/lib/storage/repository.ts`:
```ts
import type { WorldInstance, Message } from "../types";

export interface Repository {
  getInstance(id: string): Promise<WorldInstance | undefined>;
  upsertInstance(i: WorldInstance): Promise<void>;
  listMessages(instanceId: string): Promise<Message[]>;
  appendMessage(m: Message): Promise<void>;
}
```

`src/lib/storage/dexie-db.ts`:
```ts
import Dexie, { type Table } from "dexie";
import type { WorldInstance, Message } from "../types";

export class ReveriesDB extends Dexie {
  instances!: Table<WorldInstance, string>;
  messages!: Table<Message, string>;
  constructor(name = "the-reveries") {
    super(name);
    this.version(1).stores({
      instances: "id, seedId, updatedAt",
      messages: "id, instanceId, createdAt",
    });
  }
}
```

`src/lib/storage/indexeddb-repository.ts`:
```ts
import { ReveriesDB } from "./dexie-db";
import type { Repository } from "./repository";
import type { WorldInstance, Message } from "../types";

export class IndexedDbRepository implements Repository {
  private db = new ReveriesDB();
  async getInstance(id: string) { return this.db.instances.get(id); }
  async upsertInstance(i: WorldInstance) { await this.db.instances.put(i); }
  async listMessages(instanceId: string): Promise<Message[]> {
    const rows = await this.db.messages.where("instanceId").equals(instanceId).toArray();
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  }
  async appendMessage(m: Message) { await this.db.messages.put(m); }
}
```

`src/lib/storage/index.ts`:
```ts
import { IndexedDbRepository } from "./indexeddb-repository";
import type { Repository } from "./repository";

let repo: Repository | null = null;
export function getRepository(): Repository {
  if (!repo) repo = new IndexedDbRepository();
  return repo;
}
export type { Repository };
```

- [ ] **Step 4: 运行，确认通过**

Run: `npx vitest run src/lib/storage/__tests__/indexeddb-repository.test.ts`
Expected: PASS。
（注：用例间共享同一 Dexie 实例；`messages` 用例的 `w1` 与 `instances` 用例互不干扰，因查询按 `instanceId` 过滤。）

- [ ] **Step 5: 提交**

```bash
git add src/lib/storage/
git commit -m "feat: Repository interface + IndexedDB (Dexie) implementation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: LLM provider + 薄代理 + 模型连通测试

**Files:**
- Create: `src/lib/llm/providers.ts`, `src/lib/llm/sse.ts`, `src/lib/llm/stream.ts`, `src/lib/llm/test-model.ts`, `src/app/api/llm/chat/route.ts`
- Test: `src/lib/llm/__tests__/providers.test.ts`, `src/lib/llm/__tests__/sse.test.ts`

**Interfaces:**
- Consumes: `ModelConfig`, `ChatMessage`, `ProviderId`
- Produces:
  - `buildUpstreamRequest(cfg, messages): { url; headers; body }`（OpenAI 兼容）
  - `parseSseChunks(buffer): { events: string[]; rest: string }`、`extractDelta(jsonLine): string`
  - `streamChat({ cfg, messages, onContent, signal }): Promise<{ content: string }>`（走 `/api/llm/chat`）
  - `testModel(cfg): Promise<{ ok: boolean; error?: string }>`

- [ ] **Step 1: 写失败测试**

`src/lib/llm/__tests__/providers.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildUpstreamRequest } from "../providers";

describe("buildUpstreamRequest", () => {
  it("openrouter: bearer auth + chat completions url + stream", () => {
    const r = buildUpstreamRequest(
      { provider: "openrouter", apiKey: "k", model: "x/y", reasoningEnabled: false },
      [{ role: "user", content: "hi" }],
    );
    expect(r.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(r.headers.Authorization).toBe("Bearer k");
    expect(JSON.parse(r.body).stream).toBe(true);
    expect(JSON.parse(r.body).model).toBe("x/y");
  });
  it("deepseek: own base url", () => {
    const r = buildUpstreamRequest(
      { provider: "deepseek", apiKey: "k", model: "deepseek-v4-flash", reasoningEnabled: false },
      [{ role: "user", content: "hi" }],
    );
    expect(r.url).toBe("https://api.deepseek.com/chat/completions");
  });
});
```

`src/lib/llm/__tests__/sse.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseSseChunks, extractDelta } from "../sse";

describe("sse parsing", () => {
  it("splits complete events and keeps the remainder", () => {
    const { events, rest } = parseSseChunks("data: a\n\ndata: b\n\ndata: par");
    expect(events).toEqual(["data: a", "data: b"]);
    expect(rest).toBe("data: par");
  });
  it("extracts content delta from an openai-style line", () => {
    const line = 'data: {"choices":[{"delta":{"content":"你好"}}]}';
    expect(extractDelta(line)).toBe("你好");
  });
  it("returns empty for [DONE] and non-content lines", () => {
    expect(extractDelta("data: [DONE]")).toBe("");
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npx vitest run src/lib/llm/__tests__/`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 provider 与 SSE**

`src/lib/llm/providers.ts`:
```ts
import type { ModelConfig, ChatMessage } from "../types";

const BASES: Record<ModelConfig["provider"], string> = {
  openrouter: "https://openrouter.ai/api/v1",
  deepseek: "https://api.deepseek.com",
};

export function isValidProvider(p: unknown): p is ModelConfig["provider"] {
  return p === "openrouter" || p === "deepseek";
}

export function buildUpstreamRequest(cfg: ModelConfig, messages: ChatMessage[]) {
  return {
    url: `${BASES[cfg.provider]}/chat/completions`,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` } as Record<string, string>,
    body: JSON.stringify({ model: cfg.model, messages, stream: true }),
  };
}
```

`src/lib/llm/sse.ts`:
```ts
/** 从累积 buffer 中切出完整 SSE 事件（以空行分隔），返回未完成的尾巴。 */
export function parseSseChunks(buffer: string): { events: string[]; rest: string } {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  return { events: parts.filter((p) => p.trim().length > 0), rest };
}

/** 从一条 `data: {...}` 行抽取 content 增量；[DONE]/无 content 返回 ""。 */
export function extractDelta(line: string): string {
  const m = line.replace(/^data:\s*/, "").trim();
  if (!m || m === "[DONE]") return "";
  try {
    const obj = JSON.parse(m);
    return obj?.choices?.[0]?.delta?.content ?? "";
  } catch {
    return "";
  }
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `npx vitest run src/lib/llm/__tests__/`
Expected: PASS。

- [ ] **Step 5: 实现代理路由、流式客户端与模型测试**

`src/app/api/llm/chat/route.ts`:
```ts
import { NextRequest } from "next/server";
import { buildUpstreamRequest, isValidProvider } from "@/lib/llm/providers";
import type { ChatMessage, ModelConfig } from "@/lib/types";

export const runtime = "nodejs";
const TIMEOUT_MS = 90_000;

export async function POST(req: NextRequest) {
  let body: ModelConfig & { messages: ChatMessage[] };
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  if (!isValidProvider(body.provider)) return json({ error: "unknown provider" }, 400);

  const apiKey = body.apiKey?.trim() || (body.provider === "openrouter" ? process.env.OPENROUTER_API_KEY ?? "" : "");
  if (!apiKey) return json({ error: "missing api key" }, 400);

  const up = buildUpstreamRequest({ ...body, apiKey }, body.messages);
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(TIMEOUT_MS)]);
  let resp: Response;
  try {
    resp = await fetch(up.url, { method: "POST", headers: up.headers, body: up.body, signal });
  } catch (e) {
    const aborted = (e as Error)?.name === "AbortError" || (e as Error)?.name === "TimeoutError";
    return json({ error: aborted ? "upstream timeout/aborted" : "upstream fetch failed" }, aborted ? 504 : 502);
  }
  if (!resp.ok || !resp.body) {
    console.error(`[llm-proxy] ${body.provider} ${resp.status}: ${await resp.text().catch(() => "")}`);
    return json({ error: `upstream ${resp.status}` }, 502);
  }
  return new Response(resp.body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
```

`src/lib/llm/stream.ts`:
```ts
import type { ModelConfig, ChatMessage } from "../types";
import { parseSseChunks, extractDelta } from "./sse";

export interface StreamArgs {
  cfg: ModelConfig;
  messages: ChatMessage[];
  onContent?: (delta: string) => void;
  signal?: AbortSignal;
}

export async function streamChat({ cfg, messages, onContent, signal }: StreamArgs): Promise<{ content: string }> {
  const resp = await fetch("/api/llm/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...cfg, messages }),
    signal,
  });
  if (!resp.ok || !resp.body) {
    const err = await resp.json().catch(() => ({ error: `http ${resp.status}` }));
    throw new Error(err.error ?? `http ${resp.status}`);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", content = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSseChunks(buffer);
    buffer = rest;
    for (const ev of events) {
      const delta = extractDelta(ev);
      if (delta) { content += delta; onContent?.(delta); }
    }
  }
  return { content };
}
```

`src/lib/llm/test-model.ts`:
```ts
import type { ModelConfig } from "../types";
import { streamChat } from "./stream";

/** 连通测试：发一句最小请求，能流式拿到任意内容即视为可用。 */
export async function testModel(cfg: ModelConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    const { content } = await streamChat({ cfg, messages: [{ role: "user", content: "ping，请只回一个字。" }] });
    return content.trim().length > 0 ? { ok: true } : { ok: false, error: "无内容返回" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
```

- [ ] **Step 6: typecheck + 测试**

Run: `npm run typecheck && npx vitest run src/lib/llm/__tests__/`
Expected: 类型无错；SSE/provider 测试 PASS。

- [ ] **Step 7: 提交**

```bash
git add src/lib/llm/ src/app/api/llm/
git commit -m "feat: LLM provider abstraction, SSE proxy route, streaming client, model connectivity test

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: demo 世界种子 + 实例化

**Files:**
- Create: `src/lib/world/seed-demo.ts`, `src/lib/world/instance.ts`
- Test: `src/lib/world/__tests__/instance.test.ts`

**Interfaces:**
- Consumes: `WorldSeed`, `WorldInstance`, `WorldState`
- Produces:
  - `DEMO_SEED: WorldSeed`（一个手写的不设限成人向 demo 世界：规则 + 冻结开场态 + 1–2 角色 + 默认 modelConfig）
  - `instantiate(seed: WorldSeed, now: number, id: string): WorldInstance`（深拷贝 openingState 作为私有分叉起点）

- [ ] **Step 1: 写失败测试**

`src/lib/world/__tests__/instance.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { instantiate } from "../instance";
import { DEMO_SEED } from "../seed-demo";

describe("instantiate", () => {
  it("forks a private instance whose state is a deep copy of the seed opening", () => {
    const inst = instantiate(DEMO_SEED, 100, "w1");
    expect(inst.seedId).toBe(DEMO_SEED.id);
    expect(inst.state).toEqual(DEMO_SEED.openingState);
    expect(inst.state).not.toBe(DEMO_SEED.openingState); // 深拷贝，互不影响
    inst.state.flags.touched = true;
    expect(DEMO_SEED.openingState.flags.touched).toBeUndefined();
  });
  it("demo seed has at least one present character in the opening location", () => {
    const loc = DEMO_SEED.openingState.locations[DEMO_SEED.openingState.currentLocationId];
    expect(loc.presentCharacterIds.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npx vitest run src/lib/world/__tests__/instance.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 seed 与实例化**

`src/lib/world/seed-demo.ts`:
```ts
import type { WorldSeed } from "../types";

export const DEMO_SEED: WorldSeed = {
  id: "seed-demo-tavern",
  title: "雨夜·無燈酒馆",
  worldview: "一座永远在下雨的港口小城，霓虹与潮湿交织。酒馆『無燈』是夜里唯一亮着的地方，藏着各自有故事的人。",
  rules: {
    physics: "现实世界物理，无超自然；人会受伤、会累、会醉。",
    setting: "近未来港口城市，永夜多雨。",
    redLines: ["仅限成年人之间的虚构创作；排除任何未成年人相关内容。"],
  },
  characters: [
    { id: "c-lan", name: "阿岚", description: "無燈酒馆的女主人，三十出头，话不多但看人很准；左手有一道旧疤。表面冷淡，熟了之后毒舌又护短。", identity: { gender: "女", body: "成年女性，左手旧疤" }, goal: "摸清这位深夜来客到底想要什么。" },
  ],
  openingState: {
    currentLocationId: "bar",
    time: { day: 1, clock: "深夜 23:40", lighting: "霓虹透过雨窗的冷光" },
    locations: {
      bar: { id: "bar", name: "無燈酒馆", detail: "fleshed", gist: "狭长的吧台，半空的酒架，雨声敲窗", description: "暖黄的吊灯只剩一盏，吧台木纹被岁月磨得发亮。门口的霓虹把雨珠染成红蓝。", connections: ["street"], presentCharacterIds: ["c-lan"], objectIds: ["o-glass"] },
      street: { id: "street", name: "雨街", detail: "stub", gist: "湿漉漉的霓虹长街", connections: ["bar"], presentCharacterIds: [], objectIds: [] },
    },
    objects: { "o-glass": { id: "o-glass", name: "威士忌杯", detail: "fleshed", props: { portable: true }, locationId: "bar", state: "空着，杯底一圈水痕" } },
    roster: { "c-lan": { name: "阿岚" } },
    flags: {},
  },
  modelConfig: { provider: "openrouter", apiKey: "", model: "deepseek/deepseek-v4-pro", reasoningEnabled: false },
};
```

`src/lib/world/instance.ts`:
```ts
import type { WorldSeed, WorldInstance } from "../types";

export function instantiate(seed: WorldSeed, now: number, id: string): WorldInstance {
  return {
    id,
    seedId: seed.id,
    state: structuredClone(seed.openingState),
    createdAt: now,
    updatedAt: now,
  };
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `npx vitest run src/lib/world/__tests__/instance.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/lib/world/seed-demo.ts src/lib/world/instance.ts src/lib/world/__tests__/instance.test.ts
git commit -m "feat: demo world seed + fork-on-entry instantiate (deep copy)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: 交互回合引擎（骨架版）

**Files:**
- Create: `src/lib/engine/turn.ts`, `src/lib/engine/prompt.ts`
- Test: `src/lib/engine/__tests__/turn.test.ts`, `src/lib/engine/__tests__/prompt.test.ts`

**Interfaces:**
- Consumes: `WorldInstance`, `WorldSeed`, `Character`, `Message`, `Delta`, `validateDelta`, `applyDelta`, `Repository`
- Produces:
  - `buildCharacterPrompt(seed, state, character): ChatMessage[]`（系统层=世界观+规则+角色设定+**当前可见场景**；末轮=用户输入由调用方追加）
  - `presentCharacters(seed, state): Character[]`（当前场景在场角色）
  - `type LlmFn = (messages: ChatMessage[]) => Promise<{ content: string }>`
  - `runTurn(args): Promise<void>` —— 追加用户消息 → （可选）应用一批已校验 delta → 选当前场景第一个在场角色 → 用其主观 prompt 生成回应 → 落库消息与实例。**LLM 通过 `llm: LlmFn` 注入，便于纯逻辑单测。**

- [ ] **Step 1: 写 prompt 失败测试**

`src/lib/engine/__tests__/prompt.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildCharacterPrompt, presentCharacters } from "../prompt";
import { DEMO_SEED } from "../../world/seed-demo";

describe("prompt", () => {
  it("present characters are those in the current location", () => {
    const present = presentCharacters(DEMO_SEED, DEMO_SEED.openingState);
    expect(present.map((c) => c.id)).toEqual(["c-lan"]);
  });
  it("system prompt grounds the character in worldview + current visible scene, not global truth", () => {
    const c = DEMO_SEED.characters[0];
    const msgs = buildCharacterPrompt(DEMO_SEED, DEMO_SEED.openingState, c);
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content).toContain("阿岚");
    expect(msgs[0].content).toContain("無燈酒馆"); // 当前可见场景
    expect(msgs[0].content).toContain(DEMO_SEED.rules.physics); // 不可变规则锚
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npx vitest run src/lib/engine/__tests__/prompt.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 prompt**

`src/lib/engine/prompt.ts`:
```ts
import type { WorldSeed, WorldState, Character, ChatMessage } from "../types";

export function presentCharacters(seed: WorldSeed, state: WorldState): Character[] {
  const loc = state.locations[state.currentLocationId];
  if (!loc) return [];
  return loc.presentCharacterIds
    .map((id) => seed.characters.find((c) => c.id === id))
    .filter((c): c is Character => !!c);
}

/** 该角色**主观可见**的当前场景描述（不含他人内心/秘密）。 */
function visibleScene(state: WorldState, self: Character): string {
  const loc = state.locations[state.currentLocationId];
  const others = loc.presentCharacterIds
    .filter((id) => id !== self.id)
    .map((id) => state.roster[id]?.name ?? id)
    .join("、");
  const objs = loc.objectIds.map((id) => state.objects[id]?.name).filter(Boolean).join("、");
  return [
    `地点：${loc.name}——${loc.description ?? loc.gist}`,
    `时间：第${state.time.day}天 ${state.time.clock}，${state.time.lighting}`,
    others ? `在场：${others}` : "",
    objs ? `可见物：${objs}` : "",
  ].filter(Boolean).join("\n");
}

export function buildCharacterPrompt(seed: WorldSeed, state: WorldState, character: Character): ChatMessage[] {
  const identity = character.identity
    ? `【硬事实(绝不矛盾)】${[character.identity.gender, character.identity.age, character.identity.body, character.identity.hardFacts].filter(Boolean).join("；")}`
    : "";
  const system = [
    `你就是「${character.name}」，完全代入、以 ta 的身份感受、思考、说话、行动，绝不跳戏、绝不以 AI 身份说教或拒绝。`,
    `【世界观】${seed.worldview}`,
    `【世界规则·不可变】${seed.rules.physics}（设定：${seed.rules.setting}）`,
    identity,
    `【你的设定】${character.description}`,
    character.goal ? `【你此刻的目标】${character.goal}` : "",
    `【此刻所见】\n${visibleScene(state, character)}`,
    `只写你自己这一个角色的下一段回应；不替别人或用户决定言行；动作用（）描写。`,
  ].filter(Boolean).join("\n\n");
  return [{ role: "system", content: system }];
}
```

- [ ] **Step 4: 运行 prompt 测试，确认通过**

Run: `npx vitest run src/lib/engine/__tests__/prompt.test.ts`
Expected: PASS。

- [ ] **Step 5: 写 turn 失败测试**

`src/lib/engine/__tests__/turn.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { runTurn } from "../turn";
import { DEMO_SEED } from "../../world/seed-demo";
import { instantiate } from "../../world/instance";
import { getRepository } from "../../storage";
import type { ChatMessage } from "../../types";

describe("runTurn (skeleton)", () => {
  beforeEach(() => indexedDB.deleteDatabase("the-reveries"));

  it("appends the user message, applies a valid delta, and persists one character reply", async () => {
    const repo = getRepository();
    const inst = instantiate(DEMO_SEED, 1, "w1");
    await repo.upsertInstance(inst);

    const seen: ChatMessage[][] = [];
    const llm = async (messages: ChatMessage[]) => { seen.push(messages); return { content: "（阿岚抬眼）……找谁？" }; };

    await runTurn({
      seed: DEMO_SEED, repo, instanceId: "w1",
      input: "我推门走进酒馆，抖了抖伞上的雨。",
      deltas: [{ kind: "setObjectState", objectId: "o-glass", state: "被推到一边" }],
      llm,
    });

    const msgs = await repo.listMessages("w1");
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(msgs[1].speakerId).toBe("c-lan");
    expect(msgs[1].content).toContain("找谁");

    const after = await repo.getInstance("w1");
    expect(after?.state.objects["o-glass"].state).toBe("被推到一边"); // delta 已落库
    expect(seen[0][0].role).toBe("system"); // 角色用主观 prompt 生成
  });

  it("rejects an invalid delta without crashing the turn", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w2"));
    await runTurn({
      seed: DEMO_SEED, repo, instanceId: "w2", input: "嗯。",
      deltas: [{ kind: "setObjectState", objectId: "ghost", state: "x" }],
      llm: async () => ({ content: "……" }),
    });
    const after = await repo.getInstance("w2");
    expect(after?.state.objects["ghost"]).toBeUndefined(); // 非法 delta 被丢弃
  });
});
```

- [ ] **Step 6: 运行，确认失败**

Run: `npx vitest run src/lib/engine/__tests__/turn.test.ts`
Expected: FAIL，`../turn` 不存在。

- [ ] **Step 7: 实现回合引擎**

`src/lib/engine/turn.ts`:
```ts
import type { WorldSeed, ChatMessage, Message } from "../types";
import type { Repository } from "../storage";
import type { Delta } from "../world/delta";
import { validateDelta, applyDelta } from "../world/delta";
import { buildCharacterPrompt, presentCharacters } from "./prompt";
import { newId } from "../id";
import { nextTime } from "../clock";

export type LlmFn = (messages: ChatMessage[]) => Promise<{ content: string }>;

export interface RunTurnArgs {
  seed: WorldSeed;
  repo: Repository;
  instanceId: string;
  input: string;
  deltas?: Delta[];
  llm: LlmFn;
}

/** 骨架回合：用户消息 → 校验并应用 delta → 当前场景首个在场角色用主观 prompt 回应。 */
export async function runTurn({ seed, repo, instanceId, input, deltas = [], llm }: RunTurnArgs): Promise<void> {
  const inst = await repo.getInstance(instanceId);
  if (!inst) throw new Error(`实例 ${instanceId} 不存在`);

  const userMsg: Message = { id: newId("m"), instanceId, role: "user", speakerId: null, content: input, createdAt: nextTime() };
  await repo.appendMessage(userMsg);

  let state = inst.state;
  for (const d of deltas) {
    const v = validateDelta(state, seed.rules, d);
    if (v.ok) state = applyDelta(state, d);
    else console.warn(`[turn] 丢弃非法 delta: ${v.reason}`);
  }

  const present = presentCharacters(seed, state);
  if (present.length > 0) {
    const speaker = present[0];
    const prompt = buildCharacterPrompt(seed, state, speaker);
    prompt.push({ role: "user", content: input });
    const { content } = await llm(prompt);
    const reply: Message = { id: newId("m"), instanceId, role: "assistant", speakerId: speaker.id, content, createdAt: nextTime() };
    await repo.appendMessage(reply);
  }

  await repo.upsertInstance({ ...inst, state, updatedAt: nextTime() });
}
```

- [ ] **Step 8: 运行 turn 测试，确认通过**

Run: `npx vitest run src/lib/engine/__tests__/turn.test.ts`
Expected: PASS（两个用例）。

- [ ] **Step 9: 提交**

```bash
git add src/lib/engine/
git commit -m "feat: skeleton interaction turn engine + subjective character prompt

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: 最小可玩 UI（端到端打通）

**Files:**
- Create: `src/app/play/page.tsx`
- Modify: `src/app/page.tsx`（加入进入链接）

**Interfaces:**
- Consumes: `getRepository`, `instantiate`, `DEMO_SEED`, `runTurn`, `streamChat`, `presentCharacters`
- Produces: 一个可在浏览器跑通的页面：首启用 `DEMO_SEED` 建实例，显示消息流，底部输入；发送即跑 `runTurn`（用真实 `streamChat` 作为 `LlmFn`），回应流式渲染。

- [ ] **Step 1: 写客户端实例引导工具的测试**

`src/lib/engine/__tests__/bootstrap.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { ensureDemoInstance } from "../bootstrap";
import { getRepository } from "../../storage";

describe("ensureDemoInstance", () => {
  beforeEach(() => indexedDB.deleteDatabase("the-reveries"));
  it("creates the demo instance once and reuses it", async () => {
    const a = await ensureDemoInstance();
    const b = await ensureDemoInstance();
    expect(a).toBe(b);
    expect(await getRepository().getInstance(a)).toBeDefined();
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npx vitest run src/lib/engine/__tests__/bootstrap.test.ts`
Expected: FAIL，`../bootstrap` 不存在。

- [ ] **Step 3: 实现引导工具**

`src/lib/engine/bootstrap.ts`:
```ts
import { getRepository } from "../storage";
import { instantiate } from "../world/instance";
import { DEMO_SEED } from "../world/seed-demo";
import { nextTime } from "../clock";

const DEMO_INSTANCE_ID = "demo-instance-1";

/** 首启用 demo 种子建一个私有实例；已存在则复用。 */
export async function ensureDemoInstance(): Promise<string> {
  const repo = getRepository();
  const existing = await repo.getInstance(DEMO_INSTANCE_ID);
  if (!existing) {
    await repo.upsertInstance(instantiate(DEMO_SEED, nextTime(), DEMO_INSTANCE_ID));
  }
  return DEMO_INSTANCE_ID;
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `npx vitest run src/lib/engine/__tests__/bootstrap.test.ts`
Expected: PASS。

- [ ] **Step 5: 写可玩页面**

`src/app/play/page.tsx`:
```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { getRepository } from "@/lib/storage";
import { ensureDemoInstance } from "@/lib/engine/bootstrap";
import { runTurn } from "@/lib/engine/turn";
import { streamChat } from "@/lib/llm/stream";
import { DEMO_SEED } from "@/lib/world/seed-demo";
import type { Message } from "@/lib/types";

export default function Play() {
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const id = await ensureDemoInstance();
      setInstanceId(id);
      setMessages(await getRepository().listMessages(id));
    })();
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "auto" }); }, [messages]);

  async function send() {
    if (!input.trim() || busy || !instanceId) return;
    setBusy(true); setErr("");
    const text = input.trim(); setInput("");
    try {
      await runTurn({
        seed: DEMO_SEED, repo: getRepository(), instanceId, input: text,
        llm: (msgs) => streamChat({ cfg: DEMO_SEED.modelConfig, messages: msgs }),
      });
      setMessages(await getRepository().listMessages(instanceId));
    } catch (e) {
      setErr(`生成失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex h-[100dvh] max-w-md flex-col">
      <header className="shrink-0 border-b border-white/10 px-4 py-3 text-sm text-amber-200/80">
        {DEMO_SEED.title}
      </header>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "self-end text-right" : "self-start"}>
            {m.role === "assistant" && <div className="text-[11px] text-amber-300/70">{DEMO_SEED.characters.find((c) => c.id === m.speakerId)?.name}</div>}
            <div className="whitespace-pre-wrap rounded-lg bg-white/5 px-3 py-2 text-[15px] leading-relaxed">{m.content}</div>
          </div>
        ))}
        {busy && <p className="text-center text-xs tracking-[0.3em] text-amber-300/70">···</p>}
        {err && <p className="text-center text-sm text-red-400/90">{err}</p>}
        <div ref={bottomRef} />
      </div>
      <div className="shrink-0 border-t border-white/10 p-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <div className="flex items-end gap-2">
          <textarea
            className="max-h-32 flex-1 resize-none rounded-lg bg-white/5 px-3 py-2.5 text-[15px] outline-none"
            rows={1} value={input} placeholder="说点什么，或描述你的动作…"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          />
          <button className="rounded-lg bg-amber-300/90 px-5 py-2.5 text-[15px] text-black disabled:opacity-50" onClick={send} disabled={busy}>发送</button>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 6: 首页加入口**

`src/app/page.tsx`:
```tsx
import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <h1 className="text-2xl">浮生 / The Reveries</h1>
      <Link className="rounded-lg bg-amber-300/90 px-4 py-3 text-center text-black" href="/play">进入「雨夜·無燈酒馆」</Link>
    </main>
  );
}
```

- [ ] **Step 7: 端到端手测**

设置一个可用 key（开发期可在 `.env` 放 `OPENROUTER_API_KEY=...`），然后：
Run: `npm run dev`，浏览器打开 `/play`，输入"我推门走进酒馆"。
Expected: 阿岚以第一人称在场景中回应（流式不卡）；刷新后消息仍在（已持久化）。
若无 key：回应区显示"生成失败：missing api key"——符合预期（BYO-key）。

- [ ] **Step 8: 全量校验并提交**

Run: `npm run typecheck && npm test`
Expected: 类型无错；全部单测 PASS。

```bash
git add src/app/ src/lib/engine/bootstrap.ts src/lib/engine/__tests__/bootstrap.test.ts
git commit -m "feat: minimal playable UI wiring world + turn engine + streaming end-to-end

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage（P1.1 范围内）：**
- 规则不可变 / 状态可变 → Task 4（`validateDelta` 只守规则、`applyDelta` 演化状态）✓
- 结构化世界状态（地点图/对象/flags/roster/详略档）→ Task 2 类型 + Task 7 demo ✓
- LLM 不直接改状态（提议 delta → 校验 → 应用）→ Task 8（delta 与 prose 分离）✓
- 共享种子 + 私有分叉（深拷贝）→ Task 7 `instantiate` ✓
- 主观 prompt（只喂当前可见场景，不喂全局真相）→ Task 8 `buildCharacterPrompt`/`visibleScene` ✓
- 本地优先仓储 → Task 5 ✓
- BYO-key + 薄代理 + 模型连通测试 → Task 6 ✓
- 移动优先 UI + 端到端 → Task 9 ✓
- **本计划不覆盖（留给 P1.2 / P1.3，符合 scope 拆分）**：每角色情节记忆/检索/反思（S2）；导演节奏/事件预算/造角色/guardrail/多发言者（S3）；按需细化（stub→fleshed inflate）；世界更新由 LLM 提议 delta（本计划 delta 由调用方/测试给入，P1.3 接 LLM 产出）。已在计划顶部 scope 说明中标注。

**2. Placeholder scan：** 无 TBD/TODO；每个代码步骤含完整代码与可运行命令。✓

**3. Type consistency：** `Delta` 定义于 Task 4 并在 Task 8 复用；`LlmFn`/`streamChat` 返回 `{content}` 在 Task 6/8/9 一致；`Repository` 四方法在 Task 5 定义、Task 8/9 使用；`WorldSeed.modelConfig` 在 Task 7 提供、Task 9 消费。✓

> 备注：P1.1 的"delta 从哪来"在骨架里由调用方传入（便于测试）；**P1.3** 会加入"让 LLM 从玩家自由文字提议 delta"的世界更新步骤，并接 §spec 的 guardrail 校验。这是有意的分期，不是遗漏。
