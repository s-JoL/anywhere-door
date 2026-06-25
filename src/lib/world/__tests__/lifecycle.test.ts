import { describe, it, expect } from "vitest";
import { validateDelta, applyDelta } from "../delta";
import type { WorldState, WorldRules, Character } from "../../types";

const rules: WorldRules = { physics: "无超自然", setting: "现代", redLines: [] };

const stub: Character = { id: "c-x", name: "陌生人", description: "角落里的人", detail: "stub" };

function baseState(): WorldState {
  return {
    currentLocationId: "bar",
    time: { day: 1, clock: "夜", lighting: "暗" },
    locations: { bar: { id: "bar", name: "酒馆", detail: "fleshed", gist: "", connections: [], presentCharacterIds: ["c-x"], objectIds: ["o-box"] } },
    objects: { "o-box": { id: "o-box", name: "木箱", detail: "stub", props: {}, locationId: "bar" } },
    roster: { "c-x": { name: "陌生人" } },
    characters: { "c-x": stub },
    flags: {},
  };
}

describe("§5.7 fleshObject", () => {
  it("promotes a stub object to fleshed and enriches state/name", () => {
    const s = baseState();
    expect(validateDelta(s, rules, { kind: "fleshObject", objectId: "o-box", state: "落了灰", name: "旧木箱" }).ok).toBe(true);
    const next = applyDelta(s, { kind: "fleshObject", objectId: "o-box", state: "落了灰", name: "旧木箱" });
    expect(next.objects["o-box"]).toMatchObject({ detail: "fleshed", state: "落了灰", name: "旧木箱" });
  });

  it("rejects a missing object or an already-fleshed one", () => {
    const s = baseState();
    expect(validateDelta(s, rules, { kind: "fleshObject", objectId: "nope" }).ok).toBe(false);
    const fleshed = applyDelta(s, { kind: "fleshObject", objectId: "o-box" });
    expect(validateDelta(fleshed, rules, { kind: "fleshObject", objectId: "o-box" }).ok).toBe(false);
  });
});

describe("§5.7 fleshCharacter", () => {
  it("promotes a stub instance character with a full description/goal", () => {
    const s = baseState();
    const d = { kind: "fleshCharacter", characterId: "c-x", description: "城南赌坊的收账人", goal: "收回欠款" } as const;
    expect(validateDelta(s, rules, d).ok).toBe(true);
    const next = applyDelta(s, d);
    expect(next.characters!["c-x"]).toMatchObject({ detail: "fleshed", description: "城南赌坊的收账人", goal: "收回欠款" });
  });

  it("rejects unknown, already-fleshed, or empty-description", () => {
    const s = baseState();
    expect(validateDelta(s, rules, { kind: "fleshCharacter", characterId: "ghost", description: "x" }).ok).toBe(false);
    expect(validateDelta(s, rules, { kind: "fleshCharacter", characterId: "c-x", description: "" }).ok).toBe(false);
    const fleshed = applyDelta(s, { kind: "fleshCharacter", characterId: "c-x", description: "y" });
    expect(validateDelta(fleshed, rules, { kind: "fleshCharacter", characterId: "c-x", description: "z" }).ok).toBe(false);
  });
});

describe("§5.7 retireEntity (archives, never deletes)", () => {
  it("archives a character: removed from presence but record kept", () => {
    const s = baseState();
    const next = applyDelta(s, { kind: "retireEntity", entityId: "c-x", entityType: "character" });
    expect(next.locations["bar"].presentCharacterIds).not.toContain("c-x");
    expect(next.characters!["c-x"]).toBeDefined();          // record NOT deleted
    expect(next.characters!["c-x"].archived).toBe(true);
  });

  it("archives an object: removed from the location's visible list but record kept", () => {
    const s = baseState();
    const next = applyDelta(s, { kind: "retireEntity", entityId: "o-box", entityType: "object" });
    expect(next.locations["bar"].objectIds).not.toContain("o-box");
    expect(next.objects["o-box"]).toBeDefined();
    expect(next.objects["o-box"].archived).toBe(true);
  });

  it("rejects retiring a missing entity or re-retiring an archived one", () => {
    const s = baseState();
    expect(validateDelta(s, rules, { kind: "retireEntity", entityId: "ghost", entityType: "character" }).ok).toBe(false);
    const archived = applyDelta(s, { kind: "retireEntity", entityId: "o-box", entityType: "object" });
    expect(validateDelta(archived, rules, { kind: "retireEntity", entityId: "o-box", entityType: "object" }).ok).toBe(false);
  });
});
