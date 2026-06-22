import type { WorldSeed, ChatMessage, Message } from "../types";
import type { Repository } from "../storage";
import type { Delta } from "../world/delta";
import { validateDelta, applyDelta } from "../world/delta";
import { buildCharacterPrompt, presentCharacters, stripSpeakerPrefix } from "./prompt";
import { decideIntent } from "./intent";
import { selectSpeakers, type Candidate } from "./select";
import { DEFAULT_ENGINE_CONFIG } from "./config";
import { newId } from "../id";
import { nextTime } from "../clock";
import { scoreMemories } from "../memory/retrieve";
import { keywordsOf } from "../memory/keywords";
import { buildObservations } from "../memory/observe";
import { updateTension, maybeDirect } from "./director";
import { offstageCharacterIds, introduceCharacter, introductionBeat } from "./introduce";

export type LlmFn = (messages: ChatMessage[]) => Promise<{ content: string }>;

export interface RunTurnArgs {
  seed: WorldSeed;
  repo: Repository;
  instanceId: string;
  input: string;
  deltas?: Delta[];
  llm: LlmFn;
}

/** 多发言者自由发言回合：用户消息 → 校验并应用 delta → 写用户观察 → 在场角色按意图轮流发言（witness 作用域上下文）。 */
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

  // 用户这句作为观察写给当前在场者（witness 作用域）
  const userName = "你";
  for (const obs of buildObservations(state, { speakerName: userName, text: input })) await repo.appendMemory(obs);

  const config = DEFAULT_ENGINE_CONFIG;
  let budget = config.maxConsecutiveAiTurns;
  let lastSpeakerId: string | null = null;

  while (budget > 0) {
    const present = presentCharacters(seed, state);
    const candidates = present.filter((c) => c.id !== lastSpeakerId);
    if (candidates.length === 0) break;

    // 并行意图判断（各用自身近段观察作上下文）
    const cands: Candidate[] = await Promise.all(candidates.map(async (c) => {
      const recent = (await repo.listMemories(c.id)).slice(-8);
      const intent = await decideIntent({ seed, state, character: c, recent, llm });
      return { id: c.id, ...intent };
    }));

    const sel = selectSpeakers(cands, config.maxSpeakersPerRound);
    if (sel.ids.length === 0) break;

    for (const id of sel.ids) {
      if (budget <= 0) break;
      const speaker = present.find((c) => c.id === id);
      if (!speaker) continue;
      const own = await repo.listMemories(speaker.id);
      const memories = scoreMemories(own, keywordsOf(input), { topK: 6 });
      const recent = own.slice(-8); // witness 作用域：只用该角色自己的观察
      const msgs = buildCharacterPrompt(seed, state, speaker, { memories, recent });
      const { content } = await llm(msgs);
      const clean = stripSpeakerPrefix(speaker.name, content);
      const reply: Message = { id: newId("m"), instanceId, role: "assistant", speakerId: speaker.id, content: clean, createdAt: nextTime() };
      await repo.appendMessage(reply);
      // 该发言作为观察写给当前在场者（含后续发言者，从而看到刚说的话）
      for (const obs of buildObservations(state, { speakerName: speaker.name, text: clean })) await repo.appendMemory(obs);
      lastSpeakerId = speaker.id;
      budget--;
    }
    if (sel.forced) break; // 破冰只破一次，随即交回用户
  }

  // 导演：按本回合最后一句更新张力，必要时插一条世界旁白
  const allMsgs = await repo.listMessages(instanceId);
  const spokenLines = allMsgs.filter((m) => m.role !== "system").slice(-6).map((m) => m.content);
  const lastLine = spokenLines[spokenLines.length - 1] ?? input;
  const tensionBefore = state.tension ?? 0;
  const tensionAfter = updateTension(tensionBefore, lastLine);
  state = { ...state, tension: tensionAfter };
  const beat = await maybeDirect({ instanceId, state, recentLines: spokenLines, tensionBefore, tensionAfter, llm });
  if (beat) await repo.appendMessage(beat);

  // 张力攒高且有幕后角色时，God 拉一个入场制造转折（每回合至多一次）
  if (tensionAfter >= 6) {
    const off = offstageCharacterIds(seed, state);
    if (off.length > 0) {
      const enterId = off[0];
      const enterName = state.roster[enterId]?.name ?? seed.characters.find((c) => c.id === enterId)?.name ?? "某人";
      state = introduceCharacter(state, enterId, state.currentLocationId);
      await repo.appendMessage(introductionBeat(instanceId, enterName));
    }
  }

  await repo.upsertInstance({ ...inst, state, updatedAt: nextTime() });
}
