// Integration tests for classroom management against the REAL MySQL database.
// Requires DATABASE_URL in .env and the Phase 3 migration applied.
// Test rows use instructor e-mails starting with "phase3-" and are removed afterwards.
import "dotenv/config";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { removeFixtures } from "./helpers/fixtures";
import { AppError } from "../src/lib/errors";
import {
  archiveClassroom,
  createClassroom,
  getClassroom,
  listClassrooms,
  updateClassroom,
} from "../src/services/classroom.service";
import { createActivity } from "../src/services/activity.service";

const run = randomBytes(4).toString("hex");
/** Unique per file: parallel test files never delete each other's rows. */
const PREFIX = "ph6-p3cls-";
const isStatus = (status: number, code: string) => (e: unknown) =>
  e instanceof AppError && e.status === status && e.code === code;

let owner: number;
let stranger: number;

async function removeTestData() {
  await removeFixtures(PREFIX);
}

before(async () => {
  await removeTestData();
  owner = (await prisma.instructor.create({
    data: { fullName: "Owner", email: `${PREFIX}${run}-owner@example.test`, passwordHash: "not-used-in-tests" },
  })).id;
  stranger = (await prisma.instructor.create({
    data: { fullName: "Stranger", email: `${PREFIX}${run}-stranger@example.test`, passwordHash: "not-used-in-tests" },
  })).id;
});

after(async () => {
  await removeTestData();
  await prisma.$disconnect();
});

describe("classroom management", () => {
  it("creates a classroom for the instructor and lists it", async () => {
    const created = await createClassroom(owner, { classroomName: "BSIT 3A", description: "Networking" });
    assert.equal(created.classroomName, "BSIT 3A");
    assert.equal(created.activityCount, 0);

    const list = await listClassrooms(owner);
    assert.ok(list.some((c) => c.id === created.id));
  });

  it("edits a classroom's name and description", async () => {
    const created = await createClassroom(owner, { classroomName: "Old name", description: null });
    const updated = await updateClassroom(owner, created.id, { classroomName: "New name" });
    assert.equal(updated.classroomName, "New name");
    assert.equal(updated.description, null);
  });

  it("shows only the instructor's own classrooms", async () => {
    const mine = await createClassroom(owner, { classroomName: "Mine only", description: null });
    const others = await listClassrooms(stranger);
    assert.ok(!others.some((c) => c.id === mine.id));
  });

  it("prevents another instructor from reading or editing a classroom (404, not 403)", async () => {
    const mine = await createClassroom(owner, { classroomName: "Protected", description: null });
    await assert.rejects(getClassroom(stranger, mine.id), isStatus(404, "NOT_FOUND"));
    await assert.rejects(
      updateClassroom(stranger, mine.id, { classroomName: "Hijacked" }),
      isStatus(404, "NOT_FOUND"),
    );
    await assert.rejects(archiveClassroom(stranger, mine.id), isStatus(404, "NOT_FOUND"));
  });

  it("archives instead of deleting: it leaves the list, keeps its activities, and blocks new ones", async () => {
    const room = await createClassroom(owner, { classroomName: "To archive", description: null });
    await createActivity(owner, {
      classroomId: room.id,
      title: "Kept activity",
      instructions: null,
      opensAt: null,
      closesAt: null,
      durationMinutes: null,
      maxAttempts: 1,
      questions: [],
    });

    const archived = await archiveClassroom(owner, room.id);
    assert.notEqual(archived.archivedAt, null);
    assert.equal(archived.activityCount, 1, "activities are kept");
    assert.ok(!(await listClassrooms(owner)).some((c) => c.id === room.id));

    await assert.rejects(updateClassroom(owner, room.id, { classroomName: "x" }), isStatus(409, "CLASSROOM_ARCHIVED"));
    await assert.rejects(
      createActivity(owner, {
        classroomId: room.id,
        title: "Too late",
        instructions: null,
        opensAt: null,
        closesAt: null,
        durationMinutes: null,
        maxAttempts: 1,
        questions: [],
      }),
      (e: unknown) => e instanceof AppError && e.status === 400,
    );
  });

  it("counts the activities in a classroom", async () => {
    const room = await createClassroom(owner, { classroomName: "Counted", description: null });
    await createActivity(owner, {
      classroomId: room.id,
      title: "One",
      instructions: null,
      opensAt: null,
      closesAt: null,
      durationMinutes: null,
      maxAttempts: 1,
      questions: [],
    });
    assert.equal((await getClassroom(owner, room.id)).activityCount, 1);
  });
});
