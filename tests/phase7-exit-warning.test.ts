// Stage 3: exit warning and automatic zero, against MySQL.
// Test rows use "phase7-" e-mails and are removed afterwards.
import "dotenv/config";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { removeFixtures } from "./helpers/fixtures";
import { AppError } from "../src/lib/errors";
import type { ActivityInput } from "../src/lib/builder-validation";
import { createClassroom } from "../src/services/classroom.service";
import { createActivity, publishActivity } from "../src/services/activity.service";
import { openActivity } from "../src/services/session.service";
import { authorizeRetake } from "../src/services/results.service";
import { getStudentActivity, joinActivity, recordExitEvent, submitAnswers } from "../src/services/student.service";

const run = randomBytes(4).toString("hex");
const PREFIX = "phase7-exitwarn-";
const PUBLISH_NOW = new Date("2030-01-01T00:00:00Z");
const BEFORE = new Date("2030-03-01T07:00:00Z");
const LATER = new Date("2030-03-01T07:10:00Z");
let owner: number;
let room: number;

const input = (title: string, maxAttempts: 1 | 2 = 1): ActivityInput => ({
  classroomId: room,
  title,
  instructions: null,
  opensAt: "2030-03-01T08:00:00.000Z",
  closesAt: "2030-03-01T09:00:00.000Z",
  durationMinutes: null,
  maxAttempts,
  questions: [
    { questionText: "Capital of France?", points: 2, choices: [{ choiceText: "Berlin", isCorrect: false }, { choiceText: "Paris", isCorrect: true }] },
    { questionText: "2 + 2?", points: 1, choices: [{ choiceText: "4", isCorrect: true }, { choiceText: "5", isCorrect: false }] },
  ],
});

async function openedActivity(title: string, maxAttempts: 1 | 2 = 1) {
  const a = await createActivity(owner, input(title, maxAttempts));
  await publishActivity(owner, a.id, PUBLISH_NOW);
  const opened = await openActivity(owner, a.id, BEFORE);
  return { id: a.id, code: opened.sessionCode! };
}

async function joined(a: { id: number; code: string }, name: string, studentId: string) {
  const r = await joinActivity({ sessionCode: a.code, fullName: name, studentId }, BEFORE);
  return r.token;
}

const submissionsFor = (activityId: number, token: string) =>
  prisma.submission.findMany({
    where: { participant: { activityId, sessionTokenHash: hash(token) } },
    orderBy: { attemptNumber: "asc" },
  });

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

before(async () => {
  await removeFixtures(PREFIX);
  owner = (await prisma.instructor.create({ data: { fullName: "Owner", email: `${PREFIX}${run}@example.test`, passwordHash: "x" } })).id;
  room = (await createClassroom(owner, { classroomName: "Exit room", description: null })).id;
});

after(async () => {
  await removeFixtures(PREFIX);
  await prisma.$disconnect();
});

describe("exit warning (Stage 3)", () => {
  it("first leave shows the warning and submits nothing", async () => {
    const a = await openedActivity("Exit first");
    const token = await joined(a, "Exit One", "E-001");
    const r = await recordExitEvent(a.id, token, "left", LATER);
    assert.equal(r.outcome, "pending");
    assert.equal((await submissionsFor(a.id, token)).length, 0);
    const view = await getStudentActivity(a.id, token, LATER);
    assert.equal(view.exitWarning, "pending");
  });

  it("repeated leave events while pending do not escalate or zero", async () => {
    const a = await openedActivity("Exit repeat");
    const token = await joined(a, "Exit Two", "E-002");
    await recordExitEvent(a.id, token, "left", LATER);
    const again = await recordExitEvent(a.id, token, "left", LATER);
    assert.equal(again.outcome, "pending");
    assert.equal((await submissionsFor(a.id, token)).length, 0);
  });

  it("the warning state survives a reload: NO is remembered and the dialog is not shown again", async () => {
    const a = await openedActivity("Exit persist");
    const token = await joined(a, "Exit Three", "E-003");
    await recordExitEvent(a.id, token, "left", LATER);
    const stay = await recordExitEvent(a.id, token, "stay", LATER);
    assert.equal(stay.outcome, "stayed");
    const view = await getStudentActivity(a.id, token, LATER);
    assert.equal(view.exitWarning, "stayed");
    assert.equal((await submissionsFor(a.id, token)).length, 0);
  });

  it("a second leave after NO zeroes the attempt once, and later events add nothing", async () => {
    const a = await openedActivity("Exit second");
    const token = await joined(a, "Exit Four", "E-004");
    await recordExitEvent(a.id, token, "left", LATER);
    await recordExitEvent(a.id, token, "stay", LATER);
    const zeroed = await recordExitEvent(a.id, token, "left", LATER);
    assert.equal(zeroed.outcome, "zeroed");
    await recordExitEvent(a.id, token, "left", LATER);
    await recordExitEvent(a.id, token, "leave", LATER);
    const subs = await submissionsFor(a.id, token);
    assert.equal(subs.length, 1);
    assert.equal(Number(subs[0].score.toString()), 0);
    assert.equal(Number(subs[0].maxScore.toString()), 3);
    const view = await getStudentActivity(a.id, token, LATER);
    assert.deepEqual(view.zeroedAttempts, [1]);
  });

  it("YES on the warning zeroes the attempt immediately", async () => {
    const a = await openedActivity("Exit yes");
    const token = await joined(a, "Exit Five", "E-005");
    await recordExitEvent(a.id, token, "left", LATER);
    const r = await recordExitEvent(a.id, token, "leave", LATER);
    assert.equal(r.outcome, "zeroed");
    const subs = await submissionsFor(a.id, token);
    assert.equal(subs.length, 1);
    assert.equal(Number(subs[0].score.toString()), 0);
  });

  it("a zeroed attempt cannot be answered afterwards", async () => {
    const a = await openedActivity("Exit closed attempt");
    const token = await joined(a, "Exit Six", "E-006");
    await recordExitEvent(a.id, token, "left", LATER);
    await recordExitEvent(a.id, token, "leave", LATER);
    await assert.rejects(
      submitAnswers(a.id, token, { answers: [] }, LATER),
      (e: unknown) => e instanceof AppError && e.code === "NO_ATTEMPT_LEFT",
    );
  });

  it("an authorised retake has its own warning state and starts clean", async () => {
    const a = await openedActivity("Exit retake", 2);
    const token = await joined(a, "Exit Seven", "E-007");
    await recordExitEvent(a.id, token, "left", LATER);
    await recordExitEvent(a.id, token, "leave", LATER);
    const participant = await prisma.participant.findFirstOrThrow({ where: { activityId: a.id, sessionTokenHash: hash(token) } });
    await authorizeRetake(owner, a.id, participant.id);

    const view = await getStudentActivity(a.id, token, LATER);
    assert.equal(view.attempt.state, "ready");
    assert.equal(view.attempt.number, 2);
    assert.equal(view.exitWarning, "none");

    await recordExitEvent(a.id, token, "left", LATER);
    const subs = await submissionsFor(a.id, token);
    assert.equal(subs.length, 1, "attempt 1 stays zeroed and attempt 2 is not yet submitted");
  });

  it("rejects exit events from a token that does not belong to the activity", async () => {
    const a = await openedActivity("Exit auth");
    await assert.rejects(
      recordExitEvent(a.id, "not-a-real-token", "left", LATER),
      (e: unknown) => e instanceof AppError && e.status === 401,
    );
  });
});
