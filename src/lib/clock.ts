let last = 0;
/** A monotonically increasing millisecond timestamp; consecutive calls within the same millisecond are still guaranteed strictly increasing. */
export function nextTime(): number {
  const now = Date.now();
  last = now > last ? now : last + 1;
  return last;
}
