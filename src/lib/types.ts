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
}

/** 角色的客观事实投影（秘密/内心不在此）。 */
export interface CharObjective { name: string; condition?: string }

/** 一条世界设定 / 世界书条目：keys 命中文本时注入 content（按需生长的永久 canon）。 */
export interface LoreEntry { id: string; keys: string[]; content: string }

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
  relationships?: Record<string, Record<string, string>>;
  /** 世界书 / canon：关键词触发的永久世界设定，可经 establishLore 按需生长。 */
  lore?: LoreEntry[];
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
export interface Memory {
  id: string;
  charId: string;
  kind: "observation" | "reflection";
  text: string;
  keywords: string[];     // 写入时抽取，供关键词相关性近似
  importance: number;     // 1–10
  createdAt: number;
  lastAccessed: number;
  /** 反思记忆的来源记忆 id 列表（仅 kind:"reflection" 有值）。 */
  evidence?: string[];
}

export type TasteEventKind = "enter" | "dwell" | "author" | "skip";
export interface TasteEvent { id: string; kind: TasteEventKind; seedId: string; tags: string[]; at: number; }
