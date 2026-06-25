import { describe, it, expect, beforeEach } from "vitest";
import { runActiveAgents } from "../agent-runtime";
import { DEMO_SEED } from "../../world/seed-demo";
import { instantiate } from "../../world/instance";
import { getRepository, resetRepository } from "../../storage";
import { DEFAULT_ENGINE_CONFIG } from "../config";
import { presentCharacters } from "../prompt";
import type { ChatMessage } from "../../types";

// Always-speak fake llm (intent → speak JSON; generation → a line).
const speakLlm = async (messages: ChatMessage[]) => {
  const last = messages[messages.length - 1]?.content ?? "";
  if (last.includes("暂停扮演")) return { content: '{"action":"speak","eagerness":0.8}' };
  return { content: "……" };
};

describe("runActiveAgents (§4.4 AgentRuntime)", () => {
  beforeEach(() => { resetRepository(); indexedDB.deleteDatabase("anywhere-door"); });

  it("runs only the active cast: an ambient character never speaks or is queried", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-active"));
    const state = (await repo.getInstance("w-active"))!.state;
    // c-lan active, c-zhou ambient (both present in the bar)
    const activeChars = presentCharacters(DEMO_SEED, state).filter((c) => c.id === "c-lan");

    const { speakerIds } = await runActiveAgents({
      seed: DEMO_SEED, state, repo, instanceId: "w-active", input: "我推门进来。",
      llm: speakLlm, activeChars, config: DEFAULT_ENGINE_CONFIG,
    });

    expect(speakerIds).toEqual(["c-lan"]);
    const msgs = await repo.listMessages("w-active");
    const speakers = msgs.filter((m) => m.role === "assistant").map((m) => m.speakerId);
    expect(speakers.length).toBeGreaterThan(0);
    expect(speakers.every((s) => s === "c-lan")).toBe(true); // ambient c-zhou never spoke
  });

  it("characters only emit prose — runActiveAgents never mutates world state", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-nostate"));
    const state = (await repo.getInstance("w-nostate"))!.state;
    const before = JSON.parse(JSON.stringify(state));
    const activeChars = presentCharacters(DEMO_SEED, state);

    await runActiveAgents({
      seed: DEMO_SEED, state, repo, instanceId: "w-nostate", input: "我看着他们。",
      llm: speakLlm, activeChars, config: DEFAULT_ENGINE_CONFIG,
    });

    expect(state).toEqual(before); // the passed-in state object is untouched
  });

  it("respects the per-turn speak budget (maxConsecutiveAiTurns)", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-budget"));
    const state = (await repo.getInstance("w-budget"))!.state;
    const activeChars = presentCharacters(DEMO_SEED, state);

    const { speakerIds } = await runActiveAgents({
      seed: DEMO_SEED, state, repo, instanceId: "w-budget", input: "说话。",
      llm: speakLlm, activeChars, config: { ...DEFAULT_ENGINE_CONFIG, maxConsecutiveAiTurns: 2 },
    });

    const msgs = await repo.listMessages("w-budget");
    const replies = msgs.filter((m) => m.role === "assistant");
    expect(replies.length).toBeLessThanOrEqual(2);
    expect(speakerIds.length).toBeGreaterThan(0);
  });
});
