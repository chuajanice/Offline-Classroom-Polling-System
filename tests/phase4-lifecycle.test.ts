// Phase 4 Stage A: lifecycle guards and the new schema objects, against MySQL.
// An activity is moved to OPEN directly in the database here; Stage B adds the
// real open/close service. Test rows use "phase3-"/"phase4-" e-mails and are removed afterwards.
import "dotenv/config";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { AppError } from "../src/lib/errors";
import type { ActivityInput } from "../src/lib/builder-validation";
import { createClassroom } from "../src/services/classroom.service";
import { createActivity, deleteActivity, publishActivity, unpublishActivity, updateActivity } from "../src/services/activity.service";

const run = randomBytes(4).toString("hex");
const NOW = new Date("2030-01-01T00:00:00Z");
let ownerId: number;
let classroomId: number;

const input = (): ActivityInput => ({
  classroomId,
  title: "Lifecycle quiz",
  instructions: null,
  opensAt: "2030-03-01T08:00:00.000Z",
  closesAt: "2030-03-01T09:00:00.000Z",
  durationMinutes: null,
  maxAttempts: 1,
  questions: [{ questionText: "1+1?", points: 1, choices: [{ choiceText: "2", isCorrect: true }, { choiceText: "3", isCorrect: false }] }],
});

async function removeTestData() {
  const instructor = { email: { startsWith: "phase" } };
  await prisma.attemptStart.deleteMany({ where: { participant: { activity: { classroom: { instructor } } } } });
  await prisma.submissionAnswer.deleteMany({ where: { submission: { participant: { activity: { classroom: { instructor } } } } } });
  await prisma.submission.deleteMany({ where: { participant: { activity: { classroom: { instructor } } } } });
  await prisma.retakeAuthorization.deleteMany({ where: { participant: { activity: { classroom: { instructor } } } } });
  await prisma.participant.deleteMany({ where: { activity: { classroom: { instructor } } } });
  await prisma.activity.deleteMany({ where: { classroom: { instructor } } });
  await prisma.classroom.deleteMany({ where: { instructor } });
  await prisma.instructor.deleteMany({ where: { email: { startsWith: "phase" } } });
}

/** Moves an activity to OPEN the way Stage B will: code, opened_at, status together. */
async function forceOpen(activityId: number) {
  await prisma.activity.update({
    where: { id: activityId },
    data: { status: "OPEN", sessionCode: `T${activityId}${run.slice(0, 4)}`.toUpperCase(), openedAt: NOW },
  });
}

const isStatus = (status: number, code: string) => (e: unknown) =>
  e instanceof AppError && e.status === status && e.code === code;

before(async () => {
  await removeTestData();
  ownerId = (await prisma.instructor.create({
    data: { fullName: "Lifecycle", email: `phase4-${run}@example.test`, passwordHash: "not-used-in-tests" },
  })).id;
  classroomId = (await createClassroom(ownerId, { classroomName: "Lifecycle room", description: null })).id;
});

after(async () => {
  await removeTestData();
  await prisma.$disconnect();
});

describe("Phase 4 lifecycle guards", () => {
  it("a draft can still be edited, published and unpublished", async () => {
    const a = await createActivity(ownerId, input());
    await publishActivity(ownerId, a.id, NOW);
    const { activity } = await updateActivity(ownerId, a.id, input());
    assert.equal(activity.isPublished, false);
    await publishActivity(ownerId, a.id, NOW);
    await unpublishActivity(ownerId, a.id);
  });

  it("an OPEN activity cannot be edited, published, unpublished or deleted", async () => {
    const a = await createActivity(ownerId, input());
    await publishActivity(ownerId, a.id, NOW);
    await forceOpen(a.id);
    await assert.rejects(updateActivity(ownerId, a.id, input()), isStatus(409, "ACTIVITY_OPENED"));
    await assert.rejects(publishActivity(ownerId, a.id, NOW), isStatus(409, "ACTIVITY_OPENED"));
    await assert.rejects(unpublishActivity(ownerId, a.id), isStatus(409, "ACTIVITY_OPENED"));
    await assert.rejects(deleteActivity(ownerId, a.id), isStatus(409, "ACTIVITY_NOT_DRAFT"));
  });

  it("a CLOSED activity keeps its history and cannot be deleted", async () => {
    const a = await createActivity(ownerId, input());
    await publishActivity(ownerId, a.id, NOW);
    await prisma.activity.update({
      where: { id: a.id },
      data: { status: "CLOSED", sessionCode: `C${a.id}${run.slice(0, 4)}`.toUpperCase(), openedAt: NOW, closedAt: NOW },
    });
    await assert.rejects(deleteActivity(ownerId, a.id), isStatus(409, "ACTIVITY_NOT_DRAFT"));
    assert.ok(await prisma.activity.findUnique({ where: { id: a.id } }), "still stored");
  });

  it("the database refuses an archived activity that is OPEN (CHECK constraint)", async () => {
    const a = await createActivity(ownerId, input());
    await publishActivity(ownerId, a.id, NOW);
    await forceOpen(a.id);
    await assert.rejects(prisma.activity.update({ where: { id: a.id }, data: { archivedAt: NOW } }));
  });

  it("the database refuses attempt numbers other than 1 or 2", async () => {
    const a = await createActivity(ownerId, input());
    const p = await prisma.participant.create({
      data: {
        activityId: a.id,
        displayName: "Stage A",
        normalizedName: `stage a ${run}`,
        sessionTokenHash: randomBytes(32).toString("hex"),
      },
    });
    await assert.rejects(prisma.attemptStart.create({ data: { participantId: p.id, attemptNumber: 3, startedAt: NOW } }));
    await prisma.attemptStart.create({ data: { participantId: p.id, attemptNumber: 1, startedAt: NOW } });
    await assert.rejects(prisma.attemptStart.create({ data: { participantId: p.id, attemptNumber: 1, startedAt: NOW } }), "unique per attempt");
  });
});
