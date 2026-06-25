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
  detail?: "stub" | "fleshed";  // 实例内按需生长的角色：stub 待充实，fleshed 已完整（seed 角色视为 fleshed）
  identity?: Identity;   // 不可变硬事实
  goal?: string;         // 当前目标（被 God 注入主观 prompt）
  systemPrompt?: string;             // 角色覆盖系统前缀（支持 {{original}}）
  postHistoryInstructions?: string;  // 角色覆盖末尾后置强化（支持 {{original}}）
  /** 退场归档(§5.7):置真则从在场名单移除,但记录绝不删除。 */
  archived?: boolean;
}

/** 不可变：世界的"物理法则"，创建后只读。 */
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
  props: { portable?: boolean; locked?: boolean; owner?: string; gates?: string; [k: string]: unknown };
  locationId: string;
  state?: string;
  /** 退场归档(§5.7):置真则从在场/可见中移除,但记录绝不删除。 */
  archived?: boolean;
}

/** 角色的客观事实投影（秘密/内心不在此）。 */
export interface CharObjective { name: string; condition?: string }

/** 一条世界设定 / 世界书条目：keys 命中文本时注入 content（按需生长的永久 canon）。 */
export interface LoreEntry { id: string; keys: string[]; content: string }

/**
 * 一条有向社会关系（CK 式好感账本）：
 * `affinity` 为锚定在 `sinceDay` 那天的好感数值（读取时按过去天数朝 0 衰减）；
 * `evidence` 记录"凭什么"（最近若干条理由）；`disposition` 为可选的可读态度短语。
 */
export interface Relationship {
  affinity: number;       // 有符号好感，钳 [-100, 100]，0 = 中立
  disposition?: string;   // 可选短语，如"记恨在心""戒备松动"
  evidence: string[];     // 凭什么：最近的理由（capped）
  sinceDay: number;       // affinity 锚定的世界日（供朝 0 衰减）
}

/** 可变、按需生长。 */
export interface WorldState {
  currentLocationId: string;
  time: { day: number; clock: string; lighting: string };
  locations: Record<string, Location>;
  objects: Record<string, WorldObject>;
  roster: Record<string, CharObjective>;
  /** 实例私有、按需生长的角色（seed 冻结共享，新角色绝不写回 seed）。 */
  characters?: Record<string, Character>;
  flags: Record<string, string | number | boolean>;
  tension?: number;
  relationships?: Record<string, Record<string, Relationship>>;
  /** 世界书 / canon：关键词触发的永久世界设定，可经 establishLore 按需生长。 */
  lore?: LoreEntry[];
  /** 结构化压力线 / 悬念线(§4.6)。导演读取;只经 thread delta(过写入口)推进。 */
  pressureLines?: PressureLine[];
  /** 硬度分级的事实(§5.1 canon 硬度)。只经 setFact(过写入口)写入。 */
  facts?: Fact[];
}

/**
 * Canon 硬度三档(§5.1):
 * ambient 氛围(可被任何更可信来源改写) · anchored 锚定(reactor/角色不能推翻,
 * 唯 god 编辑可改) · core 内核(世界基石,唯 god 编辑可改)。
 * 事实只在**需要持久、需要校验、或影响未来行为**时才升格,默认保持 ambient。
 */
export type Hardness = "ambient" | "anchored" | "core";

/**
 * 一条分级事实(§5.1)。按 (entityId, field) 唯一:它是该维度"此刻的真相"。
 * 矛盾 = 同 (entityId, field) 不同 value;更硬的事实不可被更软的来源推翻。
 */
export interface Fact {
  id: string;
  entityId?: string;   // 事实关于谁/什么(省略表示世界级事实)
  field: string;       // 维度,如 "location" / "hidden" / "alive"
  value: string;       // 断言的值
  hardness: Hardness;
  sinceDay?: number;   // 该事实确立/最近改写的世界日
}

/** 压力线状态:潜伏 / 活跃 / 已了结。 */
export type ThreadStatus = "latent" | "active" | "resolved";

/**
 * 一条结构化压力线(§4.6 / 架构 §5 压力线)。把"张力"从单一标量升级为可命名、可推进、
 * 可了结的悬念线。`summary` 为玩家可见的安全措辞;强度供导演排序。Phase 0 仅脚手架:
 * 字段与 thread delta 就位,三档精度的离场推进在 Phase 1。
 */
export interface PressureLine {
  id: string;
  summary: string;
  status: ThreadStatus;
  intensity: number;             // 0–10
  relatedCharacterIds?: string[];
  relatedLocationIds?: string[];
  updatedDay?: number;           // 最近一次推进的世界日
  /** 线索类别(如 debt / secret / threat),供导演分类与排序。 */
  kind?: string;
  /** 玩家是否已知情(§5.2 公平:不知情的线不得升到强后果)。 */
  playerKnown?: boolean;
  /** 下一个该让玩家看到的"征兆"(diegetic 提示,非裸数值)。 */
  nextSign?: string;
}

