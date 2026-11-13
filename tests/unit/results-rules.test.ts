import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { currentResult, percentOf, submissionStatus, SUBMISSION_STATUS_LABEL } from "../../src/lib/results-rules";

describe("percentages", () => {
  it("rounds to two decimals", () => {
    assert.equal(percentOf(2, 3), 66.67);
    assert.equal(percentOf(1, 3), 33.33);
    assert.equal(percentOf(3, 3), 100);
    assert.equal(percentOf(0, 3), 0);
  });

  it("gives 0 instead of dividing by zero", () => {
    assert.equal(percentOf(0, 0), 0);
  });

  it("is exact for simple fractions", () => {
    assert.equal(percentOf(5, 8), 62.5);
    assert.equal(percentOf(7, 7), 100);
  });
});

describe("current result", () => {
  it("is null when nothing was submitted", () => {
    assert.equal(currentResult([]), null);
  });

  it("is attempt 1 when there is only one attempt", () => {
    assert.deepEqual(currentResult([{ attemptNumber: 1 }]), { attemptNumber: 1 });
  });

  it("is attempt 2 once a retake exists, regardless of its score", () => {
    const attempts = [
      { attemptNumber: 1, score: 3 },
      { attemptNumber: 2, score: 0 },
    ];
    assert.equal(currentResult(attempts)?.attemptNumber, 2);
  });

  it("does not depend on the order the attempts were supplied in", () => {
    assert.equal(currentResult([{ attemptNumber: 2 }, { attemptNumber: 1 }])?.attemptNumber, 2);
  });
});

describe("submission status", () => {
  it("covers every stage a participant can be in", () => {
    assert.equal(submissionStatus([], "none"), "not_submitted");
    assert.equal(submissionStatus([1], "none"), "submitted");
    assert.equal(submissionStatus([1], "authorized"), "retake_authorized");
    assert.equal(submissionStatus([1, 2], "used"), "retake_submitted");
  });

  it("has a readable label for every status", () => {
    assert.equal(SUBMISSION_STATUS_LABEL.not_submitted, "Not submitted");
    assert.equal(SUBMISSION_STATUS_LABEL.retake_submitted, "Retake submitted");
  });
});
