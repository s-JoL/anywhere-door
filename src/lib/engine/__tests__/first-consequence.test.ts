import { describe, it, expect, beforeEach } from "vitest";
import { runTurn } from "../turn";
import { DEMO_SEED } from "../../world/seed-demo";
import { instantiate } from "../../world/instance";
import { getRepository, resetRepository } from "../../storage";
import type { ChatMessage } from "../../types";

// Reactor mints one anchored fact; everything else quiet.
function factLlm(): (m: ChatMessage[]) => Promise<{ content: string }> {
  let reactorCalls = 0;
  return async (messages: ChatMessage[]) => {
    const sys = messages[0]?.content ?? "";
    const last = messages[messages.length - 1]?.content ?? "";
    if (sys.includes("世界状态记录器")) {
      reactorCalls++;
      // first reactor call mints an anchored fact; later calls quiet
      return { content: reactorCalls === 1 ? '[{"kind":"setFact","id":"f1","entityId":"钥匙","field":"hidden","value":"在地板下","hardness":"anchored"}]' : "[]" };
    }
    if (sys.includes("世界环境作家")) return { content: "x" };
    if (last.includes("暂停扮演")) return { content: '{"action":"pass","eagerness":0.1}' };
    return { content: "……" };
  };
}

describe("§5.9 first-consequence funnel hook", () => {
  beforeEach(() => { resetRepository(); indexedDB.deleteDatabase("anywhere-door"); });

  it("fires once when the first player-caused anchored fact commits, not again", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-fc"));
    const llm = factLlm();

    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-fc", input: "我把钥匙藏进地板下。", llm });
    let events = await repo.listTasteEvents();
    expect(events.filter((e) => e.kind === "first-consequence")).toHaveLength(1);
    // the anchored fact landed
    expect((await repo.getInstance("w-fc"))?.state.facts?.some((f) => f.id === "f1")).toBe(true);

    // a second turn (reactor now quiet) must NOT fire first-consequence again
    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-fc", input: "我环顾四周。", llm });
    events = await repo.listTasteEvents();
    expect(events.filter((e) => e.kind === "first-consequence")).toHaveLength(1);
  });
});
