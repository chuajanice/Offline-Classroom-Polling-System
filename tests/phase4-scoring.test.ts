// Phase 4 Stage D/E: submission, server-side scoring, time limits, single retake
// and concurrency, against MySQL. Test rows use "phase4-" e-mails and are removed afterwards.
import "dotenv/config";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { removeFixtures } from "./helpers/fixtures";
import { AppError } from "../src/lib/errors";
import type { ActivityInput } from "../src/lib/builder-validation";
import { createClassroom } from "../src/services/classroom.service";
import { createActivity, publishActivity } from "../src/services/activity.service";
import { closeActivity, openActivity } from "../src/services/session.service";
import { getStudentActivity, joinActivity, submitAnswers } from "../src/services/student.service";

const run = randomBytes(4).toString("hex");
/** Unique per file: parallel test files never delete each other's rows. */
const PREFIX = "ph6-p4score-";
const PUBLISH_NOW = new Date("2030-01-01T00:00:00Z");
const OPEN_AT = new Date("2030-03-01T07:00:00Z");
const WINDOW_START = new Date("2030-03-01T08:00:00Z");
let owner: number;
let room: number;

type Built = { id: number; code: string; q: { capital: number; paris: number; sum: number; four: number } };

async function openedActivity(title: string, opts: { maxAttempts?: 1 | 2; durationMinutes?: number | null; closes?: string } = {}): Promise<Built> {
  const closes = opts.closes ?? "2030-03-01T09:00:00.000Z";
  const input: ActivityInput = {
    classroomId: room,
    title,
    instructions: null,
    opensAt: WINDOW_START.toISOString(),
    closesAt: closes,
    durationMinutes: opts.durationMinutes ?? null,
    maxAttempts: opts.maxAttempts ?? 1,
    questions: [
      { questionText: "Capital of France?", points: 2, choices: [{ choiceText: "Berlin", isCorrect: false }, { choiceText: "Paris", isCorrect: true }] },
      { questionText: "2 + 2?", points: 1, choices: [{ choiceText: "4", isCorrect: true }, { choiceText: "5", isCorrect: false }] },
    ],
  };
  const a = await createActivity(owner, input);
  await publishActivity(owner, a.id, PUBLISH_NOW);
  const opened = await openActivity(owner, a.id, OPEN_AT);
  const detail = await prisma.question.findMany({ where: { activityId: a.id }, orderBy: { position: "asc" }, include: { choices: { orderBy: { position: "asc" } } } });
  const [q1, q2] = detail;
  return {
    id: a.id,
    code: opened.sessionCode!,
    q: {
      capital: q1.id,
      paris: q1.choices.find((c) => c.isCorrect)!.id,
      sum: q2.id,
      four: q2.choices.find((c) => c.isCorrect)!.id,
    },
  };
}

async function student(a: Built, name: string) {
  const { token } = await joinActivity({ sessionCode: a.code, fullName: name }, OPEN_AT);
  return token;
}

const isStatus = (status: number, code: string) => (e: unknown) =>
  e instanceof AppError && e.status === status && e.code === code;

async function removeTestData() {
  await removeFixtures(PREFIX);
}

before(async () => {
  await removeTestData();
  owner = (await prisma.instructor.create({ data: { fullName: "Owner", email: `${PREFIX}${run}@example.test`, passwordHash: "x" } })).id;
  room = (await createClassroom(owner, { classroomName: "Scoring room", description: null })).id;
});

after(async () => {
  await removeTestData();
  await prisma.$disconnect();
});

