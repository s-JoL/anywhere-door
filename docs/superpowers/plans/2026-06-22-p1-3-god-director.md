# 浮生 / The Reveries — P1.3 God Director 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`). Builds on P1.1 + P1.2 (on `main`).

**Goal:** 让世界"活"起来——在场的多个角色按性格**自主决定是否发言并轮流开口**（不再永远只有第一个角色说话），一个 **God 导演**跟踪戏剧张力、在合适时机插入**世界旁白节拍**，并能把**幕后角色拉入场**；同时闭合 P1.2 标记的"近段历史未按 witness 裁剪"接缝。跑完即得一个能实际游玩、会自我推进的单一世界。

**Architecture:** 在 P1.2 之上，回合从"单发言者"升级为"自由发言引擎"：每条玩家消息触发一轮——对每个空闲在场角色**并行**做一次轻量意图判断（speak/pass + eagerness，注入式 LLM、失败安全 pass），`selectSpeakers` 取前 N 发言，依次生成；连续发言预算用完即让位给玩家，全员 pass 则破冰强选一个。每个角色的上下文（检索记忆 + 近段对话）一律取自**它自己的 witness 作用域观察流**（闭合接缝）。发言结束后 God 导演按张力决定是否插入旁白/拉人入场。**运行时凭空生成全新角色、guardrail 留到后续。**

**Tech Stack:** 沿用 —— Next.js 15 · React 19 · TS strict · Dexie 4 · Vitest。

## Global Constraints

- **TypeScript strict**；ESM。
- **自主发言**：每个在场角色（除刚发言者/用户）各自判断 speak/pass；`selectSpeakers` 按 eagerness 取前 `maxSpeakersPerRound`；全员 pass → 破冰强选 eagerness 最高者一个，随即交回用户。连续 AI 发言不超过 `maxConsecutiveAiTurns`。
- **主观且 witness 作用域**：角色的检索记忆与近段对话上下文**只来自它自己的观察流**（绝不喂它没感知到的对话）。意图判断与发言用同样的主观上下文。
- **LLM 注入不变**：`runTurn` 仍把 `llm: LlmFn` 作为依赖注入；意图判断、发言、导演旁白都经它（测试用能区分"判断/生成"的 fake llm）。检索/选择/张力更新是纯函数。
- **导演**：张力值存于 `WorldState.tension`（additive，可选，默认 0）；旁白节拍是一条 `role:"system"` 且 `narration:true` 的 `Message`（`Message.narration` 为新增可选字段）。导演用注入式 LLM 产出旁白，失败则跳过（降级：不插旁白）。
- **拉人入场**：只把**已在 seed.characters 里、但当前不在场**的角色加入当前场景（move/introduce），不在运行时生成全新人物。
- **不破坏 P1.1/P1.2**：现有测试继续通过；类型新增字段均为可选。
- **本期不做**：运行时生成全新角色、guardrail（可信度门）、向量 embedding。

---

### Task 1: 自由发言引擎 —— 意图判断 + 选择 + 配置

**Files:**
- Create: `src/lib/engine/config.ts`, `src/lib/engine/select.ts`, `src/lib/engine/intent.ts`
- Test: `src/lib/engine/__tests__/select.test.ts`, `src/lib/engine/__tests__/intent.test.ts`

**Interfaces:**
- Consumes: `WorldSeed`, `WorldState`, `Character`, `Memory`, `LlmFn`（from `./turn`）, `buildCharacterPrompt`, `keywordsOf`(unused here), `ChatMessage`
- Produces:
  - `interface EngineConfig { maxConsecutiveAiTurns: number; maxSpeakersPerRound: number }` + `DEFAULT_ENGINE_CONFIG`
  - `interface Intent { action: "speak" | "pass"; eagerness: number }`、`interface Candidate extends Intent { id: string }`、`interface Selection { ids: string[]; forced: boolean }`
  - `selectSpeakers(cands: Candidate[], maxSpeakers: number): Selection`（纯）
  - `parseIntent(text: string): Intent`、`decideIntent(args): Promise<Intent>`（失败安全 pass）

- [ ] **Step 1: 写 select 失败测试**

