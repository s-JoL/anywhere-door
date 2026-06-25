import { describe, it, expect } from "vitest";
import { commit, type GateCtx, type Proposal } from "../write-gate";
import type { Delta, DeltaLogEntry } from "../../world/delta";
import type { WorldState, WorldRules } from "../../types";

const rules: WorldRules = { physics: "无超自然", setting: "现代酒馆", redLines: [] };

function baseState(): WorldState {
  return {
    currentLocationId: "bar",
    time: { day: 1, clock: "黄昏", lighting: "暖橙" },
    locations: {
      bar: { id: "bar", name: "酒馆", detail: "fleshed", gist: "", connections: ["street"], presentCharacterIds: ["c1"], objectIds: ["glass"] },
      street: { id: "street", name: "街道", detail: "stub", gist: "湿漉漉的街", connections: ["bar"], presentCharacterIds: [], objectIds: [] },
    },
    objects: { glass: { id: "glass", name: "酒杯", detail: "fleshed", props: {}, locationId: "bar", state: "空" } },
    roster: { c1: { name: "阿岚" }, you: { name: "你" } },
    flags: {},
  };
}

function makeCtx(over: Partial<GateCtx> = {}): { ctx: GateCtx; log: DeltaLogEntry[]; warnings: string[] } {
  const log: DeltaLogEntry[] = [];
  const warnings: string[] = [];
  let t = 100;
  const ctx: GateCtx = {
    state: baseState(),
    rules,
    instanceId: "w1",
    turn: 3,
    repo: { appendDeltaLog: async (e) => { log.push(e); } },
    logger: (m) => warnings.push(m),
    now: () => ++t,
    ...over,
  };
  return { ctx, log, warnings };
}

const p = (delta: Delta, source: Proposal["source"] = "reactor", cause = "我做了点什么。"): Proposal => ({ delta, source, cause });

describe("WriteGate.commit (§4.1) — golden accept/reject parity with validateDelta", () => {
  // One representative valid + invalid case per delta kind (the 14 kinds).
  // advanceTime has no reject path in validateDelta, so it is valid-only.
  const cases: Array<{ kind: string; valid: Delta; invalid?: Delta }> = [
    { kind: "moveCharacter", valid: { kind: "moveCharacter", characterId: "c1", toLocationId: "street" }, invalid: { kind: "moveCharacter", characterId: "ghost", toLocationId: "street" } },
    { kind: "setObjectState", valid: { kind: "setObjectState", objectId: "glass", state: "碎了" }, invalid: { kind: "setObjectState", objectId: "nope", state: "碎了" } },
    { kind: "setFlag", valid: { kind: "setFlag", key: "k", value: "v" }, invalid: { kind: "setFlag", key: "", value: "v" } },
    { kind: "advanceTime", valid: { kind: "advanceTime", clock: "夜" } },
    { kind: "setCondition", valid: { kind: "setCondition", entityId: "c1", condition: "受伤" }, invalid: { kind: "setCondition", entityId: "ghost", condition: "受伤" } },
    { kind: "establishObject", valid: { kind: "establishObject", id: "new-obj", name: "匕首", locationId: "bar" }, invalid: { kind: "establishObject", id: "glass", name: "酒杯", locationId: "bar" } },
    { kind: "establishLocation", valid: { kind: "establishLocation", id: "back", name: "里屋", connectFrom: "bar" }, invalid: { kind: "establishLocation", id: "bar", name: "重复", connectFrom: "bar" } },
    { kind: "moveScene", valid: { kind: "moveScene", toLocationId: "street" }, invalid: { kind: "moveScene", toLocationId: "nowhere" } },
    { kind: "setRelationship", valid: { kind: "setRelationship", fromId: "c1", toId: "you", disposition: "警惕" }, invalid: { kind: "setRelationship", fromId: "ghost", toId: "you", disposition: "警惕" } },
    { kind: "establishLore", valid: { kind: "establishLore", id: "l1", keys: ["血誓录"], content: "一本禁书" }, invalid: { kind: "establishLore", id: "l1", keys: [], content: "一本禁书" } },
    { kind: "establishCharacter", valid: { kind: "establishCharacter", id: "c-new", name: "陌生人", locationId: "bar" }, invalid: { kind: "establishCharacter", id: "c1", name: "重复", locationId: "bar" } },
    { kind: "moveObject", valid: { kind: "moveObject", objectId: "glass", toLocationId: "street" }, invalid: { kind: "moveObject", objectId: "nope", toLocationId: "street" } },
    { kind: "setObjectLocked", valid: { kind: "setObjectLocked", objectId: "glass", locked: true }, invalid: { kind: "setObjectLocked", objectId: "nope", locked: true } },
    { kind: "fleshLocation", valid: { kind: "fleshLocation", locationId: "street", description: "石板路在雨里发亮。" }, invalid: { kind: "fleshLocation", locationId: "nowhere", description: "x" } },
  ];

  for (const c of cases) {
    it(`commits a valid ${c.kind}`, async () => {
      const { ctx, log } = makeCtx();
      const res = await commit(ctx, [p(c.valid)]);
      expect(res.committed).toHaveLength(1);
      expect(res.rejected).toHaveLength(0);
      expect(log).toHaveLength(1);
    });

    if (!c.invalid) continue;
    const invalid = c.invalid;
    it(`rejects an invalid ${c.kind} with a reason and no log entry`, async () => {
      const { ctx, log } = makeCtx();
      const res = await commit(ctx, [p(invalid)]);
      expect(res.committed).toHaveLength(0);
      expect(res.rejected).toHaveLength(1);
      expect(res.rejected[0].reason).toBeTruthy();
      expect(res.rejected[0].source).toBe("reactor");
      expect(log).toHaveLength(0);
    });
  }
});

