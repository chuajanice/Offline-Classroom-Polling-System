// Integration tests for each question and choice operation in the Activity
// Builder (add, edit, delete, reorder), against the REAL MySQL database.
// Each operation is a save of the builder's full state, so every test checks
// the stored result after the save. Test rows use "phase3-" e-mails and are removed afterwards.
import "dotenv/config";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { removeFixtures } from "./helpers/fixtures";
import { AppError } from "../src/lib/errors";
import type { ActivityInput } from "../src/lib/builder-validation";
import { createClassroom } from "../src/services/classroom.service";
import {
  createActivity,
  publishActivity,
  updateActivity,
} from "../src/services/activity.service";

const run = randomBytes(4).toString("hex");
/** Unique per file: parallel test files never delete each other's rows. */
const PREFIX = "ph6-p3ops-";
const NOW = new Date("2030-01-01T00:00:00Z");
let ownerId: number;
let classroomId: number;

type Q = ActivityInput["questions"][number];
const q = (questionText: string, points: number, choices: Array<[string, boolean]>): Q => ({
  questionText,
  points,
  choices: choices.map(([choiceText, isCorrect]) => ({ choiceText, isCorrect })),
});
const baseQuestions = (): Q[] => [
  q("Capital of France?", 2, [["Berlin", false], ["Paris", true], ["Rome", false]]),
  q("2 + 2?", 1, [["4", true], ["5", false]]),
];
const input = (questions: Q[], extra: Partial<ActivityInput> = {}): ActivityInput => ({
  classroomId,
  title: "Quiz",
  instructions: null,
  opensAt: "2030-03-01T08:00:00.000Z",
  closesAt: "2030-03-01T09:00:00.000Z",
  durationMinutes: null,
  maxAttempts: 1,
  questions,
  ...extra,
});

async function removeTestData() {
  await removeFixtures(PREFIX);
}

before(async () => {
  await removeTestData();
  ownerId = (await prisma.instructor.create({
    data: { fullName: "Builder Ops", email: `${PREFIX}${run}-ops@example.test`, passwordHash: "not-used-in-tests" },
  })).id;
  classroomId = (await createClassroom(ownerId, { classroomName: "Ops room", description: null })).id;
});

after(async () => {
  await removeTestData();
  await prisma.$disconnect();
});

/** Creates a draft with the base questions, ready for an operation. */
async function fresh(questions = baseQuestions()) {
  return createActivity(ownerId, input(questions));
}

describe("question operations", () => {
  it("adds a question at the end", async () => {
    const a = await fresh();
    const { activity } = await updateActivity(ownerId, a.id, input([...baseQuestions(), q("Largest planet?", 1, [["Jupiter", true], ["Mars", false]])]));
    assert.equal(activity.questionCount, 3);
    assert.deepEqual(activity.questions.map((x) => x.position), [1, 2, 3]);
    assert.equal(activity.questions[2].questionText, "Largest planet?");
  });

  it("edits a question's text and points", async () => {
    const a = await fresh();
    const edited = baseQuestions();
    edited[1] = q("2 + 3?", 5, [["4", false], ["5", true]]);
    const { activity } = await updateActivity(ownerId, a.id, input(edited));
    assert.equal(activity.questions[1].questionText, "2 + 3?");
    assert.equal(activity.questions[1].points, 5);
    assert.equal(activity.questions[1].choices.find((c) => c.isCorrect)?.choiceText, "5");
  });

  it("deletes a question and leaves no orphaned rows behind", async () => {
    const a = await fresh();
    const { activity } = await updateActivity(ownerId, a.id, input([baseQuestions()[0]]));
    assert.equal(activity.questionCount, 1);
    const rows = await prisma.question.count({ where: { activityId: a.id } });
    assert.equal(rows, 1);
    const choiceRows = await prisma.choice.count({ where: { question: { activityId: a.id } } });
    assert.equal(choiceRows, 3, "only the remaining question's three choices exist");
  });

  it("reorders questions and keeps positions contiguous", async () => {
    const a = await fresh();
    const { activity } = await updateActivity(ownerId, a.id, input([...baseQuestions()].reverse()));
    assert.deepEqual(activity.questions.map((x) => x.questionText), ["2 + 2?", "Capital of France?"]);
    assert.deepEqual(activity.questions.map((x) => x.position), [1, 2]);
  });
});

describe("choice operations", () => {
  it("adds a choice and numbers it after the others", async () => {
    const a = await fresh();
    const questions = baseQuestions();
    questions[1].choices.push({ choiceText: "6", isCorrect: false });
    const { activity } = await updateActivity(ownerId, a.id, input(questions));
    assert.deepEqual(activity.questions[1].choices.map((c) => c.position), [1, 2, 3]);
    assert.equal(activity.questions[1].choices[2].choiceText, "6");
  });

  it("edits a choice's text", async () => {
    const a = await fresh();
    const questions = baseQuestions();
    questions[0].choices[0].choiceText = "Bern";
    const { activity } = await updateActivity(ownerId, a.id, input(questions));
    assert.equal(activity.questions[0].choices[0].choiceText, "Bern");
  });

  it("deletes a choice and renumbers the rest", async () => {
    const a = await fresh();
    const questions = baseQuestions();
    questions[0].choices.splice(0, 1); // remove "Berlin"
    const { activity } = await updateActivity(ownerId, a.id, input(questions));
    assert.deepEqual(activity.questions[0].choices.map((c) => c.choiceText), ["Paris", "Rome"]);
    assert.deepEqual(activity.questions[0].choices.map((c) => c.position), [1, 2]);
  });

  it("reorders choices so positions follow the new order", async () => {
    const a = await fresh();
    const questions = baseQuestions();
    questions[0].choices.reverse();
    const { activity } = await updateActivity(ownerId, a.id, input(questions));
    assert.deepEqual(activity.questions[0].choices.map((c) => c.choiceText), ["Rome", "Paris", "Berlin"]);
    assert.deepEqual(activity.questions[0].choices.map((c) => c.position), [1, 2, 3]);
  });

  it("moves the correct answer with a radio-button change, and publishing still needs exactly one", async () => {
    const a = await fresh();
    const questions = baseQuestions();
    // Mark two choices correct: a draft may hold this, publishing may not.
    questions[1].choices[1].isCorrect = true;
    const draft = await updateActivity(ownerId, a.id, input(questions));
    assert.equal(draft.activity.questions[1].choices.filter((c) => c.isCorrect).length, 2);

    await assert.rejects(publishActivity(ownerId, a.id, NOW), (e: unknown) =>
      e instanceof AppError && "questions.1.choices" in (e.fields ?? {}),
    );

    questions[1].choices[0].isCorrect = false; // exactly one correct again
    await updateActivity(ownerId, a.id, input(questions));
    const published = await publishActivity(ownerId, a.id, NOW);
    assert.equal(published.isPublished, true);
    assert.equal(published.questions[1].choices.find((c) => c.isCorrect)?.choiceText, "5");
  });

  it("refuses a question with no correct answer at publish time", async () => {
    const a = await fresh();
    const questions = baseQuestions();
    questions[0].choices.forEach((c) => (c.isCorrect = false));
    await updateActivity(ownerId, a.id, input(questions));
    await assert.rejects(publishActivity(ownerId, a.id, NOW), (e: unknown) =>
      e instanceof AppError && "questions.0.choices" in (e.fields ?? {}),
    );
  });
});
