// Integration tests for the Activity Builder against the REAL MySQL database.
// Covers: create/edit/view/delete, drafts vs publishing, validation, schedules,
// question and choice ordering, one-correct-answer rule, ownership and the
// rule that editing a published activity returns it to draft.
import "dotenv/config";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { AppError } from "../src/lib/errors";
import type { ActivityInput } from "../src/lib/builder-validation";
import { archiveClassroom, createClassroom } from "../src/services/classroom.service";
import {
  createActivity,
  deleteActivity,
  getActivity,
  getDashboardStats,
  listActivities,
  publishActivity,
  unpublishActivity,
  updateActivity,
} from "../src/services/activity.service";

const run = randomBytes(4).toString("hex");
const FUTURE_OPEN = "2030-03-01T08:00:00.000Z";
const FUTURE_CLOSE = "2030-03-01T09:00:00.000Z";
const NOW = new Date("2030-01-01T00:00:00Z");

const isStatus = (status: number, code?: string) => (e: unknown) =>
  e instanceof AppError && e.status === status && (code === undefined || e.code === code);

let ownerId: number;
let otherId: number;
let classroomId: number;
let otherClassroomId: number;

function draft(overrides: Partial<ActivityInput> = {}): ActivityInput {
  return {
    classroomId,
    title: "Quiz 1",
    instructions: null,
    opensAt: null,
    closesAt: null,
    durationMinutes: null,
    maxAttempts: 1,
    questions: [],
    ...overrides,
  };
}

const validQuestions = (): ActivityInput["questions"] => [
  {
    questionText: "Capital of France?",
    points: 2,
    choices: [
      { choiceText: "Berlin", isCorrect: false },
      { choiceText: "Paris", isCorrect: true },
      { choiceText: "Rome", isCorrect: false },
    ],
  },
  {
    questionText: "2 + 2?",
    points: 1,
    choices: [
      { choiceText: "4", isCorrect: true },
      { choiceText: "5", isCorrect: false },
    ],
  },
];

const publishable = (): ActivityInput =>
  draft({ opensAt: FUTURE_OPEN, closesAt: FUTURE_CLOSE, questions: validQuestions() });

async function removeTestData() {
  const where = { instructor: { email: { startsWith: "phase3-" } } };
  await prisma.activity.deleteMany({ where: { classroom: where } });
  await prisma.classroom.deleteMany({ where });
  await prisma.instructor.deleteMany({ where: { email: { startsWith: "phase3-" } } });
}

before(async () => {
  await removeTestData();
  ownerId = (await prisma.instructor.create({
    data: { fullName: "Owner", email: `phase3-${run}-owner@example.test`, passwordHash: "not-used-in-tests" },
  })).id;
  otherId = (await prisma.instructor.create({
    data: { fullName: "Other", email: `phase3-${run}-other@example.test`, passwordHash: "not-used-in-tests" },
  })).id;
  classroomId = (await createClassroom(ownerId, { classroomName: "Owner room", description: null })).id;
  otherClassroomId = (await createClassroom(otherId, { classroomName: "Other room", description: null })).id;
});

after(async () => {
  await removeTestData();
  await prisma.$disconnect();
});

describe("creating and viewing activities", () => {
  it("saves a draft with ordered questions and choices", async () => {
    const created = await createActivity(ownerId, draft({ questions: validQuestions() }));
    assert.equal(created.isPublished, false);
    assert.equal(created.status, "DRAFT");
    assert.equal(created.questionCount, 2);
    assert.deepEqual(created.questions.map((q) => q.position), [1, 2]);
    assert.deepEqual(created.questions[0].choices.map((c) => c.position), [1, 2, 3]);
  });

  it("allows an incomplete draft (no questions, no schedule)", async () => {
    const created = await createActivity(ownerId, draft({ title: "Empty draft" }));
    assert.equal(created.questionCount, 0);
    assert.equal(created.opensAt, null);
  });

  it("returns correct-answer flags only through instructor-authorised reads", async () => {
    const created = await createActivity(ownerId, draft({ questions: validQuestions() }));
    const fetched = await getActivity(ownerId, created.id);
    const correct = fetched.questions[0].choices.filter((c) => c.isCorrect).map((c) => c.choiceText);
    assert.deepEqual(correct, ["Paris"]);
  });

  it("lists only the instructor's own activities, optionally filtered by classroom", async () => {
    const mine = await createActivity(ownerId, draft({ title: "Mine" }));
    const theirs = await createActivity(otherId, { ...draft({ title: "Theirs" }), classroomId: otherClassroomId });

    const ownerList = await listActivities(ownerId);
    assert.ok(ownerList.some((a) => a.id === mine.id));
    assert.ok(!ownerList.some((a) => a.id === theirs.id));

    const filtered = await listActivities(ownerId, classroomId);
    assert.ok(filtered.every((a) => a.classroomId === classroomId));
  });
});

