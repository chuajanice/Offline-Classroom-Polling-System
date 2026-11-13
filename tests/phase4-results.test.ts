// Phase 4 Stage E: instructor results, retake authorisation, access release, privacy. Against MySQL.
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
import { authorizeRetake, getActivityResults, releaseAccess } from "../src/services/results.service";

const run = randomBytes(4).toString("hex");
/** Unique per file: parallel test files never delete each other's rows. */
const PREFIX = "ph6-p4res-";
const PUBLISH_NOW = new Date("2030-01-01T00:00:00Z");
const OPEN_AT = new Date("2030-03-01T07:00:00Z");
const WINDOW = new Date("2030-03-01T08:00:00Z");
let owner: number;
let other: number;
let room: number;

async function openedActivity(title: string, maxAttempts: 1 | 2 = 2) {
  const input: ActivityInput = {
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
  };
  const a = await createActivity(owner, input);
  await publishActivity(owner, a.id, PUBLISH_NOW);
  const opened = await openActivity(owner, a.id, OPEN_AT);
  const qs = await prisma.question.findMany({ where: { activityId: a.id }, orderBy: { position: "asc" }, include: { choices: { orderBy: { position: "asc" } } } });
  const correct = (qi: number) => qs[qi].choices.find((c) => c.isCorrect)!.id;
  const wrong = (qi: number) => qs[qi].choices.find((c) => !c.isCorrect)!.id;
  return {
    id: a.id,
    code: opened.sessionCode!,
    qs: qs.map((q) => q.id),
    correct,
    wrong,
  };
}

async function studentJoin(a: { code: string }, name: string) {
  return joinActivity({ sessionCode: a.code, fullName: name }, OPEN_AT);
}

const isStatus = (status: number, code: string) => (e: unknown) =>
  e instanceof AppError && e.status === status && e.code === code;

async function removeTestData() {
  await removeFixtures(PREFIX);
}

before(async () => {
  await removeTestData();
  owner = (await prisma.instructor.create({ data: { fullName: "Owner", email: `${PREFIX}${run}-owner@example.test`, passwordHash: "x" } })).id;
  other = (await prisma.instructor.create({ data: { fullName: "Other", email: `${PREFIX}${run}-other@example.test`, passwordHash: "x" } })).id;
  room = (await createClassroom(owner, { classroomName: "Results room", description: null })).id;
});

after(async () => {
  await removeTestData();
  await prisma.$disconnect();
});

describe("instructor results", () => {
  it("summarises participants, scores and per-question statistics", async () => {
    const a = await openedActivity("Results summary");
    const ana = await studentJoin(a, "Ana Results");
    const ben = await studentJoin(a, "Ben Results");
    await getStudentActivity(a.id, ana.token, WINDOW);
    await getStudentActivity(a.id, ben.token, WINDOW);
    await submitAnswers(a.id, ana.token, { answers: [{ questionId: a.qs[0], choiceId: a.correct(0) }, { questionId: a.qs[1], choiceId: a.correct(1) }] }, WINDOW);
    await submitAnswers(a.id, ben.token, { answers: [{ questionId: a.qs[0], choiceId: a.wrong(0) }] }, WINDOW);

    const r = await getActivityResults(owner, a.id);
    assert.equal(r.summary.participantCount, 2);
    assert.equal(r.summary.submittedCount, 2);
    assert.equal(r.summary.averagePercentage, 50, "(100% + 0%) / 2");
    const ana1 = r.participants.find((p) => p.displayName === "Ana Results")!;
    assert.equal(ana1.attempts[0].score, 3);
    assert.equal(ana1.attempts[0].percentage, 100);
    const q1 = r.questionStats[0];
    assert.equal(q1.answered, 2);
    assert.equal(q1.correct, 1, "one of the two answered the capital correctly");
  });

  it("never exposes session tokens or their hashes", async () => {
    const a = await openedActivity("No secrets");
    const s = await studentJoin(a, "Secret Kid");
    const json = JSON.stringify(await getActivityResults(owner, a.id));
    assert.ok(!json.includes(s.token));
    assert.ok(!json.includes("sessionTokenHash"));
    assert.ok(!json.includes("session_token_hash"));
  });

  it("another instructor cannot see results, authorise retakes or release access (404)", async () => {
    const a = await openedActivity("Private results");
    const s = await studentJoin(a, "Private Kid");
    await assert.rejects(getActivityResults(other, a.id), isStatus(404, "NOT_FOUND"));
    const p = await prisma.participant.findFirstOrThrow({ where: { activityId: a.id } });
    await assert.rejects(releaseAccess(other, a.id, p.id), isStatus(404, "NOT_FOUND"));
    await assert.rejects(authorizeRetake(other, a.id, p.id), isStatus(404, "NOT_FOUND"));
    assert.ok(s.token);
  });
});

