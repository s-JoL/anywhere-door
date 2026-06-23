# 任意门 / Anywhere Door — 当前技术架构

> 本文描述**当前已实现的技术架构**。产品原则与取舍权威见
> [`../AGENTS.md`](../AGENTS.md);最新整体产品设计见
> [`docs/superpowers/specs/2026-06-24-overall-product-design.md`](superpowers/specs/2026-06-24-overall-product-design.md);
> 从当前实现走向最新产品形态的路线见 [`ROADMAP.md`](ROADMAP.md)。
>
> 如果本文与 `AGENTS.md` 或最新产品 spec 冲突,以更高层产品文档为准;
> 同时需要回头更新本文,让它继续准确反映代码现实。

## 1. 产品形态

一个**移动优先、纯网页**的 AI **私人活体文字世界浏览器**:

- 面前是**无数扇门**。像刷抖音一样**竖滑** feed,每屏一个世界。
- 每张卡是一段**冷开场**(第二人称、悬在最勾人的一刻)——让你**一眼判断**想不想进。
- **推门进入**(开门转场)→ 跨入一个**沉浸的文字世界**:你打字说话/行动,多个角色 + 一个 Director/God 编排层以流式散文回应。
- feed 由**口味引擎**驱动:刷到的门越来越懂你,世界由模型按你的口味**持续生成**,且刻意保持多样性。
- 长玩的世界应进入个人 **Doorway Library**;当前代码已有持久 instance/history 地基,完整产品形态见 ROADMAP。

## 2. 第一性原则

> **权威定义见 [`AGENTS.md`](../AGENTS.md)。** 任意门通往的是一个**真的世界**(因果·持久·后果);**沉浸第一**;**文字只是你与世界交互的形式,不是它的本质**。**门只属于玩家** —— 其余一切(角色/场景/可交互物)都是世界自身展开、细化出来的。个性化 /「认得你」是产品形态层的强力选择,不是第一性。

设计取舍由此推出:
- **交互驱动演化**:世界只在你交互时推进(离开即冻结),零空转成本;回来时通过 `evolveWhileAway` 懒补合理后果,对应产品默认的 **Consequence Mode**。
- **规则不可变 · 状态可变**:世界有一层不可变 `WorldRules`(物理/设定/红线),其上是可变 `WorldState`;LLM 永不直接改状态,只**提议**变化、经校验后落库。
- **自带 key · 本地优先**:平台零推理成本、零数据库;隐私归用户。
- **不设限**:走向由你与模型共同决定。

## 3. 回合循环(核心)

`runTurn`([`src/lib/engine/turn.ts`](../src/lib/engine/turn.ts))一个回合:

1. **离场演化**:玩家回来时,`evolveWhileAway` 按**离开时长**(`Date.now - lastSeenAt`,≥1h 才触发)让 LLM 提议这段时间里合理发生的平静变化(角色挪位/时间推移/物态/关系淡化),经同一 validate/apply/事件日志落库([`world/offscreen.ts`](../src/lib/world/offscreen.ts))。与"交互驱动:离开即冻结"一致——不实时空转,回来才懒补。
2. **意图**:每个在场角色**并行**判断是否开口(speak/pass + 急切度),`selectSpeakers` 取 top-N + 破冰([`engine/intent.ts`](../src/lib/engine/intent.ts), [`select.ts`](../src/lib/engine/select.ts))。
3. **发言**:被选中的角色**流式**说话,prompt 只含其**主观可见**的场景/记忆/关系/lore([`engine/prompt.ts`](../src/lib/engine/prompt.ts))。
4. **导演**:Director/God 更新张力、在**张力跃升(≥1.5)或已在高位(≥7)且仍上行**时插入**旁白**(高位但持平/衰减的回合不插,天然防刷屏)、张力高时**引入幕后角色**([`engine/director.ts`](../src/lib/engine/director.ts), [`introduce.ts`](../src/lib/engine/introduce.ts))。
5. **World Reactor**:LLM 读本回合发生的事(prompt 携带世界**物理 + 红线**作软约束,且**证据优先**:只为近期发言里确已发生的事提议 delta,不为被提及/打算/假设的事写),**提议结构化 `Delta[]`**;每个 `validateDelta`(对照规则:结构/空间 + **红线关键词硬筛** + **空操作丢弃**:状态/体态/锁态没真变的 delta 不落库)→ 合法才 `applyDelta`(不可变更新)→ 落库([`engine/reactor.ts`](../src/lib/engine/reactor.ts), [`world/delta.ts`](../src/lib/world/delta.ts))。
6. **记忆**:各角色把**自己见证**的写入观察,周期性**反思**([`memory/`](../src/lib/memory/))。

模型从不直接写世界——它提议,引擎校验。"不能去不存在的房间"这类非法 delta 被丢弃,世界因此**有因果且永不自相矛盾**。