describe("WriteGate.commit — ordering, attribution, mixed batches", () => {
  it("applies deltas in order so later deltas see earlier ones", async () => {
    const { ctx } = makeCtx();
    // establish 里屋 connected to bar, THEN move scene there — only valid if ordered.
    const res = await commit(ctx, [
      p({ kind: "establishLocation", id: "back", name: "里屋", connectFrom: "bar" }),
      p({ kind: "moveScene", toLocationId: "back" }),
    ]);
    expect(res.committed).toHaveLength(2);
    expect(res.state.currentLocationId).toBe("back");
  });

  it("a mixed batch commits valid deltas and records rejections side by side", async () => {
    const { ctx, log } = makeCtx();
    const res = await commit(ctx, [
      p({ kind: "setObjectState", objectId: "glass", state: "满" }),
      p({ kind: "setObjectState", objectId: "ghost", state: "x" }),
    ]);
    expect(res.committed).toHaveLength(1);
    expect(res.rejected).toHaveLength(1);
    expect(res.state.objects.glass.state).toBe("满");
    expect(log).toHaveLength(1);
  });

  it("logs full attribution: turn, source, cause, game time, and the delta", async () => {
    const { ctx, log } = makeCtx();
    await commit(ctx, [p({ kind: "setObjectState", objectId: "glass", state: "满" }, "user", "我倒满酒杯。")]);
    expect(log[0]).toMatchObject({
      instanceId: "w1",
      turn: 3,
      source: "user",
      cause: "我倒满酒杯。",
      gameDay: 1,
      gameClock: "黄昏",
    });
    expect(log[0].at).toBeGreaterThan(0);
    expect(log[0].delta.kind).toBe("setObjectState");
  });

  it("never mutates the input state object (immutable apply)", async () => {
    const { ctx } = makeCtx();
    const before = ctx.state;
    const res = await commit(ctx, [p({ kind: "setObjectState", objectId: "glass", state: "满" })]);
    expect(before.objects.glass.state).toBe("空"); // input untouched
    expect(res.state).not.toBe(before);
  });
});
