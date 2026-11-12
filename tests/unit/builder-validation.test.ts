import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AppError } from "../../src/lib/errors";
import {
  activityInputSchema,
  classroomInputSchema,
  classroomUpdateSchema,
  parseDottedOrThrow,
  parseIdParam,
  toPositiveId,
} from "../../src/lib/builder-validation";

const validActivity = () => ({
  classroomId: 3,
  title: "  Quiz 1  ",
  instructions: "",
  opensAt: "2030-01-02T08:00:00.000Z",
  closesAt: "2030-01-02T09:00:00.000Z",
  durationMinutes: 30,
  maxAttempts: 2,
  questions: [
    {
      questionText: "Q?",
      points: 2,
      choices: [
        { choiceText: "a", isCorrect: true },
        { choiceText: "b", isCorrect: false },
      ],
    },
  ],
});

function fieldsOf(fn: () => unknown): Record<string, string> {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof AppError);
    assert.equal(error.status, 400);
    return error.fields ?? {};
  }
  assert.fail("expected a validation error");
}

describe("classroom schemas", () => {
  it("trims the name and turns a blank description into null", () => {
    const out = classroomInputSchema.parse({ classroomName: "  BSIT 3A ", description: "   " });
    assert.equal(out.classroomName, "BSIT 3A");
    assert.equal(out.description, null);
  });

  it("requires a name", () => {
    const fields = fieldsOf(() => parseDottedOrThrow(classroomInputSchema, { classroomName: "   " }));
    assert.ok(fields.classroomName);
  });

  it("update with no fields is rejected, and a partial update keeps other fields absent", () => {
    assert.throws(() => classroomUpdateSchema.parse({}));
    const out = classroomUpdateSchema.parse({ classroomName: "New name" });
    assert.equal(out.description, undefined);
  });
});

describe("activity schema", () => {
  it("accepts a complete activity", () => {
    assert.equal(activityInputSchema.parse(validActivity()).title, "Quiz 1");
  });

  it("accepts a draft with an empty question and blank choices (drafts may be incomplete)", () => {
    const draft = { ...validActivity(), questions: [{ questionText: "", points: 1, choices: [] }] };
    assert.doesNotThrow(() => activityInputSchema.parse(draft));
  });

  it("rejects attempt limits other than 1 or 2", () => {
    const fields = fieldsOf(() =>
      parseDottedOrThrow(activityInputSchema, { ...validActivity(), maxAttempts: 3 }),
    );
    assert.ok(fields.maxAttempts);
  });

  it("rejects more than the allowed number of choices", () => {
    const choices = Array.from({ length: 7 }, (_, i) => ({ choiceText: `c${i}`, isCorrect: i === 0 }));
    const input = { ...validActivity(), questions: [{ questionText: "Q", points: 1, choices }] };
    const fields = fieldsOf(() => parseDottedOrThrow(activityInputSchema, input));
    assert.ok(fields["questions.0.choices"]);
  });

  it("rejects a malformed date and a non-integer duration", () => {
    const fields = fieldsOf(() =>
      parseDottedOrThrow(activityInputSchema, { ...validActivity(), opensAt: "tomorrow", durationMinutes: 2.5 }),
    );
    assert.ok(fields.opensAt);
    assert.ok(fields.durationMinutes);
  });

  it("reports nested question errors with dotted paths", () => {
    const input = {
      ...validActivity(),
      questions: [{ questionText: "x".repeat(1001), points: 1, choices: [] }],
    };
    const fields = fieldsOf(() => parseDottedOrThrow(activityInputSchema, input));
    assert.ok(fields["questions.0.questionText"]);
  });
});

describe("id parsing", () => {
  it("accepts positive integers only", () => {
    assert.equal(toPositiveId("42"), 42);
    for (const bad of ["0", "-1", "1.5", "abc", "", "99999999999"]) {
      assert.equal(toPositiveId(bad), null, bad);
    }
  });

  it("throws a 404 AppError from parseIdParam for bad input", () => {
    assert.throws(() => parseIdParam("nope"), (e: unknown) => e instanceof AppError && e.status === 404);
  });
});