**感知:角色如何"看到世界"** —— 角色**永不读原始 `WorldState`**,只收到一份**主观投影**([`engine/prompt.ts`](../src/lib/engine/prompt.ts) 的 `buildCharacterPrompt`/`visibleScene`)。看得见:世界观 + 不可变规则、自己的设定/目标/硬事实、**【此刻所见】**(地点、时间、在场他人及其**外显**体态、可见物及状态、玩家外显状态)、**【你记得】**(自己的见证观察 + 反思,按 `relevance × importance × recency` 取 top-k)、**【你此刻的心态】**(自己对**在场**对象的态度)、被在场文本触发的 lore。看不见:他人内心/记忆/秘密目标、不在场的地点/物体/角色、客观全量状态。**信息差是结构性的**:观察只写给当时在场的角色(witness 作用域,[`memory/observe.ts`](../src/lib/memory/observe.ts)),没见证就收不到。

**双向中介** —— 角色对世界既无直接读权、也无直接写权。读 = 上述投影;写 = 角色**只产散文**,散文 →(a)成为在场者的观察;(b)喂给 Reactor → 提议 delta → 校验 → 落库。**角色改变世界的唯一途径,是说/做一件能被 Reactor 翻译成合法 delta 的事。** 回合内发言读的是**回合初的冻结快照**,后果在回合末由 Reactor 一次性落库。这正是 §5 三极(角色片面只读+只写散文 / 导演·Reactor 全知操盘 / WorldState 惰性)的运行态。

**重生成上一条**复用同一回合入口:每次 `runTurn` 会记录回合前的世界状态、消息高水位和记忆高水位;`regenerateLastTurn` 删除上一回合产生的消息/记忆、恢复状态,再用同一输入重跑。重生成因此不会把旧分支的记忆或物态残留进新分支。

## 4. 世界模型

- **`WorldRules`**(不可变):physics / setting / redLines。**红线双层强制**:① 软约束——`physics+redLines` 注入 World Reactor 的 system prompt,提议阶段就规避违规;② 硬兜底——`validateDelta` 对 delta 的自由文本字段(condition/state/lore content/disposition…)做**保守的红线关键词子串筛查**,字面命中即丢弃(散文式整句红线不会误伤合法 delta,语义约束交给软约束层)。
- **`WorldState`**(可变):`currentLocationId`(=玩家/镜头所在)、`time`、`locations`、`objects`、`roster`(含玩家 `you` 的 `condition`)、`flags`、`tension`、`relationships`(fromId→toId→`Relationship` 社会账本)、`lore`(`LoreEntry[]`)。
- **社会因果(CK 式好感账本)**:`Relationship = { affinity, disposition?, evidence[], sinceDay }`——好感是有符号数值(钳 [-100,100]),`evidence` 记**凭什么**,读取时按经过的世界天数**朝 0 线性衰减**(好感会淡、但理由留着)。`setRelationship` 改为**调整式**(`affinityDelta` + `reason` + 可选 `disposition`),纯函数在 [`world/relationship.ts`](../src/lib/world/relationship.ts);角色 prompt 看到的是态度短语/档位(不读裸数字),reactor 看到数值+近因以保持一致。**物品归属即后果**:reactor 物品清单标出物主,拿走他人之物 → 物主疏远取者(`owner` 与社会账本由此打通)。**好感反哺行为(闭环)**:角色对**在场**对象的 |好感| 越强(爱或恨),发言急切度越高([`engine/intent.ts`](../src/lib/engine/intent.ts) `affinityEagernessBoost` 影响选发言者+冷场破冰);关系调整的 `reason`(凭什么)也写入当事人主观记忆([`memory/observe.ts`](../src/lib/memory/observe.ts) `buildSelfMemory`),进入检索与反思。**传话/声誉**:同场 ≥2 个 NPC 把各自最显著的近期**一手观察**口耳相传,在场他人获得降权、去重的 `hearsay`(二手)记忆([`memory/gossip.ts`](../src/lib/memory/gossip.ts),Generative Agents「斯坦福小镇」式自然扩散;二手不再外传,避免套娃)——信息因此能传到不在场者、日后再以二手形式浮现。
- **`Delta`(14 种)**:`moveCharacter` · `setObjectState` · `setFlag` · `advanceTime` · `setCondition` · `establishObject` · `establishLocation` · `moveScene` · `setRelationship` · `establishLore` · `establishCharacter` · `moveObject` · `setObjectLocked` · `fleshLocation`。`establish*` 让世界**按需生长**(新地点/新物体/新关系/新正典/新角色),呼应 Minecraft 式"按需补细节、结晶为 canon"。`fleshLocation` 由引擎触发(不在 reactor 提议词表),仍走 validate/apply。
- **按需充实(stub→fleshed,轴2)**:地点/物体/角色默认 `detail:"stub"`(ambient),被真正engage时才结晶为 `fleshed`。已落地:玩家**首次踏入**一处 stub 地点时,`turn.ts` 钩子调 [`world/flesh.ts`](../src/lib/world/flesh.ts) 按世界观+gist 生成临场 `description` 并发 `fleshLocation` delta(失败降级);因 `visibleScene` 用 `description ?? gist`,充实直接提升临场感。
- **物理因果**:① `moveObject` 让物品在地点间被拿走/递出/搬动并持久落实(改 `locationId` + 两地点 `objectIds`);`props.portable === false` 的固定物**搬不动**。② **上锁的门挡路**:物体可带 `props.gates`(把守通往的地点 id)+ `props.locked`;`validateDelta` 让上锁的门**阻止 `moveScene`/`moveCharacter`** 穿过它通往 gates 指向的地点,`setObjectLocked` 开/关锁(门可由 `establishObject` 当场造出)。因为 `visibleScene` 按 `objectIds` 列「可见物」,物品移动/门的开合**真的改变各角色当下看到的东西**。
- 类型定义见 [`src/lib/types.ts`](../src/lib/types.ts);delta 校验/应用见 [`world/delta.ts`](../src/lib/world/delta.ts)。

