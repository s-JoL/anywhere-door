import type { WorldState, ChatMessage } from "../types";
import type { Delta } from "../world/delta";
import type { LlmFn } from "./turn";

const VALID_KINDS = new Set([
  "moveCharacter",
  "setObjectState",
  "setFlag",
  "advanceTime",
  "setCondition",
  "establishObject",
]);

export function parseDeltas(text: string): Delta[] {
  try {
    const match = text.match(/\[[\s\S]*?\]/);
    if (!match) return [];
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return [];
    const result: Delta[] = [];
    for (const item of arr) {
      if (!item || typeof item !== "object" || !VALID_KINDS.has(item.kind)) continue;
      if (item.kind === "moveCharacter" && typeof item.characterId === "string" && typeof item.toLocationId === "string") {
        result.push(item as Delta);
      } else if (item.kind === "setObjectState" && typeof item.objectId === "string" && typeof item.state === "string") {
        result.push(item as Delta);
      } else if (item.kind === "setFlag" && typeof item.key === "string") {
        result.push(item as Delta);
      } else if (item.kind === "advanceTime") {
        result.push(item as Delta);
      } else if (item.kind === "setCondition" && typeof item.entityId === "string" && typeof item.condition === "string") {
        result.push(item as Delta);
      } else if (item.kind === "establishObject" && typeof item.id === "string" && typeof item.name === "string" && typeof item.locationId === "string") {
        result.push(item as Delta);
      }
      if (result.length >= 8) break;
    }
    return result;
  } catch {
    return [];
  }
}

export function buildReactorPrompt(
  state: WorldState,
  recentLines: string[],
  nameById: Record<string, string>,
): ChatMessage[] {
  const rosterList = Object.entries(nameById)
    .map(([id, name]) => {
      const cond = state.roster[id]?.condition;
      return `  ${id}: ${name}${cond ? `（${cond}）` : ""}`;
    })
    .join("\n");
  const objectList = Object.entries(state.objects)
    .map(([id, o]) => `  ${id}: ${o.name}${o.state ? `（${o.state}）` : ""}`)
    .join("\n");
  const locationList = Object.entries(state.locations)
    .map(([id, l]) => `  ${id}: ${l.name}`)
    .join("\n");

  const system = `你是世界状态记录器（World State Recorder）。
你的职责：阅读最近发生的事件，输出一个 JSON 数组，记录其中真实、可被外部观察到的世界状态变化。
只记录客观事实（角色移动位置、物品状态变化、角色/玩家的外显体态条件、时间推移、新出现的重要道具被发现）。
不记录内心想法、情绪、对话本身。
如果什么都没有结构性变化，输出 []。
不要凭空发明，只记录对话中实际发生的事。

Delta JSON 格式（6 种，选用实际发生的）：
{"kind":"moveCharacter","characterId":"<roster中的id>","toLocationId":"<locations中的id>"}
{"kind":"setObjectState","objectId":"<objects中的id>","state":"新状态描述"}
{"kind":"setFlag","key":"旗标名","value":true}
{"kind":"advanceTime","clock":"深夜","lighting":"幽蓝","dayDelta":0}
{"kind":"setCondition","entityId":"<roster中的id，含you>","condition":"外显体态描述"}
{"kind":"establishObject","id":"新id","name":"物品名","locationId":"<locations中的id>","state":"初始状态"}

只输出 JSON 数组，不要其他文字。`;

  const loc = state.locations[state.currentLocationId];
  const user = `【当前场景】${loc?.name ?? state.currentLocationId}
【时间】第${state.time.day}天 ${state.time.clock}，${state.time.lighting}

【角色名册】（id: 名字，括号内为当前体态条件）
${rosterList || "（无）"}

【场景内物品】（id: 名字，括号内为当前状态）
${objectList || "（无）"}

【地点列表】（id: 名字）
${locationList || "（无）"}

【本回合近期发言（最新在下）】
${recentLines.map((l) => `  ${l}`).join("\n") || "（无）"}

请输出 Delta JSON 数组：`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export async function react(args: {
  state: WorldState;
  recentLines: string[];
  nameById: Record<string, string>;
  llm: LlmFn;
}): Promise<Delta[]> {
  try {
    const msgs = buildReactorPrompt(args.state, args.recentLines, args.nameById);
    const { content } = await args.llm(msgs);
    return parseDeltas(content);
  } catch {
    return [];
  }
}