`src/lib/engine/__tests__/select.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { selectSpeakers } from "../select";

describe("selectSpeakers", () => {
  it("picks speakers by eagerness desc up to maxSpeakers, forced=false", () => {
    const sel = selectSpeakers([
      { id: "a", action: "speak", eagerness: 0.3 },
      { id: "b", action: "speak", eagerness: 0.9 },
      { id: "c", action: "pass", eagerness: 0.5 },
    ], 1);
    expect(sel).toEqual({ ids: ["b"], forced: false });
  });

  it("break-ice forces the single highest-eagerness when everyone passes", () => {
    const sel = selectSpeakers([
      { id: "a", action: "pass", eagerness: 0.2 },
      { id: "b", action: "pass", eagerness: 0.7 },
    ], 2);
    expect(sel).toEqual({ ids: ["b"], forced: true });
  });

  it("returns empty for no candidates", () => {
    expect(selectSpeakers([], 2)).toEqual({ ids: [], forced: false });
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd /Users/songliang/workspace/the-reveries && npx vitest run src/lib/engine/__tests__/select.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 config + select**

`src/lib/engine/config.ts`:
```ts
export interface EngineConfig {
  maxConsecutiveAiTurns: number; // 每条玩家消息后 AI 最多连说几条
  maxSpeakersPerRound: number;   // 每轮最多几个角色发言
}
export const DEFAULT_ENGINE_CONFIG: EngineConfig = { maxConsecutiveAiTurns: 6, maxSpeakersPerRound: 2 };
```

`src/lib/engine/select.ts`:
```ts
export type IntentAction = "speak" | "pass";
export interface Intent { action: IntentAction; eagerness: number }
export interface Candidate extends Intent { id: string }
export interface Selection { ids: string[]; forced: boolean }

const byEagernessDesc = (a: Candidate, b: Candidate) => b.eagerness - a.eagerness;

/** 想说的按 eagerness 取前 N；全员 pass 则破冰强选一个；无候选则空。 */
export function selectSpeakers(cands: Candidate[], maxSpeakers: number): Selection {
  const speakers = cands.filter((c) => c.action === "speak").sort(byEagernessDesc);
  if (speakers.length > 0) {
    return { ids: speakers.slice(0, Math.max(1, maxSpeakers)).map((c) => c.id), forced: false };
  }
  const pool = cands.slice().sort(byEagernessDesc);
  if (pool.length === 0) return { ids: [], forced: false };
  return { ids: [pool[0].id], forced: true };
}
```

- [ ] **Step 4: 运行 select 测试，确认通过**

Run: `cd /Users/songliang/workspace/the-reveries && npx vitest run src/lib/engine/__tests__/select.test.ts`
Expected: PASS。

- [ ] **Step 5: 写 intent 失败测试**

`src/lib/engine/__tests__/intent.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseIntent, decideIntent } from "../intent";
import { DEMO_SEED } from "../../world/seed-demo";
import type { ChatMessage } from "../../types";

describe("parseIntent", () => {
  it("parses a valid intent JSON", () => {
    expect(parseIntent('好的 {"action":"speak","eagerness":0.8} 结束')).toEqual({ action: "speak", eagerness: 0.8 });
  });
  it("clamps eagerness and defaults to safe pass on garbage", () => {
    expect(parseIntent("胡言乱语没有json")).toEqual({ action: "pass", eagerness: 0 });
    expect(parseIntent('{"action":"speak","eagerness":5}').eagerness).toBe(1);
  });
});

describe("decideIntent", () => {
  it("returns the parsed intent from the llm; safe-pass on llm error", async () => {
    const c = DEMO_SEED.characters[0];
    const okLlm = async (_m: ChatMessage[]) => ({ content: '{"action":"speak","eagerness":0.6}' });
    const r = await decideIntent({ seed: DEMO_SEED, state: DEMO_SEED.openingState, character: c, recent: [], llm: okLlm });
    expect(r).toEqual({ action: "speak", eagerness: 0.6 });

    const badLlm = async () => { throw new Error("boom"); };
    const r2 = await decideIntent({ seed: DEMO_SEED, state: DEMO_SEED.openingState, character: c, recent: [], llm: badLlm });
    expect(r2).toEqual({ action: "pass", eagerness: 0 });
  });
});
```

- [ ] **Step 6: 运行，确认失败**

Run: `cd /Users/songliang/workspace/the-reveries && npx vitest run src/lib/engine/__tests__/intent.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 7: 实现 intent**