## 5. 子系统

| 子系统 | 当前实现 | 代码 |
|---|---|---|
| **Director/God 引擎** | 角色自决发言(并行意图+选人)、主观记忆+反思、导演(张力/旁白/引入角色) | `src/lib/engine/` |
| **World Reactor** | LLM 提议 delta → 校验(结构/空间 + 红线关键词硬筛)→ 落库;prompt 携物理+红线作软约束;玩家身体、可游走空间、社会后果都由此驱动 | `engine/reactor.ts` · `world/delta.ts` |
| **主观记忆** | witness 作用域观察;检索按 `近期×相关×重要`;周期反思成更高层信念 | `src/lib/memory/` |
| **口味引擎** | 行为信号(进入/扎根/创作/快划,衰减)→ 口味模型 → 排序(利用 × ε-探索 × MMR × 防腻:同 id 重惩 + **同题材近期占比软降权**)| `src/lib/taste/` |
| **世界生成器** | 条件化(贴合/故意发散避免局部最优)产出完整可玩种子;冷启动跨题材铺开;后台预生成池 | `world/generate.ts` · `world/pregenerate.ts` |
| **Lorebook** | 关键词触发正典注入 + **递归级联激活**(命中条目的正文再触发它提到的条目→知识图谱式按需展开,受条数/字数预算约束);`establishLore` 让设定按需结晶 | `world/lore.ts` |
| **展示层** | 冷开场世界卡(genre/mood/intensity/hook/cast/accent);逐字打入;开门转场;重生成上一条 | `src/app/page.tsx` · `src/app/play/page.tsx` · `DoorTransition.tsx` · `world/presentation.ts` |
| **创作/导入** | 创作者世界表单;SillyTavern V2 角色卡(PNG tEXt)导入 | `src/app/create/` · `world/author.ts` · `import/` |

## 6. LLM / BYO-key

- 薄代理 [`src/app/api/llm/chat/route.ts`](../src/app/api/llm/chat/route.ts),OpenAI 兼容(OpenRouter / DeepSeek),SSE 流式。
- key 解析 [`src/lib/llm/resolve-key.ts`](../src/lib/llm/resolve-key.ts):用户在 `/settings` 自填 key(本地 localStorage);**生产环境严格 BYO-key**,env 回退仅 dev;默认/生成世界用用户全局配置,创作者世界用创作者自己的配置。可用性检测 [`llm/test-model.ts`](../src/lib/llm/test-model.ts)。

## 7. 存储

本地优先,IndexedDB via Dexie(库名 `anywhere-door`,v5):instances / messages / memories / seeds / tasteEvents / **deltaLog**。Repository 接口隔离([`src/lib/storage/`](../src/lib/storage/));测试用 fake-indexeddb。无服务器数据库。

**混合记录(§6):** 快照(`instance.state`)是当前态的快读;**事件日志**(`deltaLog` 表,`DeltaLogEntry = {turn, source, cause, gameDay, gameClock, at, delta}`)是追加式历史——`turn.ts` 把每条**经校验落库的 delta** 追加一条,标注来源(user/reactor/flesh/offscreen)与触发它的玩家输入。延时回调 / 世界声誉 / 离场演化都读它。

## 8. 技术栈

Next.js 15 (App Router) · React 19 · TypeScript strict · Tailwind CSS 4 · Dexie/IndexedDB · Vitest。常用检查:`npm test` · `npm run build` · `npm run typecheck`。
