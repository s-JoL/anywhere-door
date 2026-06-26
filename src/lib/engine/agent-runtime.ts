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
import type { GuardTrace } from "./trace";
import { renderProjection, stripSpeakerPrefix } from "./prompt";
import { resolvePerception } from "./perception";
import { consistencyGuard, projectionGuardSnapshot } from "./guard";
import { decideIntent } from "./intent";
import { selectSpeakers, type Candidate } from "./select";
import { buildObservations } from "../memory/observe";
import { newId } from "../id";
import { nextTime } from "../clock";

function avoidanceLine(character: Character): string {
  return `${character.name}避开你的目光，没有接话。`;
}

function guardFallbackLine(character: Character): string {
  return `${character.name}沉默了一下，把没出口的话咽了回去。`;
}

async function appendAvoidance({
  character,
  state,
  repo,
  instanceId,
  branchId,
  onEvent,
}: {
  character: Character;
  state: WorldState;
  repo: Repository;
  instanceId: string;
  branchId?: string;
  onEvent?: (e: TurnEvent) => void;
}) {
  const content = avoidanceLine(character);
  const beat: Message = {
    id: newId("n"),
    instanceId,
    role: "system",
    speakerId: null,
    content,
    narration: true,
    createdAt: nextTime(),
  };
  await repo.appendMessage(beat);
  onEvent?.({ type: "narration", id: beat.id, content });
  for (const obs of buildObservations(instanceId, state, { speakerName: "旁白", text: content }, undefined, branchId)) await repo.appendMemory(obs);
}

async function appendGuardFallback({
  character,
  state,
  repo,
  instanceId,
  branchId,
  onEvent,
}: {
  character: Character;
  state: WorldState;
  repo: Repository;
  instanceId: string;
  branchId?: string;
  onEvent?: (e: TurnEvent) => void;
}) {
  const content = guardFallbackLine(character);
  const beat: Message = {
    id: newId("n"),
    instanceId,
    role: "system",
    speakerId: null,
    content,
    narration: true,
    createdAt: nextTime(),
  };
  await repo.appendMessage(beat);
  onEvent?.({ type: "narration", id: beat.id, content });
  for (const obs of buildObservations(instanceId, state, { speakerName: "旁白", text: content }, undefined, branchId)) await repo.appendMemory(obs);
}

