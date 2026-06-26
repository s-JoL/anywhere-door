import type { Fact, PressureLine, WorldRules, WorldState } from "../types";

export const DEFAULT_NARRATION_RULE =
  "忠实转述当前已提交事实快照；写短句和可见感官变化，不发明快照外的新实体，不替角色说内心。";

export function resolveNarrationRule(rules?: Pick<WorldRules, "narrationRule">): string {
  return rules?.narrationRule?.trim() || DEFAULT_NARRATION_RULE;
}

function nameFor(state: WorldState, id: string | undefined): string {
  if (!id) return "world";
  return (
    state.roster[id]?.name ??
    state.characters?.[id]?.name ??
    state.objects[id]?.name ??
    state.locations[id]?.name ??
    id
  );
}

function formatFact(state: WorldState, fact: Fact): string {
  return `- ${fact.hardness}:${nameFor(state, fact.entityId)}.${fact.field} = ${fact.value}`;
}

function maySurfaceFactToPlayer(fact: Fact): boolean {
  return fact.playerKnown === true;
}

function formatThread(thread: PressureLine): string {
  if (!thread.playerKnown) {
    return `- unknown pressure (${thread.status}, intensity ${thread.intensity}, not-yet-known)`;
  }
  const known = thread.playerKnown ? "player-known" : "not-yet-known";
  const sign = thread.nextSign ? `; next sign: ${thread.nextSign}` : "";
  return `- ${thread.summary} (${thread.status}, intensity ${thread.intensity}, ${known}${sign})`;
}

export function formatNarrationSourceSnapshot(state: WorldState): string {
  const loc = state.locations[state.currentLocationId];
  const present = (loc?.presentCharacterIds ?? []).map((id) => nameFor(state, id));
  const visibleObjects = (loc?.objectIds ?? [])
    .map((id) => state.objects[id])
    .filter((object) => object && !object.archived)
    .map((object) => `${object.name}${object.state ? `（${object.state}）` : ""}`);
  const facts = (state.facts ?? []).filter(maySurfaceFactToPlayer).slice(-8).map((fact) => formatFact(state, fact));
  const activeThreads = (state.pressureLines ?? [])
    .filter((thread) => thread.status === "active")
    .sort((a, b) => b.intensity - a.intensity)
    .slice(0, 3)
    .map(formatThread);

  return [
    `scene: ${loc?.name ?? state.currentLocationId} (${state.time.clock}, ${state.time.lighting})`,
    `present: ${present.length > 0 ? present.join("、") : "none"}`,
    `visible objects: ${visibleObjects.length > 0 ? visibleObjects.join("、") : "none"}`,
    facts.length > 0 ? `facts:\n${facts.join("\n")}` : "facts: none",
    activeThreads.length > 0 ? `active pressure:\n${activeThreads.join("\n")}` : "active pressure: none",
  ].join("\n");
}
