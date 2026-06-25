/**
 * §4.4 AgentRuntime — explicit character cognition.
 *
 * Each active agent runs perceive (via the §4.2 resolver) → retrieve → decide intent
 * → speak → record observation, with a strictly limited POV. Characters emit prose
 * only; they never mutate durable state and never read omniscient state or
 * out-of-world channels (that isolation rides on the §4.2 perception boundary and its
 * standing assertion). Durable change is the end-of-turn Reactor's job, committed
 * through the WriteGate — not here.
 *
 * This is a behavior-preserving lift of the former inline speaker loop in `runTurn`.
 */

import type { WorldSeed, WorldState, Character, Message } from "../types";
import type { Repository } from "../storage";
import type { EngineConfig } from "./config";
import type { LlmFn, TurnEvent } from "./turn";
import { renderProjection, stripSpeakerPrefix } from "./prompt";
import { resolvePerception } from "./perception";
import { decideIntent } from "./intent";
import { selectSpeakers, type Candidate } from "./select";
import { buildObservations } from "../memory/observe";
import { newId } from "../id";
import { nextTime } from "../clock";

export interface ActiveAgentsArgs {
  seed: WorldSeed;
  state: WorldState;
  repo: Repository;
  instanceId: string;
  input: string;
  llm: LlmFn;
  onEvent?: (e: TurnEvent) => void;
  /** The cast the Director marked active (§4.3); ambient characters are not run here. */
  activeChars: Character[];
  config: EngineConfig;
}

/**
 * Run the active agents' speak loop for one turn. Returns the ids of characters who
 * actually spoke (for end-of-turn reflection). Does not touch world state.
 */
export async function runActiveAgents({
  seed,
  state,
  repo,
  instanceId,
  input,
  llm,
  onEvent,
  activeChars,
  config,
}: ActiveAgentsArgs): Promise<{ speakerIds: string[] }> {
  let budget = config.maxConsecutiveAiTurns;
  let lastSpeakerId: string | null = null;
  const speakerIds: string[] = [];

  while (budget > 0) {
    const candidates = activeChars.filter((c) => c.id !== lastSpeakerId);
    if (candidates.length === 0) break;

    // 并行意图判断（各用自身近段观察作上下文）
    const cands: Candidate[] = await Promise.all(
      candidates.map(async (c) => {
        const recent = (await repo.listMemories(c.id)).slice(-8);
        const intent = await decideIntent({ seed, state, character: c, recent, llm });
        return { id: c.id, ...intent };
      }),
    );

    const sel = selectSpeakers(cands, config.maxSpeakersPerRound);
    if (sel.ids.length === 0) break;

    for (const id of sel.ids) {
      if (budget <= 0) break;
      const speaker = activeChars.find((c) => c.id === id);
      if (!speaker) continue;
      // 单一感知边界(§4.2):角色上下文只经 resolvePerception 产出(witness 作用域:
      // 仅用该角色自己的观察),再交渲染器转成 prompt。记忆检索就发生在边界内。
      const own = await repo.listMemories(speaker.id);
      const projection = resolvePerception({ seed, state, ownMemories: own, query: input }, speaker);
      const msgs = renderProjection(seed, projection);

      const replyId = newId("m");
      onEvent?.({ type: "speaker-start", id: replyId, speakerId: speaker.id, speakerName: speaker.name });
      const { content } = await llm(msgs, (d) => onEvent?.({ type: "delta", id: replyId, text: d }));
      const clean = stripSpeakerPrefix(speaker.name, content);
      onEvent?.({ type: "speaker-end", id: replyId, content: clean });

      const reply: Message = { id: replyId, instanceId, role: "assistant", speakerId: speaker.id, content: clean, createdAt: nextTime() };
      await repo.appendMessage(reply);
      // 该发言作为观察写给当前在场者（含后续发言者，从而看到刚说的话）
      for (const obs of buildObservations(state, { speakerName: speaker.name, text: clean })) await repo.appendMemory(obs);
      if (!speakerIds.includes(speaker.id)) speakerIds.push(speaker.id);
      lastSpeakerId = speaker.id;
      budget--;
    }
    if (sel.forced) break; // 破冰只破一次，随即交回用户
  }

  return { speakerIds };
}
