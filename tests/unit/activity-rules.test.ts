import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { publishProblems, validateSchedule, type RuleQuestion } from "../../src/lib/activity-rules";
import { isoToLocalInput, localInputToIso } from "../../src/lib/datetime";

const d = (iso: string) => new Date(iso);
const NOW = d("2030-01-01T00:00:00Z");
const validQuestion = (): RuleQuestion => ({
  questionText: "What is 2 + 2?",
  points: 1,
  choices: [
    { choiceText: "3", isCorrect: false },
    { choiceText: "4", isCorrect: true },
  ],
});
const validArgs = () => ({
  title: "Quiz 1",
  classroomArchived: false,
  opensAt: d("2030-01-02T08:00:00Z"),
  closesAt: d("2030-01-02T09:00:00Z"),
  durationMinutes: null,
  questions: [validQuestion()],
  now: NOW,
});

describe("validateSchedule", () => {
  it("accepts an empty schedule (drafts may leave dates blank)", () => {
    assert.deepEqual(validateSchedule(null, null, null), {});
  });

  it("rejects a closing time that is not after the opening time", () => {
    const errors = validateSchedule(d("2030-01-02T09:00:00Z"), d("2030-01-02T08:00:00Z"), null);
    assert.ok(errors.closesAt);
  });

  it("rejects equal opening and closing times", () => {
    const t = d("2030-01-02T09:00:00Z");
    assert.ok(validateSchedule(t, t, null).closesAt);
  });

  it("rejects a duration longer than the open window", () => {
    const errors = validateSchedule(d("2030-01-02T08:00:00Z"), d("2030-01-02T08:30:00Z"), 45);
    assert.ok(errors.durationMinutes);
  });

  it("accepts a duration that fits inside the window", () => {
    assert.deepEqual(validateSchedule(d("2030-01-02T08:00:00Z"), d("2030-01-02T09:00:00Z"), 30), {});
  });

  it("rejects non-positive or non-integer durations", () => {
    assert.ok(validateSchedule(null, null, 0).durationMinutes);
    assert.ok(validateSchedule(null, null, 2.5).durationMinutes);
  });
});

describe("publishProblems", () => {
  it("passes a complete, correctly scheduled activity", () => {
    assert.deepEqual(publishProblems(validArgs()), {});
  });

  it("requires at least one question", () => {
    assert.ok(publishProblems({ ...validArgs(), questions: [] }).questions);
  });

  it("requires exactly one correct answer (none)", () => {
    const q = validQuestion();
    q.choices.forEach((c) => (c.isCorrect = false));
    assert.ok(publishProblems({ ...validArgs(), questions: [q] })["questions.0.choices"]);
  });

  it("requires exactly one correct answer (two)", () => {
    const q = validQuestion();
    q.choices.forEach((c) => (c.isCorrect = true));
    assert.ok(publishProblems({ ...validArgs(), questions: [q] })["questions.0.choices"]);
  });

  it("requires at least two choices", () => {
    const q = { ...validQuestion(), choices: [{ choiceText: "only", isCorrect: true }] };
    assert.ok(publishProblems({ ...validArgs(), questions: [q] })["questions.0.choices"]);
  });

  it("reports blank question and choice text with precise nested keys", () => {
    const q: RuleQuestion = {
      questionText: "   ",
      points: 1,
      choices: [
        { choiceText: "", isCorrect: true },
        { choiceText: "ok", isCorrect: false },
      ],
    };
    const errors = publishProblems({ ...validArgs(), questions: [q] });
    assert.ok(errors["questions.0.questionText"]);
    assert.ok(errors["questions.0.choices.0.choiceText"]);
    assert.equal(errors["questions.0.choices.1.choiceText"], undefined);
  });

  it("rejects points outside 1..100 and non-integers", () => {
    for (const points of [0, 101, 1.5]) {
      const q = { ...validQuestion(), points };
      assert.ok(publishProblems({ ...validArgs(), questions: [q] })["questions.0.points"], `points=${points}`);
    }
  });

  it("requires a schedule with a future closing time", () => {
    assert.ok(publishProblems({ ...validArgs(), opensAt: null })["opensAt"]);
    assert.ok(publishProblems({ ...validArgs(), closesAt: null })["closesAt"]);
    const past = publishProblems({ ...validArgs(), closesAt: d("2029-12-31T10:00:00Z"), opensAt: d("2029-12-31T09:00:00Z") });
    assert.ok(past.closesAt);
  });

  it("refuses an archived classroom and a blank title", () => {
    assert.ok(publishProblems({ ...validArgs(), classroomArchived: true }).classroomId);
    assert.ok(publishProblems({ ...validArgs(), title: "  " }).title);
  });
});

describe("datetime conversions", () => {
  it("round-trips a local datetime-local value", () => {
    const value = "2030-06-15T14:45";
    assert.equal(isoToLocalInput(localInputToIso(value)), value);
  });

  it("returns null / empty for blank or invalid input", () => {
    assert.equal(localInputToIso(""), null);
    assert.equal(localInputToIso("not a date"), null);
    assert.equal(isoToLocalInput(null), "");
    assert.equal(isoToLocalInput("garbage"), "");
  });
});
