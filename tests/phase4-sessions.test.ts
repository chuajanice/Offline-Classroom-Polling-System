// Phase 4 Stage B: opening, closing, deadlines, archiving and restoring, against MySQL.
// Test rows use "phase4-" e-mails and are removed afterwards.
import "dotenv/config";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { AppError } from "../src/lib/errors";
import { isWellFormedSessionCode } from "../src/lib/session-code";
import type { ActivityInput } from "../src/lib/builder-validation";
import { archiveClassroom, createClassroom, listArchivedClassrooms, restoreClassroom } from "../src/services/classroom.service";
import { createActivity, listActivities, publishActivity, getDashboardStats } from "../src/services/activity.service";
import { archiveActivity, closeActivity, openActivity, restoreActivity } from "../src/services/session.service";
import { closeIfDeadlinePassed } from "../src/services/lifecycle";

const run = randomBytes(4).toString("hex");
const PUBLISH_NOW = new Date("2030-01-01T00:00:00Z");
const BEFORE_WINDOW = new Date("2030-03-01T07:00:00Z");
const CLOSES = new Date("2030-03-01T09:00:00Z");

let owner: number;
let other: number;
let room: number;

const input = (classroomId: number, title = "Session quiz"): ActivityInput => ({
  classroomId,
  title,
  instructions: null,
  opensAt: "2030-03-01T08:00:00.000Z",
  closesAt: CLOSES.toISOString(),
  durationMinutes: null,
  maxAttempts: 1,
  questions: [{ questionText: "1+1?", points: 1, choices: [{ choiceText: "2", isCorrect: true }, { choiceText: "3", isCorrect: false }] }],
});

/** A published activity, ready to open. */
async function ready(classroomId = room, title?: string) {
  const a = await createActivity(owner, input(classroomId, title));
  await publishActivity(owner, a.id, PUBLISH_NOW);
  return a.id;
}

const isStatus = (status: number, code: string) => (e: unknown) =>
  e instanceof AppError && e.status === status && e.code === code;

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

before(async () => {
  await removeTestData();
  owner = (await prisma.instructor.create({ data: { fullName: "Owner", email: `phase4-${run}-owner@example.test`, passwordHash: "x" } })).id;
  other = (await prisma.instructor.create({ data: { fullName: "Other", email: `phase4-${run}-other@example.test`, passwordHash: "x" } })).id;
  room = (await createClassroom(owner, { classroomName: "Session room", description: null })).id;
});

after(async () => {
  await removeTestData();
  await prisma.$disconnect();
});

describe("opening an activity", () => {
  it("refuses a draft that has not been published", async () => {
    const a = await createActivity(owner, input(room, "Unpublished"));
    await assert.rejects(openActivity(owner, a.id, BEFORE_WINDOW), isStatus(409, "NOT_PUBLISHED"));
  });

  it("opens a published activity: session code, opened_at, status OPEN", async () => {
    const id = await ready(room, "Opens cleanly");
    const opened = await openActivity(owner, id, BEFORE_WINDOW);
    assert.equal(opened.status, "OPEN");
    assert.ok(opened.sessionCode && isWellFormedSessionCode(opened.sessionCode), `code ${opened.sessionCode}`);
    assert.ok(opened.openedAt, "opened_at set");
    assert.equal(opened.closedAt, null);
  });

  it("gives every open activity its own code", async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const id = await ready(room, `Batch ${i}`);
      codes.add((await openActivity(owner, id, BEFORE_WINDOW)).sessionCode!);
    }
    assert.equal(codes.size, 5);
  });

  it("refuses to open twice, and cannot reopen a closed activity", async () => {
    const id = await ready(room, "Once only");
    await openActivity(owner, id, BEFORE_WINDOW);
    await assert.rejects(openActivity(owner, id, BEFORE_WINDOW), isStatus(409, "ALREADY_OPEN"));
    await closeActivity(owner, id, BEFORE_WINDOW);
    await assert.rejects(openActivity(owner, id, BEFORE_WINDOW), isStatus(409, "ACTIVITY_CLOSED"));
  });

  it("refuses to open an activity whose classroom is archived", async () => {
    const archivedRoom = (await createClassroom(owner, { classroomName: "Soon archived", description: null })).id;
    const id = await ready(archivedRoom, "Hidden");
    await archiveClassroom(owner, archivedRoom);
    await assert.rejects(openActivity(owner, id, BEFORE_WINDOW), isStatus(409, "CLASSROOM_ARCHIVED"));
  });

  it("refuses to open an archived activity", async () => {
    const id = await ready(room, "Archived first");
    await archiveActivity(owner, id, BEFORE_WINDOW);
    await assert.rejects(openActivity(owner, id, BEFORE_WINDOW), isStatus(409, "ACTIVITY_ARCHIVED"));
  });

  it("another instructor cannot open the activity (404)", async () => {
    const id = await ready(room, "Mine only");
    await assert.rejects(openActivity(other, id, BEFORE_WINDOW), isStatus(404, "NOT_FOUND"));
  });
});

