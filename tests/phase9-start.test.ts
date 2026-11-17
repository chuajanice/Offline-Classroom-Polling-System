// Stage 9: the timer starts only when the student presses Start. Against MySQL.
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
import { openActivity } from "../src/services/session.service";
import { getStudentActivity, joinActivity, recordExitEvent, startAttempt } from "../src/services/student.service";

const run = randomBytes(4).toString("hex");
const PREFIX = "phase9-start-";
const PUBLISH_NOW = new Date("2030-01-01T00:00:00Z");
const BEFORE = new Date("2030-03-01T07:00:00Z");
const LATER = new Date("2030-03-01T07:05:00Z");
const AFTER_CLOSE = new Date("2030-03-01T10:00:00Z");
let owner: number;
let room: number;

const input = (title: string): ActivityInput => ({
  classroomId: room,
  title,
  instructions: null,
  opensAt: "2030-03-01T08:00:00.000Z",
  closesAt: "2030-03-01T09:00:00.000Z",
  durationMinutes: null,
  maxAttempts: 1,
  questions: [
    { questionText: "Q1", points: 1, choices: [{ choiceText: "a", isCorrect: true }, { choiceText: "b", isCorrect: false }] },
  ],
});

async function openedActivity(title: string) {
  const a = await createActivity(owner, input(title));
  await publishActivity(owner, a.id, PUBLISH_NOW);
  const opened = await openActivity(owner, a.id, BEFORE);
  return { id: a.id, code: opened.sessionCode! };
}

const startsFor = (activityId: number) =>
  prisma.attemptStart.count({ where: { participant: { activityId } } });

before(async () => {
  await removeFixtures(PREFIX);
  owner = (await prisma.instructor.create({ data: { fullName: "Owner", email: `${PREFIX}${run}@example.test`, passwordHash: "x" } })).id;
  room = (await createClassroom(owner, { classroomName: "Start room", description: null })).id;
});

after(async () => {
  await removeFixtures(PREFIX);
  await prisma.$disconnect();
});

describe("start step (Stage 9)", () => {
  it("showing the instructions does not start the timer", async () => {
    const a = await openedActivity("View only");
    const { token } = await joinActivity({ sessionCode: a.code, fullName: "View Only", studentId: "V-1" }, BEFORE);
    const view = await getStudentActivity(a.id, token, BEFORE);
    assert.equal(view.attempt.state, "instructions");
    assert.equal(view.questions.length, 0, "questions are hidden until Start");
    assert.equal(await startsFor(a.id), 0, "no attempt start is recorded");
  });

  it("an exit event before Start is ignored and cannot start the clock", async () => {
    const a = await openedActivity("Leave before start");
    const { token } = await joinActivity({ sessionCode: a.code, fullName: "Early Leaver", studentId: "V-2" }, BEFORE);
    const r = await recordExitEvent(a.id, token, "left", LATER);
    assert.equal(r.outcome, "ignored");
    assert.equal(await startsFor(a.id), 0);
  });

  it("pressing Start begins the attempt and shows the questions", async () => {
    const a = await openedActivity("Press start");
    const { token } = await joinActivity({ sessionCode: a.code, fullName: "Starter", studentId: "V-3" }, BEFORE);
    const result = await startAttempt(a.id, token, BEFORE);
    assert.equal(result.started, true);
    const view = await getStudentActivity(a.id, token, LATER);
    assert.equal(view.attempt.state, "ready");
    assert.equal(view.questions.length, 1);
  });

  it("pressing Start again keeps the original start time, so the clock cannot be reset", async () => {
    const a = await openedActivity("Press twice");
    const { token } = await joinActivity({ sessionCode: a.code, fullName: "Twice", studentId: "V-4" }, BEFORE);
    await startAttempt(a.id, token, BEFORE);
    await startAttempt(a.id, token, LATER);
    const start = await prisma.attemptStart.findFirstOrThrow({ where: { participant: { activityId: a.id } } });
    assert.equal(start.startedAt.toISOString(), BEFORE.toISOString());
  });

  it("refuses to start an activity that has already closed", async () => {
    const a = await openedActivity("Too late");
    const { token } = await joinActivity({ sessionCode: a.code, fullName: "Late", studentId: "V-5" }, BEFORE);
    await assert.rejects(startAttempt(a.id, token, AFTER_CLOSE), (e: unknown) => e instanceof AppError && e.code === "ACTIVITY_CLOSED");
  });
});
