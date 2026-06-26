import type { Fact, Memory, WorldInstance } from "../types";
import type { DeltaLogEntry } from "../world/delta";
import { assembleBeliefGraph } from "../engine/belief";

export interface StudioInspectorSnapshot {
  locationName: string;
  presentCharacters: { id: string; name: string }[];
  directorNotes: string[];
  sceneContract: string | null;
  facts: { id: string; label: string; hardness: Fact["hardness"] }[];
  pressureLines: { id: string; summary: string; status: string; intensity: number; playerKnown: boolean }[];
  recentDeltas: { id: string; turn: number; source: string; kind: string; cause: string }[];
  beliefs: { observerId: string; observerName: string; factId: string; factLabel: string; stance: string; confidence: number; evidenceText?: string }[];
}

export interface BuildStudioInspectorArgs {
  instance: WorldInstance;
  memories: Memory[];
  deltaLog: DeltaLogEntry[];
}

function nameOf(instance: WorldInstance, id: string): string {
  return instance.state.roster[id]?.name ?? instance.state.characters?.[id]?.name ?? id;
}

function factLabel(fact: Fact): string {
  return `${fact.entityId ? `${fact.entityId}.` : ""}${fact.field} = ${fact.value}`;
}

export function buildStudioInspector({ instance, memories, deltaLog }: BuildStudioInspectorArgs): StudioInspectorSnapshot {
  const { state } = instance;
  const loc = state.locations[state.currentLocationId];
  const presentIds = loc?.presentCharacterIds ?? [];
  const memoriesByObserver: Record<string, Memory[]> = {};
  for (const id of presentIds) memoriesByObserver[id] = memories.filter((m) => m.charId === id);

  const facts = state.facts ?? [];
  const beliefEdges = assembleBeliefGraph({ facts, observers: presentIds, memoriesByObserver });

  return {
    locationName: loc?.name ?? state.currentLocationId,
    presentCharacters: presentIds.map((id) => ({ id, name: nameOf(instance, id) })),
    directorNotes: (instance.directorNotes ?? []).slice(-3).map((note) => note.text),
    sceneContract: instance.sceneContract?.text ?? null,
    facts: facts.slice(-8).map((fact) => ({ id: fact.id, label: factLabel(fact), hardness: fact.hardness })),
    pressureLines: (state.pressureLines ?? []).slice(0, 5).map((line) => ({
      id: line.id,
      summary: line.summary,
      status: line.status,
      intensity: line.intensity,
      playerKnown: line.playerKnown ?? false,
    })),
    recentDeltas: deltaLog.slice(-6).reverse().map((entry) => ({
      id: entry.id,
      turn: entry.turn,
      source: entry.source,
      kind: entry.delta.kind,
      cause: entry.cause,
    })),
    beliefs: beliefEdges.map((edge) => {
      const fact = facts.find((candidate) => candidate.id === edge.factId);
      const evidenceText = memories.find((memory) => memory.id === edge.evidence[0])?.text;
      return {
        observerId: edge.observerId,
        observerName: nameOf(instance, edge.observerId),
        factId: edge.factId,
        factLabel: fact ? factLabel(fact) : edge.factId,
        stance: edge.stance,
        confidence: edge.confidence,
        ...(evidenceText ? { evidenceText } : {}),
      };
    }),
  };
}