describe("retakes", () => {
  it("is authorised once, only after attempt 1 and only while open", async () => {
    const a = await openedActivity("Retake rules");
    const s = await studentJoin(a, "Retake Rules Kid");
    const p = await prisma.participant.findFirstOrThrow({ where: { activityId: a.id } });
    await assert.rejects(authorizeRetake(owner, a.id, p.id), isStatus(409, "RETAKE_NOT_ALLOWED"), "before attempt 1");
    await getStudentActivity(a.id, s.token, WINDOW);
    await submitAnswers(a.id, s.token, { answers: [] }, WINDOW);
    await authorizeRetake(owner, a.id, p.id);
    await assert.rejects(authorizeRetake(owner, a.id, p.id), isStatus(409, "RETAKE_EXISTS"), "only once");
  });

  it("is refused when the activity allows only one attempt", async () => {
    const a = await openedActivity("Single rules", 1);
    const s = await studentJoin(a, "Single Rules Kid");
    const p = await prisma.participant.findFirstOrThrow({ where: { activityId: a.id } });
    await getStudentActivity(a.id, s.token, WINDOW);
    await submitAnswers(a.id, s.token, { answers: [] }, WINDOW);
    await assert.rejects(authorizeRetake(owner, a.id, p.id), isStatus(409, "RETAKE_NOT_ALLOWED"));
  });

  it("is refused once the activity is closed", async () => {
    const a = await openedActivity("Closed retake");
    const s = await studentJoin(a, "Closed Retake Kid");
    const p = await prisma.participant.findFirstOrThrow({ where: { activityId: a.id } });
    await getStudentActivity(a.id, s.token, WINDOW);
    await submitAnswers(a.id, s.token, { answers: [] }, WINDOW);
    await closeActivity(owner, a.id, WINDOW);
    await assert.rejects(authorizeRetake(owner, a.id, p.id), isStatus(409, "ACTIVITY_CLOSED"));
  });

  it("marks the retake as used after the second attempt, and results show both attempts", async () => {
    const a = await openedActivity("Retake used");
    const s = await studentJoin(a, "Used Retake Kid");
    const p = await prisma.participant.findFirstOrThrow({ where: { activityId: a.id } });
    await getStudentActivity(a.id, s.token, WINDOW);
    await submitAnswers(a.id, s.token, { answers: [] }, WINDOW);
    await authorizeRetake(owner, a.id, p.id);
    await getStudentActivity(a.id, s.token, WINDOW);
    await submitAnswers(a.id, s.token, { answers: [{ questionId: a.qs[0], choiceId: a.correct(0) }] }, WINDOW);
    const r = await getActivityResults(owner, a.id);
    const row = r.participants.find((x) => x.participantId === p.id)!;
    assert.equal(row.retake.status, "used");
    assert.deepEqual(row.attempts.map((x) => x.attemptNumber), [1, 2]);
    assert.equal(row.canAuthorizeRetake, false);
  });
});

describe("releasing access", () => {
  it("the old token stops working at once; the same name rejoins and keeps its history", async () => {
    const a = await openedActivity("Lost device");
    const old = await studentJoin(a, "Lost Device Kid");
    await getStudentActivity(a.id, old.token, WINDOW);
    await submitAnswers(a.id, old.token, { answers: [{ questionId: a.qs[0], choiceId: a.correct(0) }] }, WINDOW);

    await releaseAccess(owner, a.id, old.participantId);
    await assert.rejects(getStudentActivity(a.id, old.token, WINDOW), isStatus(401, "UNAUTHENTICATED"));

    const back = await studentJoin(a, "Lost Device Kid");
    assert.equal(back.participantId, old.participantId, "same participant reclaimed");
    assert.notEqual(back.token, old.token, "a new token was issued");
    const view = await getStudentActivity(a.id, back.token, WINDOW);
    assert.equal(view.results.length, 1, "the earlier submission is still there");
    assert.equal(view.results[0].score, 2);
  });

  it("without a release, a taken name still cannot join", async () => {
    const a = await openedActivity("No release");
    await studentJoin(a, "Still Taken");
    await assert.rejects(studentJoin(a, "still   taken"), isStatus(409, "NAME_TAKEN"));
  });

  it("releasing one student does not free another student's name", async () => {
    const a = await openedActivity("Only one freed");
    const first = await studentJoin(a, "Freed Kid");
    await studentJoin(a, "Still Held");
    await releaseAccess(owner, a.id, first.participantId);
    await assert.rejects(studentJoin(a, "Still Held"), isStatus(409, "NAME_TAKEN"));
  });
});
