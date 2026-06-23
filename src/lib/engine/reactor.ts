import type { WorldState, ChatMessage, WorldRules } from "../types";
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
  "establishLore",
  "establishCharacter",
  "moveObject",
  "setObjectLocked",
]);

export function parseDeltas(text: string): Delta[] {
  try {
    // Greedy from first '[' to last ']' so nested arrays (e.g. establishLore.keys)
    // don't truncate the outer array at the first inner ']'.
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start < 0 || end <= start) return [];
    const arr = JSON.parse(text.slice(start, end + 1));
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
      } else if (item.kind === "establishLore" && typeof item.id === "string" && Array.isArray(item.keys) && item.keys.every((k: unknown) => typeof k === "string") && typeof item.content === "string") {
        result.push(item as Delta);
      } else if (item.kind === "establishCharacter" && typeof item.id === "string" && typeof item.name === "string" && typeof item.locationId === "string") {
        result.push(item as Delta);
      } else if (item.kind === "moveObject" && typeof item.objectId === "string" && typeof item.toLocationId === "string") {
        result.push(item as Delta);
      } else if (item.kind === "setObjectLocked" && typeof item.objectId === "string" && typeof item.locked === "boolean") {
        result.push(item as Delta);
      }
      if (result.length >= 12) break;
    }
    return result;
  } catch {
    return [];
  }
}

/** 把世界不可变规则(物理 + 红线)渲染成一段铁律前言；无内容时返回空串。 */
function worldLawBlock(rules?: WorldRules): string {
  if (!rules) return "";
  const parts: string[] = [];
  if (rules.physics?.trim()) parts.push(`【世界物理】${rules.physics.trim()}`);
  if (rules.redLines?.length) {
    parts.push(
      `【世界铁律·红线】以下绝不可被违反；任何会导致违反的状态变化都不要提议：\n` +
        rules.redLines.map((r) => `- ${r}`).join("\n"),
    );
  }
  return parts.length ? parts.join("\n") + "\n\n" : "";
}

export function buildReactorPrompt(
  state: WorldState,
  recentLines: string[],
  nameById: Record<string, string>,
  rules?: WorldRules,
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

  const system = `${worldLawBlock(rules)}你是世界状态记录器（World State Recorder）。
你的职责：阅读最近发生的事件，输出一个 JSON 数组，记录其中真实、可被外部观察到的世界状态变化。
只记录客观事实（角色移动位置、物品状态变化、角色/玩家的外显体态条件、时间推移、新出现的重要道具被发现、场景转移）。
不记录内心想法、情绪、对话本身。
如果什么都没有结构性变化，输出 []。
不要凭空发明，只记录对话中实际发生的事。

Delta JSON 格式（13 种，选用实际发生的）：
{"kind":"moveCharacter","characterId":"<roster中的id>","toLocationId":"<locations中的id>"}
{"kind":"setObjectState","objectId":"<objects中的id>","state":"新状态描述"}
{"kind":"setFlag","key":"旗标名","value":true}
{"kind":"advanceTime","clock":"深夜","lighting":"幽蓝","dayDelta":0}
{"kind":"setCondition","entityId":"<roster中的id，含you>","condition":"外显体态描述"}
{"kind":"establishObject","id":"新id","name":"物品名","locationId":"<locations中的id>","state":"初始状态","locked":true,"gates":"<这扇门/障碍把守通往的locations中的id，仅门类物体填>"}
{"kind":"establishLocation","id":"新地点id","name":"地点名","gist":"一句话描述","connectFrom":"<当前地点id>"}
{"kind":"moveScene","toLocationId":"<locations中已存在的id>"}
{"kind":"setRelationship","fromId":"<roster中的id>","toId":"<roster中的id>","disposition":"简短中文态度短语"}
{"kind":"establishLore","id":"新设定id","keys":["会再次被提到的词","别名"],"content":"一句永久世界设定"}
{"kind":"establishCharacter","id":"新角色id","name":"角色名","role":"一句话身份/定位","goal":"(可选)当前目标","locationId":"<locations中的id>"}
{"kind":"moveObject","objectId":"<objects中的id>","toLocationId":"<locations中的id>"}
{"kind":"setObjectLocked","objectId":"<objects中的id>","locked":false}

当出现一扇会挡路的门/闸/障碍时,把它作为物体确立(establishObject 填 gates=它把守通往的地点id、locked=是否锁着);上锁的门会**阻止角色或镜头**穿过它通往 gates 指向的地点。门被打开/撬开/解锁时用 setObjectLocked 把 locked 置为 false,被重新锁上则置 true。只在门的开合确实发生时才发。

当物品在场景间被拿走/递出/搬动(玩家或角色把某物带去另一地点、递到他人所在处)时,用 moveObject 把它的所在地落实。注意:被标记搬不动的固定物(吧台、舱壁等)不能移动,别发。只在物品确实换了地点时才发。

当某个**重要且持久的世界事实**首次确立(某地的来历、一个门派/势力、一条世界规则、一个秘密的真相),用 establishLore 记成永久设定(keys 填日后会再次被提到的词)。已有设定不要重复;只记真正持久、值得日后再次被唤起的 canon,琐碎或一次性细节不要记。

当剧情中出现一个**此前不存在、且会持续存在或重要的人物**时,用 establishCharacter 把他/她确立为世界的一部分(locationId 填其所在地点)——这是**世界细化出它自己的一部分,不是从外部引入**。只在确有新人物且值得持久时使用;一次性的、无名的过场路人不要确立。

场景移动规则：当玩家或角色走到一个尚未存在的地方，先用 establishLocation 造出它（connectFrom 填当前地点），再用 moveScene 把镜头移过去，并用 moveCharacter 把同行的角色移过去。只在确有移动/新场景时才发。

【尊重玩家的自我移动】玩家对"自己去了哪里"的叙述必须被世界落实，不能被默默忽略或推翻：
- 若玩家说自己前往某地，而该地点尚不存在 → 先 establishLocation（connectFrom 填当前地点）造出它，再 moveScene 把镜头移过去；
- 若该地点已存在且相邻 → 直接 moveScene 过去；
- 玩家明确带走/拽走的角色，用 moveCharacter 一并移动；玩家明确拿走/带走的物品，用 moveObject 一并移动到新地点。
这类"玩家自身移动"的 delta 优先级最高，务必输出，不要因别的变化挤占而漏掉。

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

  const loreKeys = (state.lore ?? [])
    .map((e) => e.keys.filter(Boolean).join("/"))
    .filter(Boolean)
    .join("、");

  const user = `【当前场景】${loc?.name ?? state.currentLocationId}（id: ${state.currentLocationId}）
【相邻地点】${connections || "（无）"}
【时间】第${state.time.day}天 ${state.time.clock}，${state.time.lighting}

【已有世界设定关键词】（这些 canon 已存在，不要用 establishLore 重复）
${loreKeys || "（无）"}

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
  rules?: WorldRules;
}): Promise<Delta[]> {
  try {
    const msgs = buildReactorPrompt(args.state, args.recentLines, args.nameById, args.rules);
    const { content } = await args.llm(msgs);
    return parseDeltas(content);
  } catch {
    return [];
  }
}
