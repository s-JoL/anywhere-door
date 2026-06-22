export interface EngineConfig {
  maxConsecutiveAiTurns: number; // 每条玩家消息后 AI 最多连说几条
  maxSpeakersPerRound: number;   // 每轮最多几个角色发言
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  maxConsecutiveAiTurns: 3,
  maxSpeakersPerRound: 2,
};