`src/lib/engine/intent.ts`:
```ts
import type { WorldSeed, WorldState, Character, Memory, ChatMessage } from "../types";
import type { Intent } from "./select";
import type { LlmFn } from "./turn";
import { buildCharacterPrompt } from "./prompt";

const SAFE_PASS: Intent = { action: "pass", eagerness: 0 };

/** 从文本里抽第一个 {...} 解析意图；任何异常回退安全 pass；eagerness 钳到 [0,1]。 */
export function parseIntent(text: string): Intent {
  const m = text.match(/\{[^{}]*\}/);
  if (!m) return SAFE_PASS;
  try {
    const o = JSON.parse(m[0]);
    if (o.action !== "speak" && o.action !== "pass") return SAFE_PASS;
    const e = typeof o.eagerness === "number" ? o.eagerness : 0;
    return { action: o.action, eagerness: Math.max(0, Math.min(1, e)) };
  } catch {
    return SAFE_PASS;
  }
}

export interface DecideIntentArgs {
  seed: WorldSeed;
  state: WorldState;
  character: Character;
  recent: Memory[];   // 该角色自己的近段观察（witness 作用域）
  llm: LlmFn;
}

const JUDGE_TAIL =
  "【系统指令·暂停扮演】现在不要输出任何台词或旁白，只判断：以你的身份，此刻你想不想开口插话/接话？" +
  '严格只输出一行 JSON：{"action":"speak"或"pass","eagerness":0到1的小数}。speak=现在就想说；pass=这轮先不说。';

/** 让某角色判断现在想不想发言。与发言共享主观前缀，仅末轮换成判断指令。失败安全 pass。 */
export async function decideIntent(args: DecideIntentArgs): Promise<Intent> {
  const { seed, state, character, recent, llm } = args;
  try {
    const msgs: ChatMessage[] = buildCharacterPrompt(seed, state, character, { recent });
    msgs.push({ role: "user", content: JUDGE_TAIL });
    const { content } = await llm(msgs);
    return parseIntent(content);
  } catch {
    return SAFE_PASS;
  }
}
```

- [ ] **Step 8: 运行 intent 测试 + 全套**

Run: `cd /Users/songliang/workspace/the-reveries && npx vitest run src/lib/engine/__tests__/ && npm test && npm run typecheck`
Expected: 全 PASS。

- [ ] **Step 9: 提交**

```bash
cd /Users/songliang/workspace/the-reveries && git add -A && git commit -m "feat(engine): free-speech intent judgment + speaker selection + engine config

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 多角色发言回合（witness 作用域上下文）

**Files:**
- Modify: `src/lib/engine/turn.ts`（`runTurn` 升级为多发言者循环）
- Modify: `src/lib/engine/prompt.ts`（`ctx.recent` 改为接收 `Memory[]` 观察并渲染为对话）
- Modify: `src/lib/engine/__tests__/turn.test.ts`、`src/lib/engine/__tests__/prompt.test.ts`（适配）

**Interfaces:**
- Consumes: `decideIntent`, `selectSpeakers`, `DEFAULT_ENGINE_CONFIG`, `scoreMemories`, `keywordsOf`, `buildObservations`, `presentCharacters`, `Repository`, `Memory`, `Message`
- Produces: `runTurn` 一轮内多个在场角色按意图轮流发言；每个角色上下文取自其**自己的观察流**；连续预算 + 破冰兜底。

- [ ] **Step 1: 改 prompt 的 recent 语义（测试先行）**

把 `src/lib/engine/__tests__/prompt.test.ts` 中"injects retrieved memories and recent dialogue"用例的 `recent` 由 `Message[]` 改为 `Memory[]` 观察，并断言其文本注入：
```ts
  it("injects retrieved memories and the character's own recent observations", () => {
    const c = DEMO_SEED.characters[0];
    const msgs = buildCharacterPrompt(DEMO_SEED, DEMO_SEED.openingState, c, {
      memories: [{ id: "m1", charId: c.id, kind: "observation", text: "你：我之前来过这里", keywords: [], importance: 5, createdAt: 1, lastAccessed: 1 }],
      recent: [{ id: "r1", charId: c.id, kind: "observation", text: "老周：你又来啦", keywords: [], importance: 4, createdAt: 2, lastAccessed: 2 }],
    });
    const sys = msgs[0].content;
    expect(sys).toContain("我之前来过这里");                 // 记忆注入
    expect(msgs.some((m) => m.content.includes("老周：你又来啦"))).toBe(true); // 近段观察作为对话注入
  });
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd /Users/songliang/workspace/the-reveries && npx vitest run src/lib/engine/__tests__/prompt.test.ts`
Expected: 该用例 FAIL（`recent` 现为 `Message[]`，类型/渲染不符）。

- [ ] **Step 3: 改 `buildCharacterPrompt` 的 recent 类型与渲染**

`src/lib/engine/prompt.ts` —— import 去掉 `Message`、加 `Memory`（若已 import 则调整）；把 ctx 类型与渲染改为：
```ts
export function buildCharacterPrompt(
  seed: WorldSeed,
  state: WorldState,
  character: Character,
  ctx: { memories?: Memory[]; recent?: Memory[] } = {},
): ChatMessage[] {
  // ...identity / memoryBlock 同前（memoryBlock 用 ctx.memories）...
  const msgs: ChatMessage[] = [{ role: "system", content: system }];
  for (const m of ctx.recent ?? []) {
    msgs.push({ role: "user", content: m.text }); // 近段观察（witness 作用域）作为对话上下文
  }
  return msgs;
}
```
（`system` 段与 P1.2 相同：世界观 + 规则 + 设定 + 目标 + `memoryBlock` + 【此刻所见】+ 行为约束。仅 `recent` 的类型与渲染从 `Message` 改为 `Memory`。）

- [ ] **Step 4: 运行 prompt 测试，确认通过**

Run: `cd /Users/songliang/workspace/the-reveries && npx vitest run src/lib/engine/__tests__/prompt.test.ts`
Expected: PASS。

- [ ] **Step 5: 改 turn 测试为多发言者（含 fake llm 区分判断/生成）**

把 `src/lib/engine/__tests__/turn.test.ts` 整体替换为：
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { runTurn } from "../turn";
import { DEMO_SEED } from "../../world/seed-demo";
import { instantiate } from "../../world/instance";
import { getRepository, resetRepository } from "../../storage";
import type { ChatMessage } from "../../types";

// fake llm：判断请求（含“暂停扮演”）→ 返回 speak JSON；否则 → 返回该角色一句台词
function makeLlm(line: (sys: string) => string) {
  return async (messages: ChatMessage[]) => {
    const last = messages[messages.length - 1]?.content ?? "";
    if (last.includes("暂停扮演")) return { content: '{"action":"speak","eagerness":0.8}' };
    const sys = messages[0]?.content ?? "";
    return { content: line(sys) };
  };
}

describe("runTurn (multi-speaker free-speech)", () => {
  beforeEach(() => { resetRepository(); indexedDB.deleteDatabase("the-reveries"); });

  it("lets present characters speak autonomously and records witness-scoped observations", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w1"));
    // 两人都想说 → 一轮最多 2 人（DEFAULT maxSpeakersPerRound=2）
    const llm = makeLlm((sys) => sys.includes("阿岚") ? "（阿岚擦着杯子）又是你。" : "（老周抬眼）来得正好。");
    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w1", input: "我推门进来。", llm });

    const msgs = await repo.listMessages("w1");
    const speakers = msgs.filter((m) => m.role === "assistant").map((m) => m.speakerId);
    expect(speakers).toContain("c-lan");
    expect(speakers).toContain("c-zhou");
    // 在场双方都获得了观察（含彼此的话）
    const lan = await repo.listMemories("c-lan");
    expect(lan.some((m) => m.text.includes("推门进来"))).toBe(true);
  });

  it("applies a valid delta and rejects an invalid one without crashing", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w2"));
    const llm = makeLlm(() => "……");
    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w2", input: "嗯。",
      deltas: [{ kind: "setObjectState", objectId: "o-glass", state: "满" }, { kind: "setObjectState", objectId: "ghost", state: "x" }], llm });
    const after = await repo.getInstance("w2");
    expect(after?.state.objects["o-glass"].state).toBe("满"); // valid 应用
    expect(after?.state.objects["ghost"]).toBeUndefined();    // invalid 丢弃
  });
});
```

