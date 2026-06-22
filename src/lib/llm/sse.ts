/** 从累积 buffer 中切出完整 SSE 事件（以空行分隔），返回未完成的尾巴。 */
export function parseSseChunks(buffer: string): { events: string[]; rest: string } {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  return { events: parts.filter((p) => p.trim().length > 0), rest };
}

/** 从一条 `data: {...}` 行抽取 content 增量；[DONE]/无 content 返回 ""。 */
export function extractDelta(line: string): string {
  const m = line.replace(/^data:\s*/, "").trim();
  if (!m || m === "[DONE]") return "";
  try {
    const obj = JSON.parse(m);
    return obj?.choices?.[0]?.delta?.content ?? "";
  } catch {
    return "";
  }
}
