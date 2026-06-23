import { describe, it, expect, vi } from "vitest";
import { recordEnter, recordDwell, recordAuthor } from "../record";
import type { Repository } from "@/lib/storage";
import type { TasteEvent } from "@/lib/types";
import { DEMO_SEED } from "@/lib/world/seed-demo";
import { tagsOfSeed } from "../tags";

function mockRepo(): Repository & { captured: TasteEvent[] } {
  const captured: TasteEvent[] = [];
  return {
    captured,
    recordTasteEvent: vi.fn(async (e: TasteEvent) => { captured.push(e); }),
    listTasteEvents: vi.fn(async () => captured),
    // stub all other methods
    getInstance: vi.fn(),
    upsertInstance: vi.fn(),
    listMessages: vi.fn(async () => []),
    appendMessage: vi.fn(),
    deleteMessages: vi.fn(),
    appendMemory: vi.fn(),
    listMemories: vi.fn(async () => []),
    listAllMemories: vi.fn(async () => []),
    deleteMemories: vi.fn(),
    getSeed: vi.fn(),
    listSeeds: vi.fn(async () => []),
    upsertSeed: vi.fn(),
  } as unknown as Repository & { captured: TasteEvent[] };
}

const SEED = DEMO_SEED;
const EXPECTED_TAGS = tagsOfSeed(SEED);

describe("record helpers", () => {
  it("recordEnter creates event with kind=enter, correct seedId and tags", async () => {
    const repo = mockRepo();
    recordEnter(repo, SEED);
    await Promise.resolve(); // flush microtask
    expect(repo.captured).toHaveLength(1);
    const e = repo.captured[0];
    expect(e.kind).toBe("enter");
    expect(e.seedId).toBe(SEED.id);
    expect(e.tags).toEqual(EXPECTED_TAGS);
  });

  it("recordDwell creates event with kind=dwell", async () => {
    const repo = mockRepo();
    recordDwell(repo, SEED);
    await Promise.resolve();
    expect(repo.captured[0].kind).toBe("dwell");
  });

  it("recordAuthor creates event with kind=author", async () => {
    const repo = mockRepo();
    recordAuthor(repo, SEED);
    await Promise.resolve();
    expect(repo.captured[0].kind).toBe("author");
  });
});
