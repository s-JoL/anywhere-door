# Seed Contracts — 种子契约样板

> 种子是**生成式契约**,不是内容清单:它给出世界的硬规则、调性引力、开场局部、
> 锚点、半隐压力线、正典真相与展开文法,世界由此「开始时不完整、却像本来就完整地
> 展开」。权威定义见 [`AGENTS.md §5`](../../AGENTS.md) 与
> [`overall-product-design §4`](../superpowers/specs/2026-06-24-overall-product-design.md);
> 第一性推导与选源/IP 策略见
> [`first-principles-synthesis.md` Part 6](../first-principles-synthesis.md)。
>
> 本目录是**设计层样板**(每个原型炫一种引擎强项),不是代码;落到 `WorldSeed`
> 类型是后续单独的实现步骤。

## 选源标准(一句话)

**选「世界值钱」的,别选「情节值钱」的。** 富于派系/秘密/未决因果的世界做种子极好;
情节在轨道上的作品做种子很差。每个样板标注 IP 路线:**[平台原创]** /
**[结构化致敬:来源]**(扒掉商标,借结构/调性,法务安全)/ 用户本地导入则是用户私人
行为,不在本目录。

## 契约字段(模板)

| # | 字段 | 内容 | 映射到引擎 |
|---|---|---|---|
| 1 | **门卡 cold-open** | 门名 · 一句冷开场 · 调性/烈度 · 一条未决张力 · 一个开门动作 | feed 卡(`world/presentation`) |
| 2 | **硬规则 WorldRules** | physics · socialOrder · magicTech · **redLines** · **narration** · **ruleSkills?** | `WorldRules`(不可变) |
| 3 | **调性引力 tonalGravity** | 世界自然滑向的情感/戏剧方向 | Director 节奏/选材偏置 |
| 4 | **开场局部 openingLocality** | 首场景 · 玩家起点+condition · 在场可交互实体 · 一条即时张力 | `openingState`(首回合可玩) |
| 5 | **锚点 anchors** | 初始角色(带私有 POV 种子)· 地点(连通/locked)· 派系·秘密·符号 | `seed.characters` · `locations` · `objects` · `lore` |
| 6 | **压力线 pressureLines** | 2–3 条半隐:世界 / 角色 / 谜题 类型,带 diegetic 迹象 + 公平性 | `state.pressureLines`(结构化)+ Director |
| 7 | **正典账本 canonLedger** | **中枢持有的真相**——角色只有部分视角(谜题世界的「答案」锁在这) | 中枢真相 + `establishLore` 按需结晶 |
| 8 | **展开文法 expansionGrammar** | 新地点/角色/lore 如何从世界自身长出(绝不走玩家的门) | Materializer + `establish*` |

### 两栏新增(由 agent 化世界带来)

- **`narration`(叙述规则)**:世界把真相**转述**成散文的方式。**忠实**为默认;
  **依规则失真**(恐怖/梦境/不可靠现实)是世界设定。
  > 注意:**公平推理(whodunit)必须钉死在「忠实」端**——叙述不能骗玩家硬事实,
  > 否则推理不公平。详见样板 `closed-manor-murder`。
- **`ruleSkills`(可执行规则,可选)**:需要精确裁定的世界(战斗/计分/解谜逻辑/
  小经济),由 **agent 化 Director** 确定性运行,结果作为 delta 过闸门;社会/戏剧
  世界此栏可空。

## 角色私有 POV 种子(锚点角色的最小字段)

每个 agentic 锚点角色携带——这是「信息差是结构性的」的种子:

- `identity` 不可变硬事实 · `goal` 当前目标 · `secret` 不可告人之事
- `初始信念`(可错!)· `初始记忆`(几条高重要度身份/前史,**不含与玩家的共享历史**)

中枢知道全貌;每个角色只知自己见证/推断/听说的。**正典账本里的「答案」绝不进任何
角色的初始知识**——它在中枢,随玩家逼近才显形。

## 原型索引

| 样板 | IP 路线 | 炫的引擎强项 | 状态 |
|---|---|---|---|
| [`closed-manor-murder`](./closed-manor-murder.md) | 结构化致敬:Agatha Christie | 见证作用域 + 秘密 + 信息差 | ✅ 完整样板 |
| `isolated-station` | 结构化致敬:Alien / Firefly | 离场演化 + anchor + 生存压力 | ⬜ 待写 |
| `rotten-precinct-night` | 结构化致敬:Disco Elysium / 真探 | 压力线 + 道德分歧 + 角色POV | ⬜ 待写 |
| `hidden-society` | 结构化致敬:VtM / Dresden | 派系权谋 + lore 按需展开 | ⬜ 待写 |
| `border-zone-drift` | 结构化致敬:STALKER / 魂系 | 按注意力材化 + ambient lore | ⬜ 待写 |
| `slow-town` | 结构化致敬:Twin Peaks | 关系深度 + 回访价值 | ⬜ 待写 |
| `one-night-dungeon` | 平台原创 | **agent 化世界**:战斗/检定确定性计算 | ⬜ 待写(炫 `ruleSkills`) |
