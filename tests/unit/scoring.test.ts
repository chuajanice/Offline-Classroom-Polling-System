import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { attemptDeadline, planAttempt, scoreAnswers } from "../../src/lib/attempt-rules";

const questions = [
  { id: 1, points: 2, choices: [{ id: 10, isCorrect: false }, { id: 11, isCorrect: true }] },
  { id: 2, points: 1, choices: [{ id: 20, isCorrect: true }, { id: 21, isCorrect: false }] },
  { id: 3, points: 5, choices: [{ id: 30, isCorrect: true }, { id: 31, isCorrect: false }] },
];

describe("scoring", () => {
  it("awards a question's points only for the correct choice", () => {
    const r = scoreAnswers(questions, [{ questionId: 1, choiceId: 11 }, { questionId: 2, choiceId: 21 }]);
    assert.equal(r.score, 2);
    assert.equal(r.maxScore, 8);
    assert.deepEqual(r.rows.map((x) => x.awardedPoints), [2, 0]);
  });

  it("unanswered questions score zero and are not stored as answers", () => {
    const r = scoreAnswers(questions, []);
    assert.equal(r.score, 0);
    assert.equal(r.rows.length, 0);
    assert.equal(r.maxScore, 8);
  });

  it("refuses a choice that belongs to a different question", () => {
    assert.throws(() => scoreAnswers(questions, [{ questionId: 1, choiceId: 20 }]), /does not belong/);
  });

  it("refuses an unknown question and a second answer to the same question", () => {
    assert.throws(() => scoreAnswers(questions, [{ questionId: 99, choiceId: 10 }]), /not part of this activity/);
    assert.throws(
      () => scoreAnswers(questions, [{ questionId: 1, choiceId: 10 }, { questionId: 1, choiceId: 11 }]),
      /answered only once/,
    );
  });
});

describe("attempt planning", () => {
  it("first attempt is available until submitted", () => {
    assert.deepEqual(planAttempt([], 1, null), { available: true, attemptNumber: 1 });
    assert.deepEqual(planAttempt([], 2, null), { available: true, attemptNumber: 1 });
  });

  it("nothing is left after one submission when no retake is authorised", () => {
    assert.deepEqual(planAttempt([1], 2, null), { available: false });
  });

  it("an authorised, unused retake gives attempt 2 only when the activity allows two attempts", () => {
    assert.deepEqual(planAttempt([1], 2, { usedAt: null }), { available: true, attemptNumber: 2 });
    assert.deepEqual(planAttempt([1], 1, { usedAt: null }), { available: false });
  });

  it("a used retake, or a second submission, leaves nothing", () => {
    assert.deepEqual(planAttempt([1], 2, { usedAt: new Date() }), { available: false });
    assert.deepEqual(planAttempt([1, 2], 2, { usedAt: new Date() }), { available: false });
  });
});

describe("deadlines", () => {
  const start = new Date("2030-03-01T08:00:00Z");
  const close = new Date("2030-03-01T09:00:00Z");

  it("uses the earlier of the time limit and the scheduled close", () => {
    assert.equal(attemptDeadline(start, 30, close)?.toISOString(), "2030-03-01T08:30:00.000Z");
    assert.equal(attemptDeadline(start, 120, close)?.toISOString(), "2030-03-01T09:00:00.000Z");
  });

  it("is the scheduled close when there is no time limit, and null when neither exists", () => {
    assert.equal(attemptDeadline(start, null, close)?.toISOString(), "2030-03-01T09:00:00.000Z");
    assert.equal(attemptDeadline(start, null, null), null);
  });
});