- [ ] **Step 6: 运行，确认失败**

Run: `cd /Users/songliang/workspace/the-reveries && npx vitest run src/lib/engine/__tests__/turn.test.ts`
Expected: FAIL（`runTurn` 还是单发言者）。

- [ ] **Step 7: 把 `runTurn` 升级为多发言者循环**

`src/lib/engine/turn.ts` —— 增补 import，并把"选发言者→生成→落库"那段替换为下面的循环（保留前面 append userMsg、应用 deltas、写用户观察的逻辑；删除原 P1.2 里基于 listMessages 的 recent）：
```ts
import { decideIntent } from "./intent";
import { selectSpeakers, type Candidate } from "./select";
import { DEFAULT_ENGINE_CONFIG } from "./config";
// （已有：scoreMemories, keywordsOf, buildObservations, presentCharacters, buildCharacterPrompt, newId, nextTime）
```
在写完"用户这句观察"之后：
```ts
  const config = DEFAULT_ENGINE_CONFIG;
  let budget = config.maxConsecutiveAiTurns;
  let lastSpeakerId: string | null = null;

  while (budget > 0) {
    const present = presentCharacters(seed, state);
    const candidates = present.filter((c) => c.id !== lastSpeakerId);
    if (candidates.length === 0) break;

    // 并行意图判断（各用自身近段观察作上下文）
    const cands: Candidate[] = await Promise.all(candidates.map(async (c) => {
      const recent = (await repo.listMemories(c.id)).slice(-8);
      const intent = await decideIntent({ seed, state, character: c, recent, llm });
      return { id: c.id, ...intent };
    }));

    const sel = selectSpeakers(cands, config.maxSpeakersPerRound);
    if (sel.ids.length === 0) break;

    for (const id of sel.ids) {
      if (budget <= 0) break;
      const speaker = present.find((c) => c.id === id);
      if (!speaker) continue;
      const own = await repo.listMemories(speaker.id);
      const memories = scoreMemories(own, keywordsOf(input), { topK: 6 });
      const recent = own.slice(-8); // witness 作用域：只用该角色自己的观察
      const msgs = buildCharacterPrompt(seed, state, speaker, { memories, recent });
      const { content } = await llm(msgs);
      const reply: Message = { id: newId("m"), instanceId, role: "assistant", speakerId: speaker.id, content, createdAt: nextTime() };
      await repo.appendMessage(reply);
      // 该发言作为观察写给当前在场者（含后续发言者，从而看到刚说的话）
      for (const obs of buildObservations(state, { speakerName: speaker.name, text: content })) await repo.appendMemory(obs);
      lastSpeakerId = speaker.id;
      budget--;
    }
    if (sel.forced) break; // 破冰只破一次，随即交回用户
  }
```
> 注：循环结束后仍 `await repo.upsertInstance({ ...inst, state, updatedAt: nextTime() })`（P1.2 已有）。删去 P1.2 中 `const history = (await repo.listMessages(...))...` 那段（已被 witness 作用域观察取代）。

