import { describe, it, expect } from "vitest";
import { consistencyGuard, guardSnapshot } from "../guard";
import { keywordsOf } from "../../memory/keywords";
import type { Memory, WorldState } from "../../types";

function mem(charId: string, text: string): Memory {
  return {
    id: `m-${charId}-${text.length}`,
    instanceId: "w-test",
    charId,
    kind: "observation",
    text,
    keywords: keywordsOf(text),
    importance: 5,
    createdAt: 1,
    lastAccessed: 1,
    provenance: "witnessed",
    confidence: 1,
    perceptionQuality: "full",
  };
}

function state(): WorldState {
  return {
    currentLocationId: "bar",
    time: { day: 1, clock: "夜", lighting: "暗" },
    locations: {
      bar: { id: "bar", name: "酒馆", detail: "fleshed", gist: "", connections: ["street"], presentCharacterIds: ["c-lan"], objectIds: ["o-glass", "o-door", "o-lamp"] },
      street: { id: "street", name: "雨街", detail: "stub", gist: "", connections: ["bar"], presentCharacterIds: [], objectIds: [] },
      warehouse: { id: "warehouse", name: "旧仓库", detail: "stub", gist: "", connections: [], presentCharacterIds: [], objectIds: ["o-key"] },
    },
    objects: {
      "o-glass": { id: "o-glass", name: "酒杯", detail: "fleshed", props: {}, locationId: "bar" },
      "o-door": { id: "o-door", name: "铁门", detail: "fleshed", props: { locked: true }, locationId: "bar" },
      "o-lamp": { id: "o-lamp", name: "旧灯", detail: "fleshed", props: {}, locationId: "bar", state: "熄灭，灯罩上积着灰" },
      "o-key": { id: "o-key", name: "铜钥匙", detail: "fleshed", props: {}, locationId: "warehouse" },
    },
    roster: { "c-lan": { name: "阿岚" }, "c-mei": { name: "阿梅" }, you: { name: "你" } },
    flags: {},
  };
}

describe("§5.8 guardSnapshot", () => {
  it("collects on-stage names and offstage names", () => {
    const snap = guardSnapshot(state());
    expect(snap.presentNames).toEqual(expect.arrayContaining(["阿岚", "酒馆", "酒杯", "铁门", "旧灯"]));
    expect(snap.offstageNames).toEqual(expect.arrayContaining(["阿梅", "铜钥匙", "旧仓库"]));
    expect(snap.offstageNames).not.toContain("雨街"); // adjacent location can be ambient context
  });
});

