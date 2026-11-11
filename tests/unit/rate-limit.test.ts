import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FailedAttemptLimiter } from "../../src/lib/rate-limit";

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

describe("FailedAttemptLimiter", () => {
  it("allows attempts until the failure limit is reached", () => {
    const c = clock();
    const l = new FailedAttemptLimiter(5, 600_000, c.now);
    for (let i = 0; i < 5; i++) {
      assert.equal(l.check("a@b.co").allowed, true, `attempt ${i + 1} should be allowed`);
      l.recordFailure("a@b.co");
    }
    const blocked = l.check("a@b.co");
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.retryAfterSeconds, 600);
  });

  it("reports a shrinking retry time and unblocks when the window passes", () => {
    const c = clock();
    const l = new FailedAttemptLimiter(2, 60_000, c.now);
    l.recordFailure("k");
    c.advance(10_000);
    l.recordFailure("k");
    assert.equal(l.check("k").allowed, false);
    assert.equal(l.check("k").retryAfterSeconds, 50);
    c.advance(50_001);
    assert.equal(l.check("k").allowed, true);
  });

  it("a successful login (reset) clears the counter", () => {
    const l = new FailedAttemptLimiter(2, 60_000, clock().now);
    l.recordFailure("k");
    l.recordFailure("k");
    assert.equal(l.check("k").allowed, false);
    l.reset("k");
    assert.equal(l.check("k").allowed, true);
  });

  it("keeps keys independent", () => {
    const l = new FailedAttemptLimiter(1, 60_000, clock().now);
    l.recordFailure("one@x.co");
    assert.equal(l.check("one@x.co").allowed, false);
    assert.equal(l.check("two@x.co").allowed, true);
  });

  it("old failures age out one by one", () => {
    const c = clock();
    const l = new FailedAttemptLimiter(3, 60_000, c.now);
    l.recordFailure("k");
    c.advance(30_000);
    l.recordFailure("k");
    l.recordFailure("k");
    assert.equal(l.check("k").allowed, false);
    c.advance(30_001); // the first failure is now older than the window
    assert.equal(l.check("k").allowed, true);
  });
});
