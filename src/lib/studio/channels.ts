import type { InputChannel } from "../types";

export const PLAYER_INPUT_CHANNELS = ["speak", "act", "observe"] as const satisfies readonly InputChannel[];
export const STUDIO_INPUT_CHANNELS = ["director-note", "scene-contract", "god-edit"] as const satisfies readonly InputChannel[];

const PLAYER_SET = new Set<InputChannel>(PLAYER_INPUT_CHANNELS);
const STUDIO_SET = new Set<InputChannel>(STUDIO_INPUT_CHANNELS);

export function isPlayerInputChannel(channel: InputChannel): boolean {
  return PLAYER_SET.has(channel);
}

export function isStudioInputChannel(channel: InputChannel): boolean {
  return STUDIO_SET.has(channel);
}
