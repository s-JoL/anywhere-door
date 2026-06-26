import { describe, expect, it, vi } from "vitest";
import { recordKeyAddFromSettingsSearch } from "../keyless-funnel";
import { DEMO_SEED } from "../../world/seed-demo";
import type { Repository } from "../../storage";
import type { TasteEvent } from "../../types";

function repoWithSeed() {
  const captured: TasteEvent[] = [];
  return {
    captured,
    getSeed: vi.fn(async (id: string) => (id === DEMO_SEED.id ? DEMO_SEED : undefined)),
    recordTasteEvent: vi.fn(async (event: TasteEvent) => { captured.push(event); }),
  } as unknown as Repository & { captured: TasteEvent[] };
}

describe("keyless funnel settings handoff", () => {
  it("records key-add for the sampled world after Settings saves a key", async () => {
    const repo = repoWithSeed();

    await recordKeyAddFromSettingsSearch(repo, `?from=prebaked-taste&world=${encodeURIComponent(DEMO_SEED.id)}`);

    expect(repo.captured).toHaveLength(1);
    expect(repo.captured[0]).toMatchObject({ kind: "key-add", seedId: DEMO_SEED.id });
  });

  it("does nothing for ordinary settings visits", async () => {
    const repo = repoWithSeed();

    await recordKeyAddFromSettingsSearch(repo, "?world=seed-builtin-inn");

    expect(repo.captured).toEqual([]);
  });
});
