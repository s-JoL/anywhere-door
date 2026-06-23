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
  "establishLocation",
  "moveScene",
  "setRelationship",
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
      } else if (item.kind === "establishLocation" && typeof item.id === "string" && typeof item.name === "string") {
        result.push(item as Delta);
      } else if (item.kind === "moveScene" && typeof item.toLocationId === "string") {
        result.push(item as Delta);
      } else if (item.kind === "setRelationship" && typeof item.fromId === "string" && typeof item.toId === "string" && typeof item.disposition === "string") {
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
只记录客观事实（角色移动位置、物品状态变化、角色/玩家的外显体态条件、时间推移、新出现的重要道具被发现、场景转移）。
不记录内心想法、情绪、对话本身。
如果什么都没有结构性变化，输出 []。
不要凭空发明，只记录对话中实际发生的事。

Delta JSON 格式（9 种，选用实际发生的）：
{"kind":"moveCharacter","characterId":"<roster中的id>","toLocationId":"<locations中的id>"}
{"kind":"setObjectState","objectId":"<objects中的id>","state":"新状态描述"}
{"kind":"setFlag","key":"旗标名","value":true}
{"kind":"advanceTime","clock":"深夜","lighting":"幽蓝","dayDelta":0}
{"kind":"setCondition","entityId":"<roster中的id，含you>","condition":"外显体态描述"}
{"kind":"establishObject","id":"新id","name":"物品名","locationId":"<locations中的id>","state":"初始状态"}
{"kind":"establishLocation","id":"新地点id","name":"地点名","gist":"一句话描述","connectFrom":"<当前地点id>"}
{"kind":"moveScene","toLocationId":"<locations中已存在的id>"}
{"kind":"setRelationship","fromId":"<roster中的id>","toId":"<roster中的id>","disposition":"简短中文态度短语"}

场景移动规则：当玩家或角色走到一个尚未存在的地方，先用 establishLocation 造出它（connectFrom 填当前地点），再用 moveScene 把镜头移过去，并用 moveCharacter 把同行的角色移过去。只在确有移动/新场景时才发。

当某人对另一人（或对玩家"你"）的态度因刚发生的事**实质改变**时，用 setRelationship 记下新的态度（简短中文短语，如"戒备松动""记恨在心"）。只在确有改变时发，不要每回合重复同一态度。

只输出 JSON 数组，不要其他文字。`;

  const loc = state.locations[state.currentLocationId];
  const connections = loc?.connections.map((id) => `${id}(${state.locations[id]?.name ?? id})`).join("、") ?? "";

  const relationshipSummary = (() => {
    if (!state.relationships) return "";
    const lines: string[] = [];
    for (const [fromId, targets] of Object.entries(state.relationships)) {
      const fromName = nameById[fromId] ?? state.roster[fromId]?.name ?? fromId;
      for (const [toId, disp] of Object.entries(targets)) {
        const toName = nameById[toId] ?? state.roster[toId]?.name ?? toId;
        lines.push(`  ${fromName}→${toName}: ${disp}`);
      }
    }
    return lines.join("\n");
  })();

  const user = `【当前场景】${loc?.name ?? state.currentLocationId}（id: ${state.currentLocationId}）
【相邻地点】${connections || "（无）"}
【时间】第${state.time.day}天 ${state.time.clock}，${state.time.lighting}

【角色名册】（id: 名字，括号内为当前体态条件）
${rosterList || "（无）"}

【当前人物关系】（fromName→toName: 态度，空表示无已记录态度）
${relationshipSummary || "（无）"}

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
