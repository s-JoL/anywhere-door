import { describe, it, expect } from "vitest";
import { InstanceLock } from "../lock";

describe("InstanceLock (§4.0 instance operation lock)", () => {
  it("acquires immediately when free", async () => {
    const lock = new InstanceLock();
    const t = await lock.acquire("w1");
    expect(t.instanceId).toBe("w1");
    expect(t.opId).toBeGreaterThan(0);
  });

  it("serializes overlapping ops on one instance: the second waits for release, not interleaved", async () => {
    const lock = new InstanceLock();
    const order: string[] = [];

    const first = lock.acquire("w1").then(async (t) => {
      order.push("A-start");
      // yield to the event loop; if the lock leaked, B would slip in here
      await Promise.resolve();
      await Promise.resolve();
      order.push("A-end");
      lock.release(t);
    });

    const second = lock.acquire("w1").then((t) => {
      order.push("B-start");
      lock.release(t);
    });

    await Promise.all([first, second]);
    expect(order).toEqual(["A-start", "A-end", "B-start"]);
  });

  it("does not block across different instances", async () => {
    const lock = new InstanceLock();
    const a = await lock.acquire("w1");
    // a different instance must not be blocked by w1's held lock
    const b = await lock.acquire("w2");
    expect(b.instanceId).toBe("w2");
    lock.release(a);
    lock.release(b);
  });

  it("supersede marks the current holder and queued ops stale (writes must be dropped)", async () => {
    const lock = new InstanceLock();
    const held = await lock.acquire("w1");
    const queuedP = lock.acquire("w1");

    lock.supersede("w1");
    expect(lock.isStale(held)).toBe(true);

    lock.release(held);
    const queued = await queuedP;
    expect(lock.isStale(queued)).toBe(true);
  });

  it("a fresh op after supersede is not stale", async () => {
    const lock = new InstanceLock();
    const old = await lock.acquire("w1");
    lock.supersede("w1");
    lock.release(old);
    const fresh = await lock.acquire("w1");
    expect(lock.isStale(fresh)).toBe(false);
  });

  it("timeout marks the op stale and releases the lock so the queue proceeds", async () => {
    const lock = new InstanceLock(10); // 10ms safety timeout
    const stuck = await lock.acquire("w1");
    const nextP = lock.acquire("w1");
    // never release `stuck` explicitly; the timeout must free the lock
    const next = await nextP;
    expect(lock.isStale(stuck)).toBe(true);
    expect(next.opId).not.toBe(stuck.opId);
    lock.release(next);
  });

  it("release is idempotent and safe on an unknown token", () => {
    const lock = new InstanceLock();
    expect(() => lock.release({ instanceId: "nope", opId: 999 })).not.toThrow();
  });

  it("isStale is true for an unknown instance", () => {
    const lock = new InstanceLock();
    expect(lock.isStale({ instanceId: "ghost", opId: 1 })).toBe(true);
  });
});
