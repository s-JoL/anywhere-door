# 任意门 / Anywhere Door — 设计与架构(当前权威版)

> 这是产品形态与技术方案的**单一事实来源**,反映当前已实现的状态。演进过程中的旧设计稿/实现计划已归入 git 历史,不在工作树中保留。
> 前瞻方向见 [`ROADMAP.md`](ROADMAP.md)。曾用名 浮生 / The Reveries。

## 1. 产品形态

一个**移动优先、纯网页**的 AI **活体文字世界**:

- 面前是**无数扇门**。像刷抖音一样**竖滑** feed,每屏一个世界。
- 每张卡是一段**冷开场**(第二人称、悬在最勾人的一刻)——让你**一眼判断**想不想进。
- **推门进入**(开门转场)→ 跨入一个**沉浸的文字世界**:你打字说话/行动,多个角色 + 一个 God 引擎以流式散文回应。
- feed 由**口味引擎**驱动:刷到的门越来越懂你,世界由模型按你的口味**持续生成**,且刻意保持多样性。

## 2. 第一性原则

> 一扇通往**任意世界**、且**认得你**的门;**沉浸第一**;媒介是文字,但世界**内核要像真实世界**——因果、持久、后果。

设计取舍由此推出:
- **交互驱动演化**:世界只在你交互时推进(离开即冻结),零空转成本;线下演化留了接口未实现(见 ROADMAP)。
- **规则不可变 · 状态可变**:世界有一层不可变 `WorldRules`(物理/设定/红线),其上是可变 `WorldState`;LLM 永不直接改状态,只**提议**变化、经校验后落库。
- **自带 key · 本地优先**:平台零推理成本、零数据库;隐私归用户。
- **不设限**:走向由你与模型共同决定。

## 3. 回合循环(核心)

`runTurn`([`src/lib/engine/turn.ts`](../src/lib/engine/turn.ts))一个回合:

1. **(线下演化 seam,no-op)** 预留:回来时按离开时长补演化([`world/offscreen.ts`](../src/lib/world/offscreen.ts))。
2. **意图**:每个在场角色**并行**判断是否开口(speak/pass + 急切度),`selectSpeakers` 取 top-N + 破冰([`engine/intent.ts`](../src/lib/engine/intent.ts), [`select.ts`](../src/lib/engine/select.ts))。
3. **发言**:被选中的角色**流式**说话,prompt 只含其**主观可见**的场景/记忆/关系/lore([`engine/prompt.ts`](../src/lib/engine/prompt.ts))。
4. **导演**:God 更新张力、必要时插入**旁白**、张力高时**引入幕后角色**([`engine/director.ts`](../src/lib/engine/director.ts), [`introduce.ts`](../src/lib/engine/introduce.ts))。
5. **World Reactor**:LLM 读本回合发生的事,**提议结构化 `Delta[]`**;每个 `validateDelta`(对照规则)→ 合法才 `applyDelta`(不可变更新)→ 落库([`engine/reactor.ts`](../src/lib/engine/reactor.ts), [`world/delta.ts`](../src/lib/world/delta.ts))。
6. **记忆**:各角色把**自己见证**的写入观察,周期性**反思**([`memory/`](../src/lib/memory/))。

模型从不直接写世界——它提议,引擎校验。"不能去不存在的房间"这类非法 delta 被丢弃,世界因此**有因果且永不自相矛盾**。

## 4. 世界模型

- **`WorldRules`**(不可变):physics / setting / redLines。
- **`WorldState`**(可变):`currentLocationId`(=玩家/镜头所在)、`time`、`locations`、`objects`、`roster`(含玩家 `you` 的 `condition`)、`flags`、`tension`、`relationships`(fromId→toId→态度短语)、`lore`(`LoreEntry[]`)。
- **`Delta`(10 种)**:`moveCharacter` · `setObjectState` · `setFlag` · `advanceTime` · `setCondition` · `establishObject` · `establishLocation` · `moveScene` · `setRelationship` · `establishLore`。后四类让世界**按需生长**(新地点/新物体/新关系/新正典),呼应 Minecraft 式"按需补细节、结晶为 canon"。
- 类型定义见 [`src/lib/types.ts`](../src/lib/types.ts);delta 校验/应用见 [`world/delta.ts`](../src/lib/world/delta.ts)。

## 5. 子系统

| 子系统 | 当前实现 | 代码 |
|---|---|---|
| **God 引擎** | 角色自决发言(并行意图+选人)、主观记忆+反思、导演(张力/旁白/引入角色) | `src/lib/engine/` |
| **World Reactor** | LLM 提议 delta → 校验 → 落库;玩家身体、可游走空间、社会后果都由此驱动 | `engine/reactor.ts` · `world/delta.ts` |
| **主观记忆** | witness 作用域观察;检索按 `近期×相关×重要`;周期反思成更高层信念 | `src/lib/memory/` |
| **口味引擎** | 行为信号(进入/扎根/创作/快划,衰减)→ 口味模型 → 排序(利用 × ε-探索 × MMR × 防腻)| `src/lib/taste/` |
| **世界生成器** | 条件化(贴合/故意发散避免局部最优)产出完整可玩种子;冷启动跨题材铺开;后台预生成池 | `world/generate.ts` · `world/pregenerate.ts` |
| **Lorebook** | 关键词触发正典注入;`establishLore` 让设定按需结晶 | `world/lore.ts` |
| **展示层** | 冷开场世界卡(genre/mood/intensity/hook/cast/accent);逐字打入;开门转场 | `src/app/page.tsx` · `DoorTransition.tsx` · `world/presentation.ts` |
| **创作/导入** | 创作者世界表单;SillyTavern V2 角色卡(PNG tEXt)导入 | `src/app/create/` · `world/author.ts` · `import/` |

## 6. LLM / BYO-key

- 薄代理 [`src/app/api/llm/chat/route.ts`](../src/app/api/llm/chat/route.ts),OpenAI 兼容(OpenRouter / DeepSeek),SSE 流式。
- key 解析 [`src/lib/llm/resolve-key.ts`](../src/lib/llm/resolve-key.ts):用户在 `/settings` 自填 key(本地 localStorage);**生产环境严格 BYO-key**,env 回退仅 dev;默认/生成世界用用户全局配置,创作者世界用创作者自己的配置。可用性检测 [`llm/test-model.ts`](../src/lib/llm/test-model.ts)。

## 7. 存储

本地优先,IndexedDB via Dexie(库名 `anywhere-door`):instances / messages / memories / seeds / tasteEvents。Repository 接口隔离([`src/lib/storage/`](../src/lib/storage/));测试用 fake-indexeddb。无服务器数据库。

## 8. 技术栈

Next.js 15 (App Router) · React 19 · TypeScript strict · Tailwind CSS 4 · Dexie/IndexedDB · Vitest。`npm test`(322 passing)· `npm run build`。