export interface WorldPresentation {
  genre: string;                                // 主类型 chip
  mood: string[];                               // 2–3 调性 chip
  intensity: "calm" | "charged" | "explicit";  // 烈度
  hook: string;                                 // 冷开场: 1–3 句, 第二人称, 结尾悬住
  cast: { name: string; line: string }[];       // 每角色一句: 名+一丝悬念
  accent?: string;                              // 强调色 (hex/rgb/var), 主题化卡片
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
  createdAt?: number;
  source?: "builtin" | "imported" | "created" | "generated";
  presentation?: WorldPresentation;
}

export interface TurnSnapshot {
  input: string;
  state: WorldState;
  messageIds: string[];
  memoryIds: string[];
  createdAt: number;
}

/** 玩家的私有分叉。 */
export interface WorldInstance {
  id: string;
  seedId: string;
  state: WorldState;
  createdAt: number;
  updatedAt: number;
  lastTurnSnapshot?: TurnSnapshot;
  turn?: number; // 已进行的回合数(事件日志归因)
  lastSeenAt?: number; // 玩家上次交互的真实时间戳(Date.now),供离场演化算"离开多久"
  pinned?: boolean; // 玩家把这扇门收进"我的门廊"(Doorway Library)
  /** 离场结算记录(§5.6):退场时派生,供门廊展示与回归 echo。 */
  settlement?: SettlementRecord;
}

/**
 * 离场结算(§5.6):玩家离开时对世界状态的一次有界提炼。
 * - `trace`:已发生且站得住的事(anchored+ 事实 / 玩家造成的改变),玩家安全措辞。
 * - `unresolved`:仍悬而未决的(活跃压力线摘要)。
 * - `candidates`:**可能**的开场(回归时的钩子)——注意是候选,**不是**已落库的事实。
 * - `bond`:某人对玩家态度的变化(回归 echo 不只讲世界,也讲关系)。
 */
export interface SettlementRecord {
  trace: string[];
  unresolved: string[];
  candidates: string[];
  bond?: { who: string; stance: string };
  atDay: number;
}

export interface Message {
  id: string;
  instanceId: string;
  role: ChatMessageRole;
  speakerId: string | null;  // assistant 时 = characterId
  content: string;
  createdAt: number;
  narration?: boolean;
}

/** 每角色主观记忆（借 Generative Agents 的 ConceptNode）。 */
/**
 * 记忆的来源类别(§4.5 / 架构 §5.4 主观记录)。决定可信度与传播规则:
 * witnessed 一手所见 · heard 转述 · inferred 推断/反思 · remembered 回忆 ·
 * revealed 被揭示 · canonized 已固化为正典 · authored 作者注入。
 */
export type Provenance =
  | "witnessed"
  | "heard"
  | "inferred"
  | "remembered"
  | "revealed"
  | "canonized"
  | "authored";

/** 感知质量:完整 / 只见局部 / 失真模糊(§5.4 的"只看到一部分""记错了")。 */
export type PerceptionQuality = "full" | "partial" | "garbled";

export interface Memory {
  id: string;
  charId: string;
  kind: "observation" | "reflection" | "hearsay";
  text: string;
  keywords: string[];     // 写入时抽取，供关键词相关性近似
  importance: number;     // 1–10
  createdAt: number;
  lastAccessed: number;
  /** 反思记忆的来源记忆 id 列表（仅 kind:"reflection" 有值）。 */
  evidence?: string[];
  // ——— §4.5 主观记录字段(均可选;缺省语义 = witnessed / 满置信 / full) ———
  /** 来源类别;缺省视为 "witnessed"。 */
  provenance?: Provenance;
  /** 主观置信度 0–1;缺省视为 1。低置信在检索中更弱地浮现。 */
  confidence?: number;
  /** 叠加在原始事实之上的主观解读(§5.4「误解」)。 */
  interpretation?: string;
  /** 感知质量;缺省视为 "full"。 */
  perceptionQuality?: PerceptionQuality;
  /** 记录与真相的偏离方式(规则扭曲 / 记错)。 */
  distortion?: string;
  /** 该记忆所依据的变更日志条目 id(→ deltaLog),供信念图回溯证据。 */
  evidenceLinks?: string[];
  /** 产生该记忆的世界分支 id(供分支/重生成隔离)。 */
  branchId?: string;
}

export type TasteEventKind = "enter" | "dwell" | "author" | "skip";
export interface TasteEvent { id: string; kind: TasteEventKind; seedId: string; tags: string[]; at: number; }
