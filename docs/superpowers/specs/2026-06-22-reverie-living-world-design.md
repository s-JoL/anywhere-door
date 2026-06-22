# 浮生 / The Reveries — 活体文字世界 · 设计方案

- **日期**: 2026-06-22
- **状态**: 设计中(待用户复核 → writing-plans）
- **一句话**: 一个移动优先的纯网页 AI **活体文字世界**——像刷抖音一样竖滑发现"世界",滑进一个就 fork 成你私有的实例长驻沉浸；一个 **God 引擎**维护结构化世界、扮演生成式导演,只在你交互时推进世界、为每个角色维护主观认知、把控戏剧节奏、并在创作者设定的框架内自主引入新角色/事件。
- **定位**: **全新独立项目，从零开始**；Speakeasy / 私酿馆（角色扮演群聊）保持不动，仅作为**参考来源之一**（连同已 clone 的开源项目）。
- **命名**: 中文 **浮生**，英文 **The Reveries**。三重契合——「浮生若梦」的意境；《西部世界》里让接待员获得记忆/走向觉醒的核心更新正是 "the reveries"（中文字幕译作"冥想/遐思"）；且恰好是 Stanford Generative Agents 代码库的内部代号（`reverie/backend_server/`）。

---

## 1. 愿景与定位

聊天只是表层形式，**实质是文字冒险 / 沉浸式模拟**：现实世界有的，文字世界要有对应物。参考成熟开放世界（Minecraft、GTA、RimWorld、沉浸式模拟）的做法，把"一个完整的世界"以**文字**保存状态、演化并呈现。

### 三层结构（理解全局的骨架）

| 层 | 体感 | 是什么 |
|---|---|---|
| **发现层** | lean-back 快消费 | 抖音式竖滑，刷的是**一个个"世界的钩子/开场卡"**（不是整个世界） |
| **世界层** | lean-in 慢沉浸 | 滑中一个就进入 → **fork 成私有实例** → 长驻地玩 |
| **创造层** | 生产 | 创作者 / 系统 / 用户自己造世界，产出统一的 **WorldSeed（世界种子）** 喂给发现层 |

### 核心循环
刷钩子（尝鲜）→ 进入（fork 私有实例）→ 交互推进（**说话 + 行动**，God 当世界导演）→ 扎根长驻。**冷启动靠 AI 批量造种子铺满 feed，后期靠创作者补充。**

### 定位（已锁定）
- **完全不设限**：整站不设限（保留基线红线：排除未成年人等违法内容；该约束已在默认 RP 预设里写死）。
- **纯网页 / PWA、移动优先**：不上架原生应用商店，因此不受商店内容政策约束。
- **自带 key（BYO-key）贯穿全程**：玩家玩默认/AI 世界用自己配的模型+key；创作者世界**随世界附带"模型配置"，玩家仍用自己的 key**（见 §9）。→ **平台零推理成本**。

---

## 2. 关键决策记录

| 决策 | 选择 | 理由 |
|---|---|---|
| 产品形态 | TikTok 式发现 + 活体文字世界 | 用户核心愿景；区别于 1v1/群聊卡片 |
| 核心循环 | 混合：冷启动 AI 生成世界铺量，进入后长驻 | 兼顾"刷"的新鲜与"住"的深度 |
| 实例模型 | 单人实例；**共享种子 + 私有分叉**；玩家间互不影响 | 像抖音交互式视频；成本可控；架构留 C（轻量异步涟漪）口 |
| 演化时机 | **只在玩家交互时推进，离开即冻结** | 杀掉 24/7 后台仿真这个成本黑洞（AI Town 的头号教训） |
| 世界真相 | **规则不变 + 状态可变 + 按需生长固化** | 沉浸式模拟范式；Minecraft 种子+区块+存档 |
| 角色认知 | **主观局部认知**，非全知 | Generative Agents / AI Town；产生信息差、秘密、八卦、戏剧反讽 |
| 发言调度 | 沿用 Speakeasy 的自主发言引擎（LLM 自己判断说/不说） | 比 SillyTavern 掷骰 / Agnai 手选更"活"，是核心差异化 |
| 导演（God） | 生成式 AI 导演：节奏 + 在创作者框架内造角色/事件 | 开源生态的空位；借 L4D / RimWorld / Façade |
| 成本/定位 | 完全不设限 + 纯网页 + BYO-key | 平台零推理成本；不碰商店审核 |
| 创作者世界推理 | (ii) 配置随世界走 + 玩家自带 key | 纯客户端、创作者零成本、无 key 泄露/滥用；上云后再加自费畅玩 |
| 存储 | 本地优先 IndexedDB（沿用仓储接口）+ 轻量种子目录服务 | 推理走客户端薄代理；只有种子（纯数据）需要服务端共享 |
| 兼容 | 兼容手动造世界（Speakeasy 式）+ SillyTavern/V2 卡导入 | 降迁移成本、吃存量用户 |
| 呈现 | 文字 now；图片（与 God 紧耦合）/视频/语音留接口 | 渐进；图片由世界状态驱动锁形象一致 |

---

## 3. 设计借鉴（显式对照）

每个核心设计都标注其来源，便于实现时回查原方案。

| 设计点 | 借鉴自 | 关键招 |
|---|---|---|
| 角色卡 / lorebook / persona / V2 导入 | **SillyTavern / RisuAI** | V2 卡（PNG 内嵌 JSON）、World Info 分层注入、character book |
| 本地优先 + 多 provider + 薄代理 | **RisuAI / 现有 Speakeasy** | 跨端本地存储；OpenAI 兼容统一抽象 |
| 单 LLM 调用 / 轮 + prompt 缓存 | **Character.AI** | 95% 前缀缓存、单前向、cache-aware 截断 |
| 自主发言（LLM 判断说/不说） | **现有 Speakeasy engine/** | 并行意图判断 + 破冰兜底（强于 ST 掷骰、Agnai 手选） |
| 结构化世界模型 + LLM 当解析器非数据库 | **Inform7 / MUD** | 房间图 + 对象 + 属性 + 规则；LLM 提议→引擎校验→落库→叙述 |
| 不持久即失忆的反面教材 | **AI Dungeon** | 生成即固化为正典，避免"上一幕死敌这一幕陌生人" |
| 种子确定性 + 区块按需生成分阶段 + 存档改动 + 模拟/渲染距离 | **Minecraft** | 共享种子；stub→细化；只存 delta；LOD 三档 |
| AI 导演节奏（张力 + 四态机 + 强制松弛） | **Left 4 Dead AI Director** | 调频率非难度；"粗糙张力估计就够好" |
| 事件预算 + 叙事人格（稳/缓/乱） | **RimWorld AI Storyteller** | 由世界状态推导事件预算；性格旋钮 |
| 需求驱动的廉价自主（对象"广告"动作） | **The Sims 效用 AI** | 概率取优而非永远最优；LLM 只叙述被选动作 |
| 保护玩家剧情线（yes-and） | **The Sims** | 自主角色偏向延续而非推翻玩家起的线 |
| 一致规则集统一施加；系统化属性 | **沉浸式模拟（Deus Ex/Dishonored）** | 涌现来自规则而非脚本化状态 |
| 局部认知 + 记忆流（recency×importance×relevance）+ 反思 | **Generative Agents / AI Town** | 每角色主观知识；廉价检索；重要性阈值触发反思 |
| 分层记忆 + 核心块 + 异步整理（睡眠期） | **MemGPT/Letta + Mem0** | always-injected 核心块；离场时整理（增删改） |
| 多角色 + 真人同房（留作 C） | **Agnai** | 统一动作通道、实时同步（P3 上云时参考） |
| 世界观映射（接待员/叙事/showrunner/乐园/游客/觉醒） | **西部世界 Westworld** | host=主观记忆角色；narratives/loops=God 的 beat；Ford=God；reveries=记忆即灵魂 |
| **导演 = 类型化干预 API**（改世界事实/植入记忆/旁白/造角色/拦截对白） | **AgentSociety** | 把 God 做成"工作流上的干预动词"，而非另一个聊天 agent |
| 叙事时钟（按故事节拍走，非墙钟）+ guardrail(可信度1–5) + query(情绪探针) + 纯拉取零空转 | **Eastworld** | 契合"只在交互时演化"；廉价数值探针让导演"先读后写" |
| witness 作用域事件（只记能感知的）= 廉价主观记忆 | **GPTeam** | 事件带 `witnessIds`，按目击者过滤 → 天然主观 |

---

## 4. 系统架构

### 7 个子系统（各一职责）

| | 子系统 | 唯一职责 |
|---|---|---|
| **S1** | 世界模型 | 规则（不变）+ 冻结种子态 + 按需生长的状态画布（生成即固化）+ LOD |
| **S2** | 认知与记忆 | 每角色主观知识 + 情节记忆 + 核心块 + 异步整理 + 衰减 |
| **S3** | God 引擎（导演 + 回合循环） | 交互驱动回合：感知 → 节奏评估 → 选发言者 → 生成 → 校验落库 → 投 beat/造角色 → 整理 |
| **S4** | 渲染层 | 世界状态 + 旁白 → 媒介（文字 now；图片/视频/语音接口） |
| **S5** | 世界种子 / 创作与导入 | 造世界（世界观+关键角色+红线+模型配置）；创作者/手动/AI/ST 导入 → WorldSeed |
| **S6** | 发现 feed / 实例化 | 竖滑世界流；进入即 fork 私有实例；扎根 |
| **S7** | 平台（存储+模型+成本） | 本地仓储抽象 + 模型代理 + prompt 缓存 + 杂活档 + LOD（多沿用 Speakeasy） |

**依赖**：S1+S2 地基 → S3 架其上（用 S1/S2/S7）→ S4 读 S1/S3 → S5 产种子初始化 S1/S2 → S6 是 S5 之上的入口壳 → S7 托底。

---

## 5. S1 · 世界模型（详设）

心智模型：**① 不可变规则（锚）+ ② 冻结的共享种子态（人人开场相同）+ ③ 按需生长的 canon（生成即固化、LOD 分级、每实例只存 delta）**。

### 5.1 规则层（不可变，创建时定）
```ts
interface WorldRules {            // 世界的“物理法则”，游玩中永不改变
  physics: string;               // 物理/逻辑法则：什么可能/不可能（魔法?科技年代?能否死亡/复活?）
  setting: string;               // 设定常量：年代/地点/genre
  redLines: string[];            // 红线（平台基线 + 创作者追加）
  // 角色硬事实挂在 Character.identity.hardFacts（已存在：性别/身体等不可动摇设定）
}
```

### 5.2 种子层（冻结、共享、人人相同）
```ts
interface WorldSeed {
  id; title;
  hook: string;                  // feed 钩子/开场卡文案（“封面+前几秒”）
  worldview: string;             // 世界观大纲
  rules: WorldRules;
  openingState: WorldState;      // 冻结的开场态（预生成一次 → 所有玩家相同）
  keyCharacters: Character[];    // 创作者定义的关键角色
  modelConfig: ModelConfig;      // 推荐模型/参数（玩家自带 key 填充）
  directorPersona: 'steady' | 'calm' | 'chaotic';
  source: 'creator' | 'ai-generated' | 'personal';
  visibility: 'public' | 'unlisted' | 'private';
}
```
> **关键**：因为 LLM 生成不可确定复现（不像 Minecraft 的 PRNG），"人人初始相同"靠**预生成一次并冻结** `openingState`，而非每人重跑模型。

### 5.3 状态层（可变、按需生长、生成即固化）
```ts
interface WorldInstance {        // 一个玩家的私有分叉
  id; seedId; ownerId;
  state: WorldState;             // 当前真相 = 物化(冻结种子态 + 本实例 delta)
  createdAt; updatedAt;
}

interface WorldState {
  currentLocationId: string;
  time: { day: number; clock: string; lighting: string };
  locations: Record<string, Location>;
  objects: Record<string, WorldObject>;
  roster: Record<string, CharObjective>;   // 客观事实（角色的秘密/内心存其定义里，不在此）
  flags: Record<string, string | number | boolean>;
  tension: number;                          // 导演张力值
  pacingState: 'buildup' | 'sustain' | 'fade' | 'relax';
  lastBeatTurn: number;                     // 上次大事件回合（算事件预算）
}

interface Location {
  id; name;
  detail: 'stub' | 'fleshed';    // 详略档：stub=一行 gist；fleshed=已细化
  gist: string;
  description?: string;
  connections: string[];
  presentCharacterIds: string[];
  objectIds: string[];
}

interface WorldObject {
  id; name;
  detail: 'stub' | 'fleshed';
  props: { portable?: boolean; locked?: boolean; owner?: string; container?: boolean; [k: string]: unknown };
  locationId: string;
  state?: string;
}
```

### 5.4 按需细化（inflate）+ 固化 + LOD
- **stub → fleshed**：玩家/角色聚焦某处（进房间、开抽屉、角色登场）才让 LLM **即时细化**，且受规则 + 世界观 + 已确立相邻事实约束。
- **生成即固化**：新细节写回 `state` 变成永久正典，之后每回合重注入 → 永不自相矛盾（修复 AI Dungeon 失忆）。
- **LOD 三档**（借 Minecraft 模拟/渲染距离）：
  - **Live**：当前场景 — 全 LLM 模拟、角色活动；
  - **Loaded-inert**：邻近已知 — 可引用、不主动生成；重访时一句廉价摘要补叙；
  - **Dormant**：远处 stub — 不实例化，靠近才充气。
- **存储**：每实例只存相对冻结种子态的 **delta**（海量实例也便宜）。

---

## 6. S2 · 主观认知与记忆（详设）

### 6.1 主观局部认知（"更强的不全知"）
- **客观真相** = S1（世界）+ 各角色完整定义（含秘密、内心目标）。
- **每角色认知库**：只装它**亲历 / 被告知 / 推断**的事；**别人的秘密默认不进**。
- **生成某角色台词时，prompt 只喂"它知道的"**（核心块 + 检索到的记忆 + 它当前能感知的世界状态），**绝不喂全局真相** → 天然支持秘密、说谎、信息差、戏剧反讽、八卦传播（A 告诉 B，这条才进 B 的库）。
- **实现机制（借 GPTeam）**：世界事件带 `witnessIds`（谁能感知），写入角色认知流时按目击者过滤 → "只记得自己能感知到的"几乎免费实现。
- **耳语 / 独处**（Speakeasy 已有）收编为"感知可见性"的特例。

### 6.2 记忆结构（借 Generative Agents + MemGPT）
```ts
interface CharKnowledge {
  charId: string;
  coreBlock: string;       // 缓存：身份 + 当前目标 + 已知关键关系（每回合必注入）
}
interface Memory {          // 借 Generative Agents 的 ConceptNode
  id; charId;
  type: 'event' | 'thought' | 'chat';
  spo?: [string, string, string];   // 主-谓-宾三元组（可结构化检索）
  text: string;                       // 自然语言描述
  createdAt: number;
  lastAccessed: number;
  importance: number;                 // poignancy 1–10，写入即由廉价模型评分并缓存
  keywords: string[];                 // 倒排索引，便宜的一次召回
  filling: string[];                  // 证据/出处：本条由哪些记忆推得（反思可追溯）
  // embedding?: number[];            // 见 6.3 取舍
}
```
- **检索打分（照搬 Generative Agents 实测公式）** = 三项各 min-max 归一到 [0,1] 后加权：**`0.5·recency + 3·relevance + 2·importance`**（relevance 主导），取 top-k（默认 30），且**检索即刷新 `lastAccessed`**；recency = `0.99 ^ 按时序的名次`。
- **核心块**（MemGPT）：每角色缓存身份/目标/关系，每回合必注入；可设只读/跨角色共享（如两人共享的关系块）。

### 6.3 务实取舍（P1）
- 本地优先下 embedding 不便：**P1 的 relevance 先用关键词 + 近窗近似**，留干净接口，P3 上云后换向量。
- **整理/反思（异步、便宜）**：在**回合间 / 离开时**跑（不是 24/7）——摘要、抽取 durable 事实、按重要性阈值反思（借 Letta sleep-time + Mem0 增删改 + GA 反思）。

---

## 7. S3 · God 引擎：交互驱动的导演循环（详设）

泛化现有 `runGroupTurn`。**每次玩家动作触发一回合**：

1. **感知**：解析玩家输入（说话 + 行动）→ 提议 delta → §8 规则校验 → commit；给在场角色认知流写观察（主观）。
2. **导演评估（节奏，借 L4D + RimWorld）**：更新**张力值**（冲突/停滞/情绪信号）→ 跑四态机（铺垫→维持高峰→回落→**强制松弛**）→ 由"事件预算"（世界状态 + 距上次大事件回合 + 叙事人格）决定**这回合 God 要不要投一个 beat**（事件 / 环境变化 / 造新角色）。用便宜杂活档 gate；遵守 yes-and（不推翻玩家正走的线）。
3. **选发言者（复用 engine/）**：哪些在场角色发言、顺序；各走**主观 prompt**（§6）。并行意图（便宜）→ 选取 → 生成（好模型 + 缓存共享前缀）。
4. **生成 + 落库 + 叙述**：每条生成可附带动作 delta → §8 校验 → commit → 对可见变化出旁白。
5. **投 beat（若第 2 步决定）**：God 生成 beat —— 环境/事件，**或空降新角色**（从创作者关键角色池 **或** 世界观内生成：身份 + 目标 + 关系 + 登场旁白；过红线/规则校验；落入 roster + 场景 + 建 S2 认知库）。
6. **整理（回合间/离开）**：便宜反思 + 摘要 + delta 持久化。

连续发言预算、人类随时打断（Speakeasy 已有）继续生效。

### God = 类型化干预 API（借 AgentSociety，非"另一个聊天 agent"）
把 God 的能力做成一组**干预动词**，而不是让它用自然语言"扮演导演"：
- `changeWorldFact`（改场景/时间/世界事实）、`plantMemory`（往某角色认知库植入信念/秘密——**作为"它目击到的事件"注入，不是可见的 system 字符串**）、`whisper`（以命运/旁白对某角色私语）、`spawnCharacter`（造新角色，**一等公民操作**：身份+目标+关系+登场+建认知库+接 witness）、`interceptDialogue`（改/挡角色间对白）。
- 所有动词都过 §8 的规则/红线校验。

### 导演"先读后写"（借 Eastworld 的 `query`）
投 beat 前，用**廉价数值探针**读当前态（如"张力=4""某角色怀疑度=5"），据此决定要不要投、投什么——比每回合重新总结整个世界便宜得多。

### 叙事时钟（借 Eastworld，非墙钟）
时间按**故事节拍**走（stage/major/minor），不是真实秒——天然契合"只在交互时演化"：玩家行动才推进，记忆衰减也按故事进度算。

### guardrail：可信度门（借 Eastworld）
玩家/角色输入先过一个"这个角色/这个世界**可能**发生这事吗"的 1–5 打分，挡掉穿帮/越狱式输入（与 §8 规则校验互补）。

### 交互模型（统一通道，借 AI Town）
玩家**自由文字（说话 + 行动）**与角色/God **走同一个通道**：`意图解析 → 按规则结算 → 改/扩状态 → 叙述`。不是纯聊天，也不是死板的指令解析器。

---

## 8. 错误处理与一致性

- **delta 解析失败** → 安全回退（不改状态，仅叙述），沿用现有 safe-pass/gate 容错。
- **delta 非法**（违规则/红线/角色硬事实）→ **拒绝或修正**（"你没法凭空飞起来"；现有 RP 预设已含"玩家超能力尝试可失败"）。
- **模型错误** → 复用现有重试/继续/停止。
- **一致性锚**：**规则层每回合重注入**（不变锚）；**已固化 canon 每回合重注入**（防漂移）；S1 是唯一真相，模型漂移由重注入纠正。

---

## 9. 成本、模型与存储

- **BYO-key**：玩家玩默认/AI 世界用自己的 key；**创作者世界 = 配置随世界走（`modelConfig`）+ 玩家自带 key**（方案 ii）。平台零推理成本。
- **模型连通测试**（新需求）：配置 key/模型后可一键验证可用性（Speakeasy 现缺）。
- **热路径成本**：每个发言角色 1 次缓存 prose 调用 + 便宜 gate；导演评估/造角色/整理/细化走**杂活档**（廉价模型）；离场走 LOD。
- **避坑（clone 实读所见）**：① embedding 必须**按内容哈希缓存**（Generative Agents 每次都重嵌入，是最大可避免成本）；② 检索别对全量记忆算矩阵乘——先关键词/倒排召回再算相关性；③ 别像 GPTeam/AgentSociety 那样每 tick 跑全体 agent——我们"只在交互时、只跑在场角色"正是对此的修复；④ 事件日志之外要有一份**权威世界状态对象**（谁拿了钥匙/谁死了这类硬事实别只靠事件流）。
- **prompt 缓存**：共享前缀（规则 + 世界观 + 角色卡 + 已固化 canon）缓存，风格/末轮指令贴末尾（沿用 Speakeasy 现有做法）。
- **存储分层**：
  - **客户端（本地优先 IndexedDB，沿用仓储接口）**：玩家的 WorldInstance（delta）、key、设置、记忆。
  - **轻量种子目录服务（P3）**：发布/浏览 WorldSeed（**纯数据**，不碰推理）。推理永远 客户端→薄代理→provider。

---

## 10. 与 Speakeasy 的关系（参考来源，非迁移）

> **全新代码库，从零搭建。** Speakeasy 不改动；下表是"从 Speakeasy 借鉴/重写哪些已验证的模块与思路"，作为新项目的实现参考（连同 §3 的开源项目）。

| Speakeasy 既有 | 新项目里怎么做 |
|---|---|
| `Conversation` | `WorldInstance`（+ seedId、规则、叙事人格） |
| `WorldState`（自由文字快照） | 结构化 S1（locations/objects/flags/roster + 详略档 + LOD） |
| `world/director.ts` | S3 世界更新器（输出**类型化 delta + 校验**） |
| `engine/`（intent/select） | S3 选发言者，复用 |
| `chat/compaction.ts` | S2 整理层（加每角色记忆流 + 检索） |
| `lib/llm/*`、`/api/llm` 薄代理、杂活档、prompt 缓存 | S7 沿用 + 泛化 |
| 角色/对话创建 UI | S5 "个人私房世界"authoring |
| 文生图 `buildScenePromptFromWorld` | S4 图片渲染器（世界状态→画面），已有雏形 |
| **新增** | S2 主观认知库 + 检索；S3 节奏导演 + 造角色；delta 校验；S5 创作者/ST 导入；S6 feed + fork；模型连通测试 |

---

## 11. 分期路线

| 期 | 名称 | 内容 |
|---|---|---|
| **P1** | 灵魂：单世界 God 引擎 | S1（规则/冻结种子态/按需生长固化）+ S2（主观认知/记忆）+ S3（导演循环/节奏/造角色）+ S4 文字渲染 + 模型连通测试。在**手动创建的单世界**跑通，本地优先。**差异化全在这里——先证明活世界好玩且自洽。** |
| **P2** | 造世界：创作 + 导入 | S5：创作者模式（世界观+关键角色+红线+modelConfig）、手动造世界、ST·V2 卡 + lorebook 导入 → WorldSeed |
| **P3** | 发现：feed + 实例 + 上云 | S6 抖音式世界流 + 进入 fork + 扎根；轻量种子目录服务（账号 + 种子共享） |
| **P4** | 富化 + 盈利 | 图片（God 耦合）打磨、视频/语音接口、创作者自费畅玩（服务端代理）、轻量异步跨玩家涟漪（C 口） |

**第一个实现计划锁定 P1。**

---

## 12. 测试策略（延续 Speakeasy 的纯函数测试风格）
- **单测**：张力状态机、事件预算、选发言者（已有）、**delta 校验**、记忆检索打分、**感知可见性过滤**、按需细化触发。
- **集成**：脚本化世界 + 固定 LLM 回复 → 断言状态正确演化、**秘密不泄漏**、**造角色守红线**、固化后不自相矛盾。

---

## 13. 非目标（YAGNI / 以后再说）
- 24/7 后台世界仿真（已明确作废：只在交互时演化）。
- 实时多人共处一世界（P4 才考虑轻量异步涟漪；强实时不做）。
- 向量记忆（P1 用近似，P3 上云再上）。
- 视频/语音实现（仅留接口）。
- 平台统一付费/订阅（坚持 BYO-key）。
- 原生 App / 应用商店上架。

---

## 14. 开放问题（实现阶段确认）
- 世界规则 `physics` 用纯自然语言、还是部分结构化约束（影响 delta 校验能多严格）。
- 按需细化的"触发粒度"（聚焦到什么程度才 inflate）与缓存策略，需真实模型上调。
- 张力信号怎么估（哪些事件加/减、衰减系数）——按 L4D"粗估即可"起步，再调。
- 造新角色的频率与"yes-and"护栏强度，需真实游玩手感校准。
- delta 表达 + 校验的最小可用形态（P1 先支持哪几类：移动/改对象状态/置 flag/推进时间/造角色）。