describe("ownership and security", () => {
  it("refuses to read another instructor's activity", async () => {
    const mine = await createActivity(ownerId, draft({ title: "Private" }));
    await assert.rejects(getActivity(otherId, mine.id), isStatus(404, "NOT_FOUND"));
  });

  it("refuses to create an activity inside another instructor's classroom", async () => {
    await assert.rejects(
      createActivity(ownerId, { ...draft(), classroomId: otherClassroomId }),
      isStatus(404, "NOT_FOUND"),
    );
  });

  it("refuses to edit or delete another instructor's activity", async () => {
    const mine = await createActivity(ownerId, draft({ title: "Guarded" }));
    await assert.rejects(updateActivity(otherId, mine.id, draft({ title: "Hijack" })), isStatus(404, "NOT_FOUND"));
    await assert.rejects(deleteActivity(otherId, mine.id), isStatus(404, "NOT_FOUND"));
    await assert.rejects(publishActivity(otherId, mine.id, NOW), isStatus(404, "NOT_FOUND"));
  });

  it("refuses to move an activity into a classroom it does not own", async () => {
    const mine = await createActivity(ownerId, draft({ title: "Move attempt" }));
    await assert.rejects(
      updateActivity(ownerId, mine.id, { ...draft({ title: "Move attempt" }), classroomId: otherClassroomId }),
      isStatus(404, "NOT_FOUND"),
    );
  });
});

describe("schedules and attempts", () => {
  it("rejects a closing time that is not after the opening time (drafts too)", async () => {
    await assert.rejects(
      createActivity(ownerId, draft({ opensAt: FUTURE_CLOSE, closesAt: FUTURE_OPEN })),
      (e: unknown) => e instanceof AppError && e.status === 400 && "closesAt" in (e.fields ?? {}),
    );
  });

  it("rejects a duration longer than the open window", async () => {
    await assert.rejects(
      createActivity(ownerId, draft({ opensAt: FUTURE_OPEN, closesAt: FUTURE_CLOSE, durationMinutes: 120 })),
      (e: unknown) => e instanceof AppError && "durationMinutes" in (e.fields ?? {}),
    );
  });

  it("stores an optional duration and an attempt limit", async () => {
    const created = await createActivity(
      ownerId,
      draft({ opensAt: FUTURE_OPEN, closesAt: FUTURE_CLOSE, durationMinutes: 30, maxAttempts: 2 }),
    );
    assert.equal(created.durationMinutes, 30);
    assert.equal(created.maxAttempts, 2);
  });
});