describe("submitting answers", () => {
  it("scores on the server: correct answers earn points, wrong and blank answers earn zero", async () => {
    const a = await openedActivity("Score basics");
    const token = await student(a, "Score Basic");
    await getStudentActivity(a.id, token, WINDOW_START);
    const wrong = (await prisma.choice.findFirstOrThrow({ where: { questionId: a.q.capital, isCorrect: false } })).id;
    const result = await submitAnswers(a.id, token, { answers: [{ questionId: a.q.capital, choiceId: wrong }, { questionId: a.q.sum, choiceId: a.q.four }] }, WINDOW_START);
    assert.equal(result.score, 1, "one point for 2+2, nothing for the wrong capital");
    assert.equal(result.maxScore, 3);
    assert.equal(result.percentage, 33.33);
  });

  it("stores the answers with a snapshot of correctness and awarded points", async () => {
    const a = await openedActivity("Stored snapshot");
    const token = await student(a, "Snapshot Kid");
    await getStudentActivity(a.id, token, WINDOW_START);
    const result = await submitAnswers(a.id, token, { answers: [{ questionId: a.q.capital, choiceId: a.q.paris }] }, WINDOW_START);
    const row = await prisma.submission.findFirstOrThrow({ where: { attemptNumber: result.attemptNumber, participant: { activity: { id: a.id } } }, include: { answers: true } });
    assert.equal(Number(row.score.toString()), 2);
    assert.equal(row.answers.length, 1);
    assert.equal(row.answers[0].isCorrect, true);
    assert.equal(Number(row.answers[0].awardedPoints.toString()), 2);
  });

  it("a student may submit only once for the first attempt", async () => {
    const a = await openedActivity("Once");
    const token = await student(a, "Once Only");
    await getStudentActivity(a.id, token, WINDOW_START);
    await submitAnswers(a.id, token, { answers: [] }, WINDOW_START);
    await assert.rejects(submitAnswers(a.id, token, { answers: [] }, WINDOW_START), isStatus(409, "NO_ATTEMPT_LEFT"));
  });

  it("rejects a choice from another question, and a question answered twice", async () => {
    const a = await openedActivity("Invalid answers");
    const token = await student(a, "Invalid Answer");
    await getStudentActivity(a.id, token, WINDOW_START);
    await assert.rejects(
      submitAnswers(a.id, token, { answers: [{ questionId: a.q.capital, choiceId: a.q.four }] }, WINDOW_START),
      isStatus(400, "ANSWER_INVALID"),
    );
    await assert.rejects(
      submitAnswers(a.id, token, { answers: [{ questionId: a.q.capital, choiceId: a.q.paris }, { questionId: a.q.capital, choiceId: a.q.paris }] }, WINDOW_START),
      isStatus(400, "ANSWER_INVALID"),
    );
  });

  it("refuses submissions once the activity is closed", async () => {
    const a = await openedActivity("Closed submit");
    const token = await student(a, "Late Submit");
    await getStudentActivity(a.id, token, WINDOW_START);
    await closeActivity(owner, a.id, WINDOW_START);
    await assert.rejects(submitAnswers(a.id, token, { answers: [] }, WINDOW_START), isStatus(409, "ACTIVITY_CLOSED"));
  });

  it("refuses a submission after the scheduled closing time, even before anyone closed it", async () => {
    const a = await openedActivity("Deadline submit");
    const token = await student(a, "Deadline Kid");
    await getStudentActivity(a.id, token, WINDOW_START);
    await assert.rejects(
      submitAnswers(a.id, token, { answers: [] }, new Date("2030-03-01T09:00:01Z")),
      isStatus(409, "ACTIVITY_CLOSED"),
    );
  });

  it("enforces the time limit from when the questions were first shown", async () => {
    const a = await openedActivity("Timed", { durationMinutes: 5 });
    const late = await student(a, "Too Slow");
    await getStudentActivity(a.id, late, WINDOW_START);
    await assert.rejects(
      submitAnswers(a.id, late, { answers: [] }, new Date("2030-03-01T08:06:00Z")),
      isStatus(409, "TIME_UP"),
    );

    const quick = await student(a, "On Time");
    await getStudentActivity(a.id, quick, WINDOW_START);
    const result = await submitAnswers(a.id, quick, { answers: [] }, new Date("2030-03-01T08:04:00Z"));
    assert.equal(result.score, 0);
  });

  it("the student view reports time-up and hides the questions when the limit has passed", async () => {
    const a = await openedActivity("Time up view", { durationMinutes: 5 });
    const token = await student(a, "Viewer Kid");
    await getStudentActivity(a.id, token, WINDOW_START);
    const view = await getStudentActivity(a.id, token, new Date("2030-03-01T08:10:00Z"));
    assert.equal(view.attempt.state, "timeUp");
    assert.equal(view.questions.length, 0);
  });

  it("after submitting, the view shows the result and no questions", async () => {
    const a = await openedActivity("Result view");
    const token = await student(a, "Result Kid");
    await getStudentActivity(a.id, token, WINDOW_START);
    await submitAnswers(a.id, token, { answers: [{ questionId: a.q.capital, choiceId: a.q.paris }] }, WINDOW_START);
    const view = await getStudentActivity(a.id, token, WINDOW_START);
    assert.equal(view.attempt.state, "finished");
    assert.equal(view.questions.length, 0);
    assert.equal(view.results.length, 1);
    assert.equal(view.results[0].score, 2);
    assert.ok(!JSON.stringify(view).includes("isCorrect"));
  });

  it("two simultaneous submissions for the same attempt: exactly one is accepted", async () => {
    const a = await openedActivity("Race submit");
    const token = await student(a, "Racer");
    await getStudentActivity(a.id, token, WINDOW_START);
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => submitAnswers(a.id, token, { answers: [{ questionId: a.q.capital, choiceId: a.q.paris }] }, WINDOW_START)),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(await prisma.submission.count({ where: { participant: { activity: { id: a.id } } } }), 1);
  });
});

