import { isDeltaKind, type Delta } from "../world/delta";

function stripJsonFence(input: string): string {
  const trimmed = input.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

function assertDeltaShape(value: unknown): asserts value is Delta {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("God Edit JSON 必须是 delta 对象或 delta 数组");
  }
  const maybe = value as { kind?: unknown };
  if (typeof maybe.kind !== "string" || maybe.kind.trim().length === 0) {
    throw new Error("God Edit delta 缺少 kind");
  }
  if (!isDeltaKind(maybe.kind)) {
    throw new Error(`God Edit delta kind 不支持: ${maybe.kind}`);
  }
}

export function parseGodEditDeltas(input: string): Delta[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(input));
  } catch (e) {
    throw new Error(`God Edit 必须是有效 JSON: ${(e as Error).message}`);
  }

  const list = Array.isArray(parsed) ? parsed : [parsed];
  if (list.length === 0) throw new Error("God Edit 至少需要一个 delta");
  for (const item of list) assertDeltaShape(item);
  return list;
}