describe("closing and deadlines", () => {
  it("closes an open activity and records closed_at; closing again is harmless", async () => {
    const id = await ready(room, "Close me");
    await openActivity(owner, id, BEFORE_WINDOW);
    const closed = await closeActivity(owner, id, BEFORE_WINDOW);
    assert.equal(closed.status, "CLOSED");
    assert.ok(closed.closedAt);
    const again = await closeActivity(owner, id, BEFORE_WINDOW);
    assert.equal(again.status, "CLOSED");
  });

  it("refuses to close a draft", async () => {
    const a = await createActivity(owner, input(room, "Draft close"));
    await assert.rejects(closeActivity(owner, a.id, BEFORE_WINDOW), isStatus(409, "NOT_OPEN"));
  });

  it("closes automatically once the scheduled closing time has passed", async () => {
    const id = await ready(room, "Deadline");
    await openActivity(owner, id, BEFORE_WINDOW);
    assert.equal(await closeIfDeadlinePassed(id, new Date("2030-03-01T08:59:00Z")), false, "not yet");
    assert.equal(await closeIfDeadlinePassed(id, new Date("2030-03-01T09:30:00Z")), true, "deadline passed");
    const row = await prisma.activity.findUniqueOrThrow({ where: { id } });
    assert.equal(row.status, "CLOSED");
    assert.equal(row.closedAt?.toISOString(), CLOSES.toISOString(), "closed_at is the scheduled time");
    assert.equal(await closeIfDeadlinePassed(id, new Date("2030-03-01T10:00:00Z")), false, "only once");
  });
});

describe("archiving activities", () => {
  it("archiving an open activity closes it first, then archives it", async () => {
    const id = await ready(room, "Archive while open");
    await openActivity(owner, id, BEFORE_WINDOW);
    const archived = await archiveActivity(owner, id, BEFORE_WINDOW);
    assert.equal(archived.status, "CLOSED");
    assert.ok(archived.archivedAt);
    assert.ok(archived.sessionCode, "history keeps the session code");
  });

  it("archived activities leave the active list and appear in the archived list", async () => {
    const id = await ready(room, "Listed as archived");
    await archiveActivity(owner, id, BEFORE_WINDOW);
    assert.ok(!(await listActivities(owner, room)).some((a) => a.id === id));
    assert.ok((await listActivities(owner, room, true)).some((a) => a.id === id));
  });

  it("restoring keeps the status: a closed activity stays closed", async () => {
    const id = await ready(room, "Restore keeps state");
    await openActivity(owner, id, BEFORE_WINDOW);
    await archiveActivity(owner, id, BEFORE_WINDOW);
    const restored = await restoreActivity(owner, id);
    assert.equal(restored.archivedAt, null);
    assert.equal(restored.status, "CLOSED");
  });

  it("keeps questions, choices and schedule through archive and restore", async () => {
    const id = await ready(room, "Keeps content");
    await archiveActivity(owner, id, BEFORE_WINDOW);
    const back = await restoreActivity(owner, id);
    assert.equal(back.questions.length, 1);
    assert.equal(back.questions[0].choices.length, 2);
    assert.equal(back.opensAt, "2030-03-01T08:00:00.000Z");
  });

  it("another instructor cannot archive or restore it (404)", async () => {
    const id = await ready(room, "Not theirs");
    await assert.rejects(archiveActivity(other, id, BEFORE_WINDOW), isStatus(404, "NOT_FOUND"));
    await archiveActivity(owner, id, BEFORE_WINDOW);
    await assert.rejects(restoreActivity(other, id), isStatus(404, "NOT_FOUND"));
  });

  it("dashboard statistics exclude archived activities", async () => {
    const before = await getDashboardStats(owner);
    const id = await ready(room, "Counted then archived");
    await archiveActivity(owner, id, BEFORE_WINDOW);
    const after = await getDashboardStats(owner);
    assert.equal(after.activities, before.activities, "archived activity is not counted");
  });
});

describe("archiving classrooms", () => {
  it("archiving a classroom closes its open activities, and restoring does not reopen them", async () => {
    const r = (await createClassroom(owner, { classroomName: "Closing room", description: null })).id;
    const id = await ready(r, "Was open");
    await openActivity(owner, id, BEFORE_WINDOW);
    await archiveClassroom(owner, r, BEFORE_WINDOW);
    assert.equal((await prisma.activity.findUniqueOrThrow({ where: { id } })).status, "CLOSED");

    await restoreClassroom(owner, r);
    assert.equal((await prisma.activity.findUniqueOrThrow({ where: { id } })).status, "CLOSED", "not reopened");
  });

  it("archived classrooms are listed for restore, then return to the active list", async () => {
    const r = (await createClassroom(owner, { classroomName: "Restorable", description: null })).id;
    await archiveClassroom(owner, r);
    assert.ok((await listArchivedClassrooms(owner)).some((c) => c.id === r));
    await restoreClassroom(owner, r);
    assert.ok(!(await listArchivedClassrooms(owner)).some((c) => c.id === r));
  });

  it("another instructor cannot archive or restore a classroom (404)", async () => {
    const r = (await createClassroom(owner, { classroomName: "Guarded room", description: null })).id;
    await assert.rejects(archiveClassroom(other, r), isStatus(404, "NOT_FOUND"));
    await archiveClassroom(owner, r);
    await assert.rejects(restoreClassroom(other, r), isStatus(404, "NOT_FOUND"));
  });
});