describe("authorised retakes", () => {
  it("without an authorisation the second attempt is not available", async () => {
    const a = await openedActivity("No retake", { maxAttempts: 2 });
    const token = await student(a, "No Retake");
    await getStudentActivity(a.id, token, WINDOW_START);
    await submitAnswers(a.id, token, { answers: [] }, WINDOW_START);
    const view = await getStudentActivity(a.id, token, WINDOW_START);
    assert.equal(view.attempt.state, "finished");
  });

  it("an authorised retake gives exactly one more attempt, which counts and is then used up", async () => {
    const a = await openedActivity("One retake", { maxAttempts: 2 });
    const token = await student(a, "Retake Kid");
    const p = await prisma.participant.findFirstOrThrow({ where: { activityId: a.id } });
    await getStudentActivity(a.id, token, WINDOW_START);
    await submitAnswers(a.id, token, { answers: [] }, WINDOW_START);

    await prisma.retakeAuthorization.create({ data: { participantId: p.id, authorizedBy: owner } });
    const again = await getStudentActivity(a.id, token, WINDOW_START);
    assert.equal(again.attempt.state, "ready");
    assert.equal(again.attempt.number, 2);

    const second = await submitAnswers(a.id, token, { answers: [{ questionId: a.q.capital, choiceId: a.q.paris }, { questionId: a.q.sum, choiceId: a.q.four }] }, WINDOW_START);
    assert.equal(second.attemptNumber, 2);
    assert.equal(second.score, 3);
    assert.ok((await prisma.retakeAuthorization.findUniqueOrThrow({ where: { participantId: p.id } })).usedAt, "used");
    await assert.rejects(submitAnswers(a.id, token, { answers: [] }, WINDOW_START), isStatus(409, "NO_ATTEMPT_LEFT"));
  });

  it("both attempts are kept as history, with their own scores", async () => {
    const a = await openedActivity("History kept", { maxAttempts: 2 });
    const token = await student(a, "History Kid");
    const p = await prisma.participant.findFirstOrThrow({ where: { activityId: a.id } });
    await getStudentActivity(a.id, token, WINDOW_START);
    await submitAnswers(a.id, token, { answers: [] }, WINDOW_START);
    await prisma.retakeAuthorization.create({ data: { participantId: p.id, authorizedBy: owner } });
    await getStudentActivity(a.id, token, WINDOW_START);
    await submitAnswers(a.id, token, { answers: [{ questionId: a.q.capital, choiceId: a.q.paris }] }, WINDOW_START);
    const view = await getStudentActivity(a.id, token, WINDOW_START);
    assert.deepEqual(view.results.map((r) => r.attemptNumber), [1, 2]);
    assert.deepEqual(view.results.map((r) => r.score), [0, 2]);
  });

  it("a retake is not possible when the activity allows only one attempt", async () => {
    const a = await openedActivity("Single attempt activity", { maxAttempts: 1 });
    const token = await student(a, "Single Kid");
    const p = await prisma.participant.findFirstOrThrow({ where: { activityId: a.id } });
    await getStudentActivity(a.id, token, WINDOW_START);
    await submitAnswers(a.id, token, { answers: [] }, WINDOW_START);
    await prisma.retakeAuthorization.create({ data: { participantId: p.id, authorizedBy: owner } });
    const view = await getStudentActivity(a.id, token, WINDOW_START);
    assert.equal(view.attempt.state, "finished");
  });
});