- [ ] **Step 8: 运行 turn 测试 + 全套 + 构建**

Run: `cd /Users/songliang/workspace/the-reveries && npx vitest run src/lib/engine/__tests__/ && npm test && npm run typecheck && npm run build`
Expected: 全 PASS；build 成功。

- [ ] **Step 9: 提交**

```bash
cd /Users/songliang/workspace/the-reveries && git add -A && git commit -m "feat(engine): multi-speaker free-speech turn loop with witness-scoped context (closes P1.2 recent-history seam)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: God 导演 —— 张力 + 旁白节拍

**Files:**
- Modify: `src/lib/types.ts`（`WorldState.tension?`、`Message.narration?`）
- Create: `src/lib/engine/director.ts`
- Modify: `src/lib/engine/turn.ts`（回合末调用导演）
- Test: `src/lib/engine/__tests__/director.test.ts`

**Interfaces:**
- Consumes: `WorldState`, `Message`, `LlmFn`, `buildTranscript`?(无，用简单拼接), `newId`, `nextTime`
- Produces:
  - `updateTension(prev: number, lastLine: string): number`（纯：冲突/动作/强标点 → 升，平淡 → 衰减；钳 0–10）
  - `directorNarrate(args: { state, recentLines: string[], llm }): Promise<string | null>`（LLM 产一句第三人称世界旁白；失败/空 → null）
  - `maybeDirect(args): Promise<Message | null>`（按张力/节拍决定是否产出一条 `narration` 旁白消息）

- [ ] **Step 1: 加类型字段（additive）**

`src/lib/types.ts`：给 `WorldState` 加可选 `tension?: number;`；给 `Message` 加可选 `narration?: boolean;`。

- [ ] **Step 2: 写 director 失败测试**

`src/lib/engine/__tests__/director.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { updateTension, directorNarrate } from "../director";
import type { ChatMessage, WorldState } from "../../types";

describe("updateTension (pure)", () => {
  it("rises on charged/action lines, decays on calm, clamps 0..10", () => {
    expect(updateTension(2, "（拔枪）别动！")).toBeGreaterThan(2);
    expect(updateTension(5, "嗯，天气不错。")).toBeLessThan(5);
    expect(updateTension(10, "（开枪）！！")).toBeLessThanOrEqual(10);
    expect(updateTension(0, "……")).toBeGreaterThanOrEqual(0);
  });
});

describe("directorNarrate", () => {
  const state: WorldState = {
    currentLocationId: "bar", time: { day: 1, clock: "深夜", lighting: "冷光" },
    locations: { bar: { id: "bar", name: "酒馆", detail: "fleshed", gist: "", connections: [], presentCharacterIds: [], objectIds: [] } },
    objects: {}, roster: {}, flags: {},
  };
  it("returns a trimmed narration string from the llm", async () => {
    const llm = async (_m: ChatMessage[]) => ({ content: "  雨势更急了，霓虹在水洼里碎成一片血红。  " });
    expect(await directorNarrate({ state, recentLines: ["你：我推门进来"], llm })).toBe("雨势更急了，霓虹在水洼里碎成一片血红。");
  });
  it("returns null on empty content or llm error", async () => {
    expect(await directorNarrate({ state, recentLines: [], llm: async () => ({ content: "   " }) })).toBeNull();
    expect(await directorNarrate({ state, recentLines: [], llm: async () => { throw new Error("x"); } })).toBeNull();
  });
});
```

- [ ] **Step 3: 运行，确认失败**

Run: `cd /Users/songliang/workspace/the-reveries && npx vitest run src/lib/engine/__tests__/director.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 4: 实现 director**