describe("§5.8 consistencyGuard", () => {
  it("passes ambient prose that names nobody offstage", () => {
    const r = consistencyGuard("雨势更急，霓虹在水洼里碎成血红。", guardSnapshot(state()));
    expect(r.ok).toBe(true);
    expect(r.slips).toEqual([]);
  });

  it("flags prose that names an offstage character as a slip", () => {
    const r = consistencyGuard("阿梅从角落里站起身。", guardSnapshot(state()));
    expect(r.ok).toBe(false);
    expect(r.slips).toContain("阿梅");
  });

  it("allows offstage figures when they are lawful distortion through an allowed medium", () => {
    const narrationRule = "从已提交事实快照转述；允许镜面、录音和门牌产生 lawful distortion，但底层事实不变。";
    const r = consistencyGuard("镜子里，阿梅从角落里站起身。", guardSnapshot(state(), { narrationRule }));
    expect(r.ok).toBe(true);
    expect(r.slips).not.toContain("阿梅");
  });

  it("still flags offstage figures under distortion rules when no distortion medium is present", () => {
    const narrationRule = "从已提交事实快照转述；允许镜面、录音和门牌产生 lawful distortion，但底层事实不变。";
    const r = consistencyGuard("阿梅从角落里站起身。", guardSnapshot(state(), { narrationRule }));
    expect(r.ok).toBe(false);
    expect(r.slips).toContain("阿梅");
  });

  it("does not let an unrelated distortion medium exempt offstage figures", () => {
    const narrationRule = "从已提交事实快照转述；允许镜面、录音和门牌产生 lawful distortion，但底层事实不变。";
    const r = consistencyGuard("镜子蒙着灰。阿梅从角落里站起身。", guardSnapshot(state(), { narrationRule }));
    expect(r.ok).toBe(false);
    expect(r.slips).toContain("阿梅");
  });

  it("allows visible-state contradictions when they are lawful distortion through an allowed medium", () => {
    const narrationRule = "从已提交事实快照转述；允许镜面、录音和门牌产生 lawful distortion，但底层事实不变。";
    const r = consistencyGuard("镜面里，铁门已经敞开。", guardSnapshot(state(), { narrationRule }));
    expect(r.ok).toBe(true);
    expect(r.slips).not.toContain("铁门");
  });

  it("flags known offstage objects and far locations as slips", () => {
    const r = consistencyGuard("铜钥匙在旧仓库的地上亮了一下。", guardSnapshot(state()));
    expect(r.ok).toBe(false);
    expect(r.slips).toEqual(expect.arrayContaining(["铜钥匙", "旧仓库"]));
  });

  it("flags prose that contradicts a visible locked object", () => {
    const r = consistencyGuard("铁门在雨声里缓缓打开。", guardSnapshot(state()));
    expect(r.ok).toBe(false);
    expect(r.slips).toContain("铁门");
  });

  it("flags prose that contradicts an explicit visible object state", () => {
    const r = consistencyGuard("旧灯忽然亮起，照出墙上的水痕。", guardSnapshot(state()));
    expect(r.ok).toBe(false);
    expect(r.slips).toContain("旧灯");
  });

  it("flags common visible object state contradictions beyond locks and lights", () => {
    const s = state();
    s.objects["o-glass"].state = "空的，杯底没有一滴酒";

    const r = consistencyGuard("酒杯忽然盛满了琥珀色的酒。", guardSnapshot(s));

    expect(r.ok).toBe(false);
    expect(r.slips).toContain("酒杯");
  });

  it("does not flag a present character's name", () => {
    const r = consistencyGuard("阿岚擦了擦杯子。", guardSnapshot(state()));
    expect(r.ok).toBe(true);
  });

  it("flags ambient prose that attributes inner knowledge to a character", () => {
    const r = consistencyGuard("阿岚知道你刚才在说谎。", guardSnapshot(state()));
    expect(r.ok).toBe(false);
    expect(r.slips).toContain("阿岚");
  });

  it("passes inner-knowledge prose when that character's own projection supports the claim", () => {
    const snapshot = guardSnapshot(state(), {
      memoriesByCharacter: {
        "c-lan": [mem("c-lan", "你：我刚才在说谎。")],
      },
    });
    const r = consistencyGuard("阿岚知道你刚才在说谎。", snapshot);
    expect(r.ok).toBe(true);
  });

  it("does not pass inner knowledge from loose CJK character overlap alone", () => {
    const snapshot = guardSnapshot(state(), {
      memoriesByCharacter: {
        "c-lan": [mem("c-lan", "刚才说书人讲了一个谎，阿岚没有接话。")],
      },
    });

    const r = consistencyGuard("阿岚知道你刚才在说谎。", snapshot);

    expect(r.ok).toBe(false);
    expect(r.slips).toContain("阿岚");
  });

  it("does not let another character's memory support the claim", () => {
    const snapshot = guardSnapshot(state(), {
      memoriesByCharacter: {
        "c-mei": [mem("c-mei", "你：我刚才在说谎。")],
      },
    });
    const r = consistencyGuard("阿岚知道你刚才在说谎。", snapshot);
    expect(r.ok).toBe(false);
    expect(r.slips).toContain("阿岚");
  });
});
