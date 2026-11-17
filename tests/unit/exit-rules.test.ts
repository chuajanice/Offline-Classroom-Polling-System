// Pure exit-warning rules (Stage 3). No database needed.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decideExit } from "../../src/lib/exit-rules";

describe("decideExit", () => {
  it("first leave records the warning and leaves the dialog pending", () => {
    assert.deepEqual(decideExit(0, null, "left"), { outcome: "pending", change: { warnedNow: true } });
  });

  it("repeated leave events while the dialog is pending do not escalate", () => {
    // One hide can fire visibilitychange and pagehide together.
    assert.deepEqual(decideExit(1, null, "left"), { outcome: "pending", change: {} });
  });

  it("NO (stay) is recorded once and allows the attempt to continue", () => {
    assert.deepEqual(decideExit(1, null, "stay"), { outcome: "stayed", change: { decision: "STAY" } });
  });

  it("a second leave after NO zeroes the attempt, with no dialog", () => {
    assert.deepEqual(decideExit(1, "STAY", "left"), { outcome: "zeroed", change: { zero: true } });
  });

  it("YES (leave) on the warning zeroes the attempt", () => {
    assert.deepEqual(decideExit(1, null, "leave"), { outcome: "zeroed", change: { zero: true } });
  });

  it("never zeroes twice: an already zeroed attempt is ignored", () => {
    assert.deepEqual(decideExit(2, null, "left"), { outcome: "zeroed", change: {} });
    assert.deepEqual(decideExit(2, "STAY", "leave"), { outcome: "zeroed", change: {} });
  });

  it("an answer without a warning is ignored", () => {
    assert.equal(decideExit(0, null, "stay").outcome, "ignored");
    assert.equal(decideExit(0, null, "leave").outcome, "ignored");
  });

  it("a second NO is ignored", () => {
    assert.equal(decideExit(1, "STAY", "stay").outcome, "ignored");
  });
});
