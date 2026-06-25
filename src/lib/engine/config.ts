export interface EngineConfig {
  maxConsecutiveAiTurns: number; // 每条玩家消息后 AI 最多连说几条
  maxSpeakersPerRound: number;   // 每轮最多几个角色发言
  maxActiveAgents: number;       // 一回合最多几个角色跑完整 agent 回路(其余为 ambient 群演)
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  maxConsecutiveAiTurns: 3,
  maxSpeakersPerRound: 2,
  maxActiveAgents: 4,
};
