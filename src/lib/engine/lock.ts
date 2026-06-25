/**
 * §4.0 Instance operation lock (architecture.md §11).
 *
 * Even single-player has real concurrency: rapid re-submit, multiple tabs,
 * regenerate/god-edit mid-stream. Without a lock, overlapping Director / Reactor /
 * character writes contaminate one branch. This is an in-memory, per-instance mutex
 * (local-first; one tab is the common case) with a monotonic operation id.
 *
 * Contract (§15.6 turn-scoped integrity): one turn commits at a time. Long model ops
 * check `isStale` before committing; a timeout releases safely; regenerate / fork /
 * god-edit call `supersede` to invalidate in-flight ops so their writes are ignored.
 */

const DEFAULT_TIMEOUT_MS = 120_000;

export interface LockToken {
  readonly instanceId: string;
  readonly opId: number;
}

interface Waiter {
  token: LockToken;
  resolve: (t: LockToken) => void;
}

interface Slot {
  holder: number | null; // opId currently holding, or null when free
  nextOpId: number; // monotonic allocator (1-based; 0 is never a valid op)
  waiters: Waiter[]; // FIFO queue granted on release
  stale: Set<number>; // opIds invalidated by supersede() or timeout
  timers: Map<number, ReturnType<typeof setTimeout>>;
}

export class InstanceLock {
  private slots = new Map<string, Slot>();

  constructor(private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS) {}

  private slot(id: string): Slot {
    let s = this.slots.get(id);
    if (!s) {
      s = { holder: null, nextOpId: 1, waiters: [], stale: new Set(), timers: new Map() };
      this.slots.set(id, s);
    }
    return s;
  }

  /** Arm a safety timeout: a holder that runs too long is marked stale and released. */
  private armTimeout(s: Slot, token: LockToken): void {
    if (!this.timeoutMs || this.timeoutMs === Infinity) return;
    const t = setTimeout(() => {
      s.stale.add(token.opId);
      this.release(token);
    }, this.timeoutMs);
    // Don't keep a Node process alive just for the lock timer (no-op in browsers).
    (t as { unref?: () => void }).unref?.();
    s.timers.set(token.opId, t);
  }

  /** Acquire the lock for an instance; resolves immediately if free, else queues FIFO. */
  acquire(instanceId: string): Promise<LockToken> {
    const s = this.slot(instanceId);
    const token: LockToken = { instanceId, opId: s.nextOpId++ };
    if (s.holder === null) {
      s.holder = token.opId;
      this.armTimeout(s, token);
      return Promise.resolve(token);
    }
    return new Promise<LockToken>((resolve) => {
      s.waiters.push({ token, resolve });
    });
  }

  /** Release the lock; grants it to the next queued waiter (if any). Idempotent. */
  release(token: LockToken): void {
    const s = this.slots.get(token.instanceId);
    if (!s) return;
    const timer = s.timers.get(token.opId);
    if (timer) {
      clearTimeout(timer);
      s.timers.delete(token.opId);
    }
    if (s.holder !== token.opId) return; // not the holder (already released / timed out)
    s.holder = null;
    const next = s.waiters.shift();
    if (next) {
      s.holder = next.token.opId;
      this.armTimeout(s, next.token);
      next.resolve(next.token);
    }
  }

  /** True if this op was superseded or timed out; callers must drop its writes. */
  isStale(token: LockToken): boolean {
    const s = this.slots.get(token.instanceId);
    if (!s) return true;
    return s.stale.has(token.opId);
  }

  /**
   * Invalidate the current holder and every queued op on an instance.
   * Called by regenerate / fork / god-edit: in-flight work targets a branch that is
   * about to be replaced, so its writes must be ignored (the op still runs to
   * completion and releases, but `isStale` is now true for it).
   */
  supersede(instanceId: string): void {
    const s = this.slots.get(instanceId);
    if (!s) return;
    if (s.holder !== null) s.stale.add(s.holder);
    for (const w of s.waiters) s.stale.add(w.token.opId);
  }
}

/** Process-wide singleton: the lock is in-memory, local-first, one writer per instance. */
export const instanceLock = new InstanceLock();