`src/lib/engine/director.ts`:
```ts
import type { WorldState, Message, ChatMessage } from "../types";
import type { LlmFn } from "./turn";
import { newId } from "../id";
import { nextTime } from "../clock";

/** 纯：根据最近一句更新张力（冲突/动作/强标点升，平淡衰减），钳 0–10。 */
export function updateTension(prev: number, lastLine: string): number {
  let t = prev;
  if (/[（(].*[)）]/.test(lastLine)) t += 1.5;          // 有动作
  if (/[！!?？]/.test(lastLine)) t += 1;                 // 情绪
  if (/枪|血|死|逃|打|抓|吼|威胁|危险|喊/.test(lastLine)) t += 2; // 冲突词
  if (lastLine.length <= 6) t -= 1;                      // 短促闲谈
  t -= 0.5;                                              // 自然衰减
  return Math.max(0, Math.min(10, t));
}

const DIRECTOR_SYSTEM =
  "你是世界环境导演。只用一句简短的第三人称中文旁白，描述此刻**外部可见**的环境/气氛微变化（光线、声音、天气、人群、物件），" +
  "推进临场感但不剧透任何人内心、不替角色说话、不下判断。只输出这一句旁白本身，不要引号、不要任何多余文字。";

export interface NarrateArgs { state: WorldState; recentLines: string[]; llm: LlmFn }

/** 产一句世界旁白；失败/空 → null（降级不插旁白）。 */
export async function directorNarrate({ state, recentLines, llm }: NarrateArgs): Promise<string | null> {
  const user =
    `【场景】${state.locations[state.currentLocationId]?.name ?? ""}（${state.time.clock}，${state.time.lighting}）\n` +
    `【最近】\n${recentLines.slice(-6).join("\n") || "（暂无）"}`;
  try {
    const { content } = await llm([{ role: "system", content: DIRECTOR_SYSTEM }, { role: "user", content: user }]);
    const line = content.trim();
    return line.length > 0 ? line : null;
  } catch {
    return null;
  }
}

export interface MaybeDirectArgs {
  instanceId: string;
  state: WorldState;
  recentLines: string[];
  tensionBefore: number;
  tensionAfter: number;
  llm: LlmFn;
}

/** 节拍决策：张力明显上升、或攒到较高时，插一条世界旁白。返回旁白 Message 或 null。 */
export async function maybeDirect(args: MaybeDirectArgs): Promise<Message | null> {
  const { instanceId, state, recentLines, tensionBefore, tensionAfter, llm } = args;
  const rose = tensionAfter - tensionBefore >= 1.5;
  const high = tensionAfter >= 6;
  if (!rose && !high) return null;
  const line = await directorNarrate({ state, recentLines, llm });
  if (!line) return null;
  return { id: newId("n"), instanceId, role: "system", speakerId: null, content: line, narration: true, createdAt: nextTime() };
}
```

- [ ] **Step 5: 回合末接入导演**

`src/lib/engine/turn.ts` —— import `updateTension`, `maybeDirect`；在多发言者循环**结束后、`upsertInstance` 之前**加入：
```ts
  // 导演：按本回合最后一句更新张力，必要时插一条世界旁白
  const allMsgs = await repo.listMessages(instanceId);
  const spokenLines = allMsgs.filter((m) => m.role !== "system").slice(-6).map((m) => m.content);
  const lastLine = spokenLines[spokenLines.length - 1] ?? input;
  const tensionBefore = state.tension ?? 0;
  const tensionAfter = updateTension(tensionBefore, lastLine);
  state = { ...state, tension: tensionAfter };
  const beat = await maybeDirect({ instanceId, state, recentLines: spokenLines, tensionBefore, tensionAfter, llm });
  if (beat) await repo.appendMessage(beat);
```
> 仍保留循环后的 `upsertInstance({ ...inst, state, updatedAt: nextTime() })`（此时 `state` 含更新后的 tension）。

- [ ] **Step 6: 运行 + 全套 + 构建**

Run: `cd /Users/songliang/workspace/the-reveries && npx vitest run src/lib/engine/__tests__/ && npm test && npm run typecheck && npm run build`
Expected: 全 PASS；build 成功。（注：turn 测试的 fake llm 对导演的 user 请求会走 `line(sys)` 分支返回台词字符串，作为旁白也无妨；不影响断言。）

- [ ] **Step 7: 提交**