describe("publishing", () => {
  it("blocks publishing an incomplete activity and names the problems", async () => {
    const incomplete = await createActivity(ownerId, draft({ title: "Not ready" }));
    await assert.rejects(publishActivity(ownerId, incomplete.id, NOW), (e: unknown) => {
      return e instanceof AppError && e.code === "PUBLISH_BLOCKED" && "questions" in (e.fields ?? {});
    });
  });

  it("blocks a question with no correct answer, and one with two", async () => {
    const none = validQuestions();
    none[0].choices.forEach((c) => (c.isCorrect = false));
    const created = await createActivity(ownerId, { ...publishable(), questions: none });
    await assert.rejects(publishActivity(ownerId, created.id, NOW), (e: unknown) =>
      e instanceof AppError && "questions.0.choices" in (e.fields ?? {}),
    );

    const two = validQuestions();
    two[0].choices.forEach((c) => (c.isCorrect = true));
    const created2 = await createActivity(ownerId, { ...publishable(), questions: two });
    await assert.rejects(publishActivity(ownerId, created2.id, NOW), (e: unknown) =>
      e instanceof AppError && "questions.0.choices" in (e.fields ?? {}),
    );
  });

  it("publishes a complete activity without opening a session", async () => {
    const created = await createActivity(ownerId, publishable());
    const published = await publishActivity(ownerId, created.id, NOW);
    assert.equal(published.isPublished, true);
    assert.equal(published.status, "DRAFT", "publishing must not change status (no session in Phase 3)");
    assert.equal(published.participantCount, 0);
  });

  it("refuses to publish once the closing time has passed on the server clock", async () => {
    const created = await createActivity(ownerId, publishable());
    await assert.rejects(
      publishActivity(ownerId, created.id, new Date("2031-01-01T00:00:00Z")),
      (e: unknown) => e instanceof AppError && "closesAt" in (e.fields ?? {}),
    );
  });

  it("returns a published activity to draft when it is edited, and can be unpublished", async () => {
    const created = await createActivity(ownerId, publishable());
    await publishActivity(ownerId, created.id, NOW);

    const { activity, returnedToDraft } = await updateActivity(ownerId, created.id, {
      ...publishable(),
      title: "Quiz 1 (revised)",
    });
    assert.equal(returnedToDraft, true);
    assert.equal(activity.isPublished, false);

    const again = await publishActivity(ownerId, created.id, NOW);
    assert.equal(again.isPublished, true);
    const unpublished = await unpublishActivity(ownerId, created.id);
    assert.equal(unpublished.isPublished, false);
  });

  it("blocks publishing into an archived classroom", async () => {
    const room = await createClassroom(ownerId, { classroomName: "Soon archived", description: null });
    const created = await createActivity(ownerId, { ...publishable(), classroomId: room.id });
    await archiveClassroom(ownerId, room.id);
    await assert.rejects(publishActivity(ownerId, created.id, NOW), (e: unknown) =>
      e instanceof AppError && "classroomId" in (e.fields ?? {}),
    );
  });
});

describe("editing questions and choices", () => {
  it("saves reordered questions and choices with positions matching the new order", async () => {
    const created = await createActivity(ownerId, draft({ questions: validQuestions() }));
    const reversed = [...validQuestions()].reverse();
    reversed[1].choices = [...reversed[1].choices].reverse();

    const { activity } = await updateActivity(ownerId, created.id, draft({ questions: reversed }));
    assert.deepEqual(activity.questions.map((q) => q.questionText), ["2 + 2?", "Capital of France?"]);
    assert.deepEqual(activity.questions.map((q) => q.position), [1, 2]);
    assert.deepEqual(activity.questions[1].choices.map((c) => c.choiceText), ["Rome", "Paris", "Berlin"]);
    assert.deepEqual(activity.questions[1].choices.map((c) => c.position), [1, 2, 3]);
  });

  it("removes questions and choices that were deleted in the builder", async () => {
    const created = await createActivity(ownerId, draft({ questions: validQuestions() }));
    const trimmed = [{ ...validQuestions()[0], choices: validQuestions()[0].choices.slice(0, 2) }];
    const { activity } = await updateActivity(ownerId, created.id, draft({ questions: trimmed }));
    assert.equal(activity.questionCount, 1);
    assert.equal(activity.questions[0].choices.length, 2);
  });

  it("deletes a draft activity with its questions", async () => {
    const created = await createActivity(ownerId, draft({ questions: validQuestions() }));
    await deleteActivity(ownerId, created.id);
    await assert.rejects(getActivity(ownerId, created.id), isStatus(404, "NOT_FOUND"));
    const leftover = await prisma.question.count({ where: { activityId: created.id } });
    assert.equal(leftover, 0);
  });
});

describe("dashboard statistics", () => {
  it("counts classrooms, drafts and published activities for this instructor", async () => {
    const stats = await getDashboardStats(ownerId);
    assert.equal(stats.drafts + stats.published, stats.activities);
    assert.ok(stats.classrooms >= 1);
    assert.ok(stats.recent.length <= 5);
  });
});