export interface ActiveAgentsArgs {
  seed: WorldSeed;
  state: WorldState;
  repo: Repository;
  instanceId: string;
  input: string;
  llm: LlmFn;
  onEvent?: (e: TurnEvent) => void;
  branchId?: string;
  /** The cast the Director marked active (§4.3); ambient characters are not run here. */
  activeChars: Character[];
  config: EngineConfig;
  trace?: GuardTrace;
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
  branchId,
  activeChars,
  config,
  trace,
}: ActiveAgentsArgs): Promise<{ speakerIds: string[] }> {
  let budget = config.maxConsecutiveAiTurns;
  let lastSpeakerId: string | null = null;
  const guardRejectedIds = new Set<string>();
  const avoidanceRenderedIds = new Set<string>();
  let lastForcedGuardRejected: Character | null = null;
  let guardFallbackRendered = false;
  const speakerIds: string[] = [];

  while (budget > 0) {
    const candidates = activeChars.filter((c) => c.id !== lastSpeakerId && !guardRejectedIds.has(c.id));
    if (candidates.length === 0) {
      if (!guardFallbackRendered && lastForcedGuardRejected && speakerIds.length === 0 && avoidanceRenderedIds.size === 0) {
        await appendGuardFallback({ character: lastForcedGuardRejected, state, repo, instanceId, branchId, onEvent });
        guardFallbackRendered = true;
      }
      break;
    }

    // Parallel intent judgment (each using its own subjective observations as context)
    const cands: Candidate[] = await Promise.all(
      candidates.map(async (c) => {
        const ownMemories = await repo.listMemories(instanceId, c.id);
        const recent = ownMemories.slice(-8);
        const intent = await decideIntent({ seed, state, character: c, recent, ownMemories, query: input, llm });
        return { id: c.id, ...intent };
      }),
    );

    const sel = selectSpeakers(cands, config.maxSpeakersPerRound);
    if (sel.ids.length === 0) {
      for (const id of sel.avoidIds ?? []) {
        const avoider = activeChars.find((c) => c.id === id);
        if (!avoider || avoidanceRenderedIds.has(id)) continue;
        await appendAvoidance({ character: avoider, state, repo, instanceId, branchId, onEvent });
        avoidanceRenderedIds.add(id);
      }
      break;
    }

    let spokeThisRound = false;
    let guardRejectedForcedSpeaker = false;
    for (const id of sel.ids) {
      if (budget <= 0) break;
      const speaker = activeChars.find((c) => c.id === id);
      if (!speaker) continue;
      // Single perception boundary (§4.2): character context is produced only via resolvePerception (witness-scoped:
      // using only this character's own observations), then handed to the renderer to turn into a prompt. Memory retrieval happens inside the boundary.
      const own = await repo.listMemories(instanceId, speaker.id);
      const projection = resolvePerception({ seed, state, ownMemories: own, query: input }, speaker);
      const msgs = renderProjection(seed, projection);

      const streamed: string[] = [];
      const { content } = await llm(msgs, (d) => streamed.push(d));
      const clean = stripSpeakerPrefix(speaker.name, content);

      // Projection-level guard (§5.8): character prose can only draw from this
      // character's subjective projection. Buffer streaming until this passes so a
      // rejected leak is not shown in the UI first.
      const guard = consistencyGuard(clean, projectionGuardSnapshot(state, projection));
      if (!guard.ok) {
        trace?.recordGuardRejection({
          surface: "character",
          speakerId: speaker.id,
          slips: guard.slips,
          reason: "projection guard rejected character prose",
        });
        guardRejectedIds.add(speaker.id);
        if (sel.forced) {
          lastForcedGuardRejected = speaker;
          guardRejectedForcedSpeaker = true;
        }
        lastSpeakerId = speaker.id;
        continue;
      }

      const replyId = newId("m");
      onEvent?.({ type: "speaker-start", id: replyId, speakerId: speaker.id, speakerName: speaker.name });
      for (const delta of streamed) onEvent?.({ type: "delta", id: replyId, text: delta });
      onEvent?.({ type: "speaker-end", id: replyId, content: clean });

      const reply: Message = { id: replyId, instanceId, role: "assistant", speakerId: speaker.id, content: clean, createdAt: nextTime() };
      await repo.appendMessage(reply);
      // This utterance is written as an observation to the currently onstage characters (including later speakers, so they see what was just said)
      for (const obs of buildObservations(instanceId, state, { speakerName: speaker.name, text: clean }, undefined, branchId)) await repo.appendMemory(obs);
      if (!speakerIds.includes(speaker.id)) speakerIds.push(speaker.id);
      lastSpeakerId = speaker.id;
      spokeThisRound = true;
      budget--;
    }
    let avoidanceRenderedThisRound = false;
    for (const id of sel.avoidIds ?? []) {
      const avoider = activeChars.find((c) => c.id === id);
      if (!avoider || speakerIds.includes(id) || avoidanceRenderedIds.has(id)) continue;
      await appendAvoidance({ character: avoider, state, repo, instanceId, branchId, onEvent });
      avoidanceRenderedIds.add(id);
      avoidanceRenderedThisRound = true;
    }
    if (sel.forced) {
      if (spokeThisRound || avoidanceRenderedThisRound) break; // break the lull only once, then hand back to the user
      if (guardRejectedForcedSpeaker) continue; // try the next-best pass candidate before falling silent
      break;
    }
  }

  return { speakerIds };
}
