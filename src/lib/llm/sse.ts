/** Slice complete SSE events (separated by blank lines) out of the accumulated buffer, returning the unfinished tail. */
export function parseSseChunks(buffer: string): { events: string[]; rest: string } {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  return { events: parts.filter((p) => p.trim().length > 0), rest };
}

/** Extract the content delta from a single `data: {...}` line; returns "" for [DONE] / no content. */
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
