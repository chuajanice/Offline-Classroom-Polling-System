// Stage 7: permanent delete of an archived activity, against MySQL.
// Test rows use the "phase8-" e-mail prefix and are removed afterwards.
import "dotenv/config";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { removeFixtures } from "./helpers/fixtures";
import { AppError } from "../src/lib/errors";
import type { ActivityInput } from "../src/lib/builder-validation";
import { createClassroom } from "../src/services/classroom.service";
import { createActivity, permanentlyDeleteActivity, publishActivity } from "../src/services/activity.service";
import { archiveActivity, openActivity } from "../src/services/session.service";
import { joinActivity, submitAnswers } from "../src/services/student.service";

const run = randomBytes(4).toString("hex");
const PREFIX = "phase8-purge-";
const PUBLISH_NOW = new Date("2030-01-01T00:00:00Z");
const BEFORE = new Date("2030-03-01T07:00:00Z");
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

before(async () => {
  await removeFixtures(PREFIX);
  owner = (await prisma.instructor.create({ data: { fullName: "Owner", email: `${PREFIX}${run}@example.test`, passwordHash: "x" } })).id;
  room = (await createClassroom(owner, { classroomName: "Purge room", description: null })).id;
});

after(async () => {
  await removeFixtures(PREFIX);
  await prisma.$disconnect();
});

describe("permanent delete (Stage 7)", () => {
  it("refuses to delete an activity that is not archived", async () => {
    const a = await openedActivity("Still open");
    await assert.rejects(
      permanentlyDeleteActivity(owner, a.id),
      (e: unknown) => e instanceof AppError && e.code === "ACTIVITY_NOT_ARCHIVED",
    );
  });

  it("removes the archived activity and its dependents, and keeps everything else", async () => {
    const doomed = await openedActivity("Doomed");
    const keeper = await openedActivity("Keeper");

    const token = (await joinActivity({ sessionCode: doomed.code, fullName: "Gone Student", studentId: "D-1" }, BEFORE)).token;
    await submitAnswers(doomed.id, token, { answers: [] }, BEFORE);
    const keeperToken = (await joinActivity({ sessionCode: keeper.code, fullName: "Stays Student", studentId: "K-1" }, BEFORE)).token;

    await archiveActivity(owner, doomed.id, BEFORE);
    await permanentlyDeleteActivity(owner, doomed.id);

    assert.equal(await prisma.activity.count({ where: { id: doomed.id } }), 0);
    assert.equal(await prisma.question.count({ where: { activityId: doomed.id } }), 0);
    assert.equal(await prisma.participant.count({ where: { activityId: doomed.id } }), 0);
    assert.equal(await prisma.submission.count({ where: { participant: { activityId: doomed.id } } }), 0);

    // Unrelated records survive: the classroom, the other activity and its participant.
    assert.equal(await prisma.classroom.count({ where: { id: room } }), 1);
    assert.equal(await prisma.activity.count({ where: { id: keeper.id } }), 1);
    assert.equal(await prisma.participant.count({ where: { activityId: keeper.id } }), 1);
    assert.ok(keeperToken.length > 0);
  });

  it("does not let another instructor delete the activity", async () => {
    const a = await openedActivity("Not yours");
    await archiveActivity(owner, a.id, BEFORE);
    const other = (await prisma.instructor.create({ data: { fullName: "Other", email: `${PREFIX}${run}-b@example.test`, passwordHash: "x" } })).id;
    await assert.rejects(permanentlyDeleteActivity(other, a.id), (e: unknown) => e instanceof AppError);
    assert.equal(await prisma.activity.count({ where: { id: a.id } }), 1);
  });
});
