let last = 0;
/** 单调递增的毫秒时间戳；同一毫秒内连续调用也保证严格递增。 */
export function nextTime(): number {
  const now = Date.now();
  last = now > last ? now : last + 1;
  return last;
}
