import { describe, expect, it } from "vitest";
import { PLAYER_INPUT_CHANNELS, STUDIO_INPUT_CHANNELS, isStudioInputChannel, isPlayerInputChannel } from "../channels";

describe("Studio channel separation", () => {
  it("keeps the default play controls to in-world player channels", () => {
    expect(PLAYER_INPUT_CHANNELS).toEqual(["speak", "act", "observe"]);
    expect(PLAYER_INPUT_CHANNELS.every(isPlayerInputChannel)).toBe(true);
    expect(PLAYER_INPUT_CHANNELS.some(isStudioInputChannel)).toBe(false);
  });

  it("keeps out-of-world controls in Studio", () => {
    expect(STUDIO_INPUT_CHANNELS).toEqual(["director-note", "scene-contract", "god-edit"]);
    expect(STUDIO_INPUT_CHANNELS.every(isStudioInputChannel)).toBe(true);
    expect(STUDIO_INPUT_CHANNELS.some(isPlayerInputChannel)).toBe(false);
  });
});
