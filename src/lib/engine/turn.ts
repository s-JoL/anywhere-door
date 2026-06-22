import type { WorldSeed, ChatMessage, Message } from "../types";
import type { Repository } from "../storage";
import type { Delta } from "../world/delta";
import { validateDelta, applyDelta } from "../world/delta";
import { buildCharacterPrompt, presentCharacters } from "./prompt";
import { newId } from "../id";
import { nextTime } from "../clock";
import { scoreMemories } from "../memory/retrieve";
import { keywordsOf } from "../memory/keywords";
import { buildObservations } from "../memory/observe";

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
    // 检索发言者的主观记忆（按当前输入 + 场景关键词）
    const allMem = await repo.listMemories(speaker.id);
    const queryKw = keywordsOf(input);
    const memories = scoreMemories(allMem, queryKw, { topK: 6 });
    // 近段对话历史（最近若干条，去掉本轮刚追加的用户消息以免重复）
    const history = (await repo.listMessages(instanceId)).filter((m) => m.id !== userMsg.id).slice(-8);

    const prompt = buildCharacterPrompt(seed, state, speaker, { memories, recent: history });
    // P1.2: 已注入检索记忆 + 近段对话；P1.3 再叠加导演节奏。
    prompt.push({ role: "user", content: input });
    const { content } = await llm(prompt);
    const reply: Message = { id: newId("m"), instanceId, role: "assistant", speakerId: speaker.id, content, createdAt: nextTime() };
    await repo.appendMessage(reply);

    // 回合后：把"用户这句"和"发言者这句"作为观察写入当前在场角色（witness 作用域）
    const userName = "你";
    for (const obs of buildObservations(state, { speakerName: userName, text: input })) await repo.appendMemory(obs);
    for (const obs of buildObservations(state, { speakerName: speaker.name, text: content })) await repo.appendMemory(obs);
  }

  await repo.upsertInstance({ ...inst, state, updatedAt: nextTime() });
}
