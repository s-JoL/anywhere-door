import { describe, it, expect, beforeEach } from "vitest";
import { getRepository, resetRepository } from "../index";
import type { TasteEvent } from "../../types";

function evt(id: string, at: number): TasteEvent {
  return { id, kind: "enter", seedId: "s1", tags: ["genre:test"], at };
}

describe("taste event storage", () => {
  beforeEach(() => {
    resetRepository();
    indexedDB.deleteDatabase("anywhere-door");
  });

  it("recordTasteEvent then listTasteEvents returns event ascending by at", async () => {
    const repo = getRepository();
    await repo.recordTasteEvent(evt("b", 2000));
    await repo.recordTasteEvent(evt("a", 1000));
    const list = await repo.listTasteEvents();
    expect(list.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("persists across fresh repo instance", async () => {
    const repo1 = getRepository();
    await repo1.recordTasteEvent(evt("x", 500));
    resetRepository();
    // DO NOT delete the database — simulate app restart
    const repo2 = getRepository();
    const list = await repo2.listTasteEvents();
    expect(list.some((e) => e.id === "x")).toBe(true);
  });
});