```bash
cd /Users/songliang/workspace/the-reveries && git add -A && git commit -m "feat(engine): God director — tension tracking + world narration beats

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: God 把幕后角色拉入场 + demo 加一个幕后角色

**Files:**
- Modify: `src/lib/world/seed-demo.ts`（加一个**不在场**的幕后角色）
- Create: `src/lib/engine/introduce.ts`
- Modify: `src/lib/engine/turn.ts`（导演在合适时机拉人入场）
- Test: `src/lib/engine/__tests__/introduce.test.ts`

**Interfaces:**
- Produces:
  - `offstageCharacterIds(seed, state): string[]`（在 seed.characters 但不在任何 location.presentCharacterIds）
  - `introduceCharacter(state, charId, locationId): WorldState`（把该角色加入该场景在场名单；纯、不可变）
  - `introductionBeat(instanceId, name): Message`（一条 narration：「<name> 推门走了进来」）

- [ ] **Step 1: 写失败测试**

`src/lib/engine/__tests__/introduce.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { offstageCharacterIds, introduceCharacter } from "../introduce";
import { DEMO_SEED } from "../../world/seed-demo";

describe("introduce", () => {
  it("lists seed characters not present in any location", () => {
    const off = offstageCharacterIds(DEMO_SEED, DEMO_SEED.openingState);
    expect(off).toContain("c-mei"); // 幕后角色
    expect(off).not.toContain("c-lan");
    expect(off).not.toContain("c-zhou");
  });
  it("introduces an offstage character into a location immutably", () => {
    const next = introduceCharacter(DEMO_SEED.openingState, "c-mei", "bar");
    expect(next.locations.bar.presentCharacterIds).toContain("c-mei");
    expect(DEMO_SEED.openingState.locations.bar.presentCharacterIds).not.toContain("c-mei"); // 原状态未变
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd /Users/songliang/workspace/the-reveries && npx vitest run src/lib/engine/__tests__/introduce.test.ts`
Expected: FAIL（模块不存在 / c-mei 不存在）。

- [ ] **Step 3: demo 加幕后角色 c-mei**

`src/lib/world/seed-demo.ts`：
- `characters` 加（不放进任何 presentCharacterIds）：
```ts
    { id: "c-mei", name: "阿梅", description: "城南赌坊派来收账的年轻女人，笑里藏刀，最擅长在最尴尬的时机出现。", identity: { gender: "女" }, goal: "找到老周，把欠款连本带利收回去；顺便掂量这位新客。" },
```
- `roster` 加 `"c-mei": { name: "阿梅" }`（注意：**不**加入 `bar.presentCharacterIds`，她是幕后的）。

- [ ] **Step 4: 实现 introduce**

`src/lib/engine/introduce.ts`:
```ts
import type { WorldSeed, WorldState, Message } from "../types";
import { newId } from "../id";
import { nextTime } from "../clock";

/** seed 里存在、但当前不在任何场景在场名单中的角色 id。 */
export function offstageCharacterIds(seed: WorldSeed, state: WorldState): string[] {
  const present = new Set<string>();
  for (const loc of Object.values(state.locations)) for (const id of loc.presentCharacterIds) present.add(id);
  return seed.characters.map((c) => c.id).filter((id) => !present.has(id));
}

/** 把幕后角色加入某场景在场名单（不可变）。 */
export function introduceCharacter(state: WorldState, charId: string, locationId: string): WorldState {
  const loc = state.locations[locationId];
  if (!loc || loc.presentCharacterIds.includes(charId)) return state;
  return {
    ...state,
    locations: { ...state.locations, [locationId]: { ...loc, presentCharacterIds: [...loc.presentCharacterIds, charId] } },
  };
}

/** 登场旁白。 */
export function introductionBeat(instanceId: string, name: string): Message {
  return { id: newId("n"), instanceId, role: "system", speakerId: null, content: `${name}推门走了进来。`, narration: true, createdAt: nextTime() };
}
```

- [ ] **Step 5: 导演在张力高位时拉人入场**

`src/lib/engine/turn.ts` —— import `offstageCharacterIds`, `introduceCharacter`, `introductionBeat`；在 Task 3 的导演段**之后**（旁白处理完）加入：
```ts
  // 张力攒高且有幕后角色时，God 拉一个入场制造转折（每回合至多一次）
  if (tensionAfter >= 7) {
    const off = offstageCharacterIds(seed, state);
    if (off.length > 0) {
      const enterId = off[0];
      const enterName = state.roster[enterId]?.name ?? seed.characters.find((c) => c.id === enterId)?.name ?? "某人";
      state = introduceCharacter(state, enterId, state.currentLocationId);
      await repo.appendMessage(introductionBeat(instanceId, enterName));
    }
  }
```
> 仍保留其后的 `upsertInstance({ ...inst, state, ... })`（state 现含新在场者）。

- [ ] **Step 6: 运行 + 全套 + 构建**

Run: `cd /Users/songliang/workspace/the-reveries && npx vitest run src/lib/engine/__tests__/ && npx vitest run src/lib/world/__tests__/instance.test.ts && npm test && npm run typecheck && npm run build`
Expected: 全 PASS（注意 instance.test 里若有"幕后角色不在场"相关旧断言需仍成立——c-mei 不在 bar）。

- [ ] **Step 7: 提交**

```bash
cd /Users/songliang/workspace/the-reveries && git add -A && git commit -m "feat(engine): God introduces an offstage character into the scene at high tension

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: UI —— 多发言者 + 世界旁白 + 在场名单

**Files:**
- Modify: `src/app/play/page.tsx`

**Interfaces:**
- Consumes: `getRepository`, `runTurn`, `streamChat`, `DEMO_SEED`, `presentCharacters`, `Message`
- Produces: `/play` 渲染：每条 assistant 显示发言者名；`narration:true` 的 system 消息渲染为居中的「世界旁白」样式；顶部显示当前在场角色名单。

- [ ] **Step 1: 改 play 页面**

`src/app/play/page.tsx` —— 在现有基础上：
- 顶部 header 改为显示在场名单：`{presentCharacters(DEMO_SEED, /* 当前 state 暂用 openingState 占位或从实例读取 */).map(c => c.name).join(" · ")}`。简单起见用一个 state 保存当前实例并取 `inst.state`；若实现成本高，可显示 `DEMO_SEED.title` 不变，仅新增下面两项。
- 消息渲染：
  - `m.role === "system" && m.narration` → 居中斜体「— 🌍 {m.content} —」样式。
  - `m.role === "assistant"` → 顶部小字显示 `DEMO_SEED.characters.find(c => c.id === m.speakerId)?.name`（已有，确认保留）。
  - 其余 system 消息（无 narration）→ 居中普通小字。

具体替换消息 `map` 渲染块为：
```tsx
        {messages.map((m) => {
          if (m.role === "system") {
            return (
              <div key={m.id} className="my-1 text-center text-[12px] italic text-amber-200/70">
                {m.narration ? `— 🌍 ${m.content} —` : `— ${m.content} —`}
              </div>
            );
          }
          const speaker = m.role === "assistant" ? DEMO_SEED.characters.find((c) => c.id === m.speakerId)?.name : undefined;
          return (
            <div key={m.id} className={m.role === "user" ? "self-end text-right" : "self-start"}>
              {speaker && <div className="text-[11px] text-amber-300/70">{speaker}</div>}
              <div className="whitespace-pre-wrap rounded-lg bg-white/5 px-3 py-2 text-[15px] leading-relaxed">{m.content}</div>
            </div>
          );
        })}
```

- [ ] **Step 2: 类型 + 构建验证（无单测，UI 端到端）**

Run: `cd /Users/songliang/workspace/the-reveries && npm run typecheck && npm test && npm run build`
Expected: typecheck 干净；全套测试仍 PASS；build 成功（`/play` 编译通过）。

- [ ] **Step 3: 提交**

```bash
cd /Users/songliang/workspace/the-reveries && git add -A && git commit -m "feat(ui): render multiple speakers + world narration beats in /play

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage（S3 本切片）：**
- 自主多角色发言（每角色判断 speak/pass + 选择 + 预算 + 破冰）→ Task 1+2 ✓
- witness 作用域上下文（角色只用自己的观察流）→ Task 2（闭合 P1.2 接缝）✓
- God 导演节奏（张力 + 旁白节拍）→ Task 3 ✓
- God 拉幕后角色入场（option C：创作者定角色、God 在框架内引入）→ Task 4 ✓
- UI 多发言者 + 世界旁白 → Task 5 ✓
- **不覆盖（明确延后）**：运行时凭空生成全新角色、guardrail 可信度门、向量 embedding。已在 scope + Global Constraints 标注。

**2. Placeholder scan：** 无 TBD；每步含完整代码与命令。✓

**3. Type consistency：** `Intent/Candidate/Selection`(T1) 被 T2 消费；`LlmFn` 从 `./turn` 复用（intent/director import 之，注意避免循环——`intent.ts`/`director.ts` 仅 `import type { LlmFn }`，类型导入不产生运行时循环）；`buildCharacterPrompt.ctx.recent` 由 `Message[]`(P1.2) 改为 `Memory[]`(T2)，调用方仅 `runTurn` 与 prompt 测试，已同步；`WorldState.tension?`/`Message.narration?` 为可选新增，不破坏既有。✓

> 循环依赖注意：`turn.ts` 导出 `LlmFn` 并 import `intent.ts`/`director.ts`，而后两者 `import type { LlmFn } from "./turn"`。因是 **type-only import**，编译期擦除、无运行时循环。若实现时报循环，可把 `LlmFn` 抽到 `engine/types.ts`。
