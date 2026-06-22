import type { WorldSeed, ChatMessage, Message } from "../types";
import type { Repository } from "../storage";
import type { Delta } from "../world/delta";
import { validateDelta, applyDelta } from "../world/delta";
import { buildCharacterPrompt, presentCharacters } from "./prompt";
import { newId } from "../id";
import { nextTime } from "../clock";

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
    const prompt = buildCharacterPrompt(seed, state, speaker);
    prompt.push({ role: "user", content: input });
    const { content } = await llm(prompt);
    const reply: Message = { id: newId("m"), instanceId, role: "assistant", speakerId: speaker.id, content, createdAt: nextTime() };
    await repo.appendMessage(reply);
  }

  await repo.upsertInstance({ ...inst, state, updatedAt: nextTime() });
}
