import type { WorldSeed, WorldState, Character, ChatMessage } from "../types";

export function presentCharacters(seed: WorldSeed, state: WorldState): Character[] {
  const loc = state.locations[state.currentLocationId];
  if (!loc) return [];
  return loc.presentCharacterIds
    .map((id) => seed.characters.find((c) => c.id === id))
    .filter((c): c is Character => !!c);
}

/** 该角色**主观可见**的当前场景描述（不含他人内心/秘密）。 */
function visibleScene(state: WorldState): string {
  const loc = state.locations[state.currentLocationId];
  const others = loc.presentCharacterIds.map((id) => state.roster[id]?.name ?? id).join("、");
  const objs = loc.objectIds.map((id) => state.objects[id]?.name).filter(Boolean).join("、");
  return [
    `地点：${loc.name}——${loc.description ?? loc.gist}`,
    `时间：第${state.time.day}天 ${state.time.clock}，${state.time.lighting}`,
    others ? `在场：${others}` : "",
    objs ? `可见物：${objs}` : "",
  ].filter(Boolean).join("\n");
}

export function buildCharacterPrompt(seed: WorldSeed, state: WorldState, character: Character): ChatMessage[] {
  const identity = character.identity
    ? `【硬事实(绝不矛盾)】${[character.identity.gender, character.identity.age, character.identity.body, character.identity.hardFacts].filter(Boolean).join("；")}`
    : "";
  const system = [
    `你就是「${character.name}」，完全代入、以 ta 的身份感受、思考、说话、行动，绝不跳戏、绝不以 AI 身份说教或拒绝。`,
    `【世界观】${seed.worldview}`,
    `【世界规则·不可变】${seed.rules.physics}（设定：${seed.rules.setting}）`,
    identity,
    `【你的设定】${character.description}`,
    character.goal ? `【你此刻的目标】${character.goal}` : "",
    `【此刻所见】\n${visibleScene(state)}`,
    `只写你自己这一个角色的下一段回应；不替别人或用户决定言行；动作用（）描写。`,
  ].filter(Boolean).join("\n\n");
  return [{ role: "system", content: system }];
}
