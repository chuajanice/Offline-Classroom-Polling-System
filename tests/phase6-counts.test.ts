// Phase 6: active counts exclude archived activities everywhere they are shown
// (dashboard tiles and classroom cards). Against MySQL. Fixtures use their own prefix.
import "dotenv/config";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import type { ActivityInput } from "../src/lib/builder-validation";
import { removeFixtures } from "./helpers/fixtures";
import { createClassroom, listClassrooms } from "../src/services/classroom.service";
import { createActivity, getDashboardStats } from "../src/services/activity.service";
import { archiveActivity } from "../src/services/session.service";

const PREFIX = "ph6-counts-";
const run = randomBytes(4).toString("hex");
let owner: number;
let room: number;

const draft = (classroomId: number, title: string): ActivityInput => ({
  classroomId,
  title,
  instructions: null,
  opensAt: null,
  closesAt: null,
  durationMinutes: null,
  maxAttempts: 1,
  questions: [],
});

before(async () => {
  await removeFixtures(PREFIX);
  owner = (await prisma.instructor.create({ data: { fullName: "Count Owner", email: `${PREFIX}${run}@example.test`, passwordHash: "x" } })).id;
  room = (await createClassroom(owner, { classroomName: "Count room", description: null })).id;
});

after(async () => {
  await removeFixtures(PREFIX);
  await prisma.$disconnect();
});

describe("active counts", () => {
  it("dashboard counts one active activity when two exist and one is archived", async () => {
    const baseline = await getDashboardStats(owner);
    const keep = await createActivity(owner, draft(room, "Stays active"));
    const gone = await createActivity(owner, draft(room, "Will be archived"));
    await archiveActivity(owner, gone.id);
    const after = await getDashboardStats(owner);
    assert.equal(after.activities - baseline.activities, 1, "only the active activity is counted");
    assert.ok(after.recent.some((a) => a.id === keep.id));
    assert.ok(!after.recent.some((a) => a.id === gone.id), "archived activity is not in recent");
  });

  it("the classroom card counts only active activities", async () => {
    const card = (await listClassrooms(owner)).find((c) => c.id === room);
    assert.ok(card, "classroom is listed");
    const activeInDb = await prisma.activity.count({ where: { classroomId: room, archivedAt: null } });
    assert.equal(card.activityCount, activeInDb, "card count matches the active activities in the database");
  });
});
