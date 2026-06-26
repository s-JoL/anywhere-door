import type { InputChannel } from "../types";

export interface RoutedInput {
  channel: InputChannel;
  raw: string;
  transcriptText: string;
  characterText: string;
  observerText: string;
  cause: string;
  isWorldFacing: boolean;
  directorNote: string | null;
  sceneContract: string | null;
  godEdit: string | null;
}

function clean(input: string): string {
  return input.trim();
}

function actionObserverText(raw: string): string {
  if (/(藏|隐藏|遮|掩|塞|偷放|悄悄|趁.+低头)/.test(raw)) return "（你遮掩起某件东西。）";
  return `（${raw}）`;
}

/** Classifies surfaced input channels without letting out-of-world notes become character knowledge. */
export function routeInput(input: string, channel?: InputChannel): RoutedInput {
  const raw = clean(input);
  const effectiveChannel = channel ?? "speak";
  if (effectiveChannel === "director-note") {
    return {
      channel: effectiveChannel,
      raw,
      transcriptText: `【导演笔记】${raw}`,
      characterText: "",
      observerText: "",
      cause: `导演笔记：${raw}`,
      isWorldFacing: false,
      directorNote: raw,
      sceneContract: null,
      godEdit: null,
    };
  }

  if (effectiveChannel === "scene-contract") {
    return {
      channel: effectiveChannel,
      raw,
      transcriptText: `【场景合约】${raw}`,
      characterText: "",
      observerText: "",
      cause: `场景合约：${raw}`,
      isWorldFacing: false,
      directorNote: null,
      sceneContract: raw,
      godEdit: null,
    };
  }

  if (effectiveChannel === "god-edit") {
    return {
      channel: effectiveChannel,
      raw,
      transcriptText: `【上帝编辑】${raw}`,
      characterText: "",
      observerText: "",
      cause: `上帝编辑：${raw}`,
      isWorldFacing: false,
      directorNote: null,
      sceneContract: null,
      godEdit: raw,
    };
  }

  if (effectiveChannel === "act") {
    const text = `（${raw}）`;
    return { channel: effectiveChannel, raw, transcriptText: text, characterText: text, observerText: actionObserverText(raw), cause: text, isWorldFacing: true, directorNote: null, sceneContract: null, godEdit: null };
  }

  if (effectiveChannel === "observe") {
    const text = `观察：${raw}`;
    return { channel: effectiveChannel, raw, transcriptText: text, characterText: text, observerText: "（你观察周围。）", cause: text, isWorldFacing: true, directorNote: null, sceneContract: null, godEdit: null };
  }

  const text = channel ? `「${raw}」` : raw;
  return { channel: effectiveChannel, raw, transcriptText: text, characterText: text, observerText: text, cause: text, isWorldFacing: true, directorNote: null, sceneContract: null, godEdit: null };
}
