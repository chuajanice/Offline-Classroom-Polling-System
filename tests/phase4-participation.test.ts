// Phase 4 Stage C: student join and the student view, against MySQL.
// Test rows use "phase4-" e-mails and are removed afterwards.
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
import { openActivity, closeActivity } from "../src/services/session.service";
import { authenticateParticipant, getStudentActivity, joinActivity, startAttempt } from "../src/services/student.service";

const run = randomBytes(4).toString("hex");
/** Unique per file: parallel test files never delete each other's rows. */
const PREFIX = "ph6-p4part-";
const PUBLISH_NOW = new Date("2030-01-01T00:00:00Z");
const BEFORE = new Date("2030-03-01T07:00:00Z");
const AFTER_CLOSE = new Date("2030-03-01T10:00:00Z");
let owner: number;
let room: number;

const input = (title: string): ActivityInput => ({
  classroomId: room,
  title,
  instructions: "Answer carefully.",
  opensAt: "2030-03-01T08:00:00.000Z",
  closesAt: "2030-03-01T09:00:00.000Z",
  durationMinutes: null,
  maxAttempts: 1,
  questions: [
    { questionText: "Capital of France?", points: 2, choices: [{ choiceText: "Berlin", isCorrect: false }, { choiceText: "Paris", isCorrect: true }] },
    { questionText: "2 + 2?", points: 1, choices: [{ choiceText: "4", isCorrect: true }, { choiceText: "5", isCorrect: false }] },
  ],
});

/** Creates, publishes and opens an activity. Returns its id and session code. */
async function openedActivity(title: string) {
  const a = await createActivity(owner, input(title));
  await publishActivity(owner, a.id, PUBLISH_NOW);
  const opened = await openActivity(owner, a.id, BEFORE);
  return { id: a.id, code: opened.sessionCode! };
}

const isStatus = (status: number, code: string) => (e: unknown) =>
  e instanceof AppError && e.status === status && e.code === code;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

async function removeTestData() {
  await removeFixtures(PREFIX);
}

before(async () => {
  await removeTestData();
  owner = (await prisma.instructor.create({ data: { fullName: "Owner", email: `${PREFIX}${run}@example.test`, passwordHash: "x" } })).id;
  room = (await createClassroom(owner, { classroomName: "Participation room", description: null })).id;
});

after(async () => {
  await removeTestData();
  await prisma.$disconnect();
});

describe("joining an activity", () => {
  it("issues a token, stores only its hash, and binds the participant to the activity", async () => {
    const { id, code } = await openedActivity("Join basics");
    const joined = await joinActivity({ sessionCode: code, fullName: "Ana Santos", studentId: "S-001" }, BEFORE);
    assert.equal(joined.activityId, id);
    assert.ok(joined.token.length >= 40, "token is long and random");
    const row = await prisma.participant.findUniqueOrThrow({ where: { id: joined.participantId } });
    assert.equal(row.sessionTokenHash, sha256(joined.token), "hash of the token is stored");
    assert.notEqual(row.sessionTokenHash, joined.token, "the raw token is never stored");
    assert.equal(row.displayName, "Ana Santos");
  });

  it("accepts the code typed in lower case, with spaces or hyphens", async () => {
    const { code } = await openedActivity("Forgiving code");
    const typed = code.toLowerCase().split("").join(" ");
    const joined = await joinActivity({ sessionCode: typed, fullName: "Ben Cruz", studentId: "S-002" }, BEFORE);
    assert.ok(joined.participantId > 0);
  });

  it("gives the same not-found message for unknown and malformed codes", async () => {
    await assert.rejects(joinActivity({ sessionCode: "ZZZZZZZZ", fullName: "Nobody", studentId: "S-003" }, BEFORE), isStatus(404, "INVALID_CODE"));
    await assert.rejects(joinActivity({ sessionCode: "OO00", fullName: "Nobody", studentId: "S-004" }, BEFORE), isStatus(404, "INVALID_CODE"));
  });

  it("refuses a closed activity", async () => {
    const { id, code } = await openedActivity("Closed to joins");
    await closeActivity(owner, id, BEFORE);
    await assert.rejects(joinActivity({ sessionCode: code, fullName: "Late Comer", studentId: "S-005" }, BEFORE), isStatus(409, "ACTIVITY_CLOSED"));
  });

  it("refuses a join after the scheduled deadline, even before anyone closed it", async () => {
    const { code } = await openedActivity("Deadline join");
    await assert.rejects(joinActivity({ sessionCode: code, fullName: "Too Late", studentId: "S-006" }, AFTER_CLOSE), isStatus(409, "ACTIVITY_CLOSED"));
  });

  it("refuses a duplicate name in the same activity, ignoring case and spacing", async () => {
    const { code } = await openedActivity("Duplicate names");
    await joinActivity({ sessionCode: code, fullName: "Carla Reyes", studentId: "S-007" }, BEFORE);
    await assert.rejects(joinActivity({ sessionCode: code, fullName: "  carla   REYES ", studentId: "S-008" }, BEFORE), isStatus(409, "NAME_TAKEN"));
  });

  it("refuses the same student ID even when the name is spelled differently", async () => {
    const { code } = await openedActivity("Student ID duplicate");
    await joinActivity({ sessionCode: code, fullName: "Ana Cruz", studentId: "2024-00123" }, BEFORE);
    await assert.rejects(
      joinActivity({ sessionCode: code, fullName: "Anna Cruz", studentId: " 2024-00123 " }, BEFORE),
      isStatus(409, "STUDENT_ID_TAKEN"),
    );
  });

  it("treats student IDs case-insensitively and keeps leading zeroes on record", async () => {
    const { code, id: activityId } = await openedActivity("Student ID case");
    await joinActivity({ sessionCode: code, fullName: "Ben Reyes", studentId: "007-lee" }, BEFORE);
    await assert.rejects(
      joinActivity({ sessionCode: code, fullName: "Ben Reyes Jr", studentId: "007-LEE" }, BEFORE),
      isStatus(409, "STUDENT_ID_TAKEN"),
    );
    const row = await prisma.participant.findFirstOrThrow({ where: { activityId, normalizedStudentId: "007-LEE" } });
    assert.equal(row.studentId, "007-lee");
  });

  it("allows the same student ID in a different activity", async () => {
    const first = await openedActivity("Same ID A");
    const second = await openedActivity("Same ID B");
    await joinActivity({ sessionCode: first.code, fullName: "Cy Dela", studentId: "555123" }, BEFORE);
    const joined = await joinActivity({ sessionCode: second.code, fullName: "Cy Dela", studentId: "555123" }, BEFORE);
    assert.ok(joined.participantId > 0);
  });

  it("requires a student ID with a field-level message", async () => {
    const { code } = await openedActivity("Missing ID");
    await assert.rejects(joinActivity({ sessionCode: code, fullName: "Nora Lee", studentId: "" }, BEFORE), (e: unknown) =>
      e instanceof AppError && e.status === 400 && "studentId" in (e.fields ?? {}),
    );
  });

  it("allows the same name in a different activity", async () => {
    const first = await openedActivity("Same name A");
    const second = await openedActivity("Same name B");
    await joinActivity({ sessionCode: first.code, fullName: "Dan Lim", studentId: "S-009" }, BEFORE);
    const joined = await joinActivity({ sessionCode: second.code, fullName: "Dan Lim", studentId: "S-010" }, BEFORE);
    assert.ok(joined.participantId > 0);
  });

  it("rejects an invalid name with a field-level message", async () => {
    const { code } = await openedActivity("Bad name");
    await assert.rejects(joinActivity({ sessionCode: code, fullName: "R2D2", studentId: "S-011" }, BEFORE), (e: unknown) =>
      e instanceof AppError && e.status === 400 && "fullName" in (e.fields ?? {}),
    );
  });

  it("serialises simultaneous joins with the same name: exactly one succeeds", async () => {
    const { code } = await openedActivity("Race to join");
    const attempts = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => joinActivity({ sessionCode: code, fullName: "Same Person", studentId: `RACE-${i}` }, BEFORE)),
    );
    const won = attempts.filter((a) => a.status === "fulfilled").length;
    const lost = attempts.filter((a) => a.status === "rejected" && (a.reason as AppError).code === "NAME_TAKEN").length;
    assert.equal(won, 1);
    assert.equal(lost, 9);
  });
});

describe("the student view and token binding", () => {
  it("shows questions and choices to the joined participant, with no correct-answer information", async () => {
    const { id, code } = await openedActivity("Student view");
    const { token } = await joinActivity({ sessionCode: code, fullName: "Eve Tan", studentId: "S-013" }, BEFORE);
    await startAttempt(id, token, BEFORE); // Stage 9: questions appear once the student has started
    const view = await getStudentActivity(id, token, BEFORE);
    assert.equal(view.activity.status, "OPEN");
    assert.equal(view.questions.length, 2);
    assert.equal(view.participant.displayName, "Eve Tan");
    const json = JSON.stringify(view);
    assert.ok(!json.includes("isCorrect"), "no correctness flag in the student JSON");
    assert.ok(!json.includes('"correct"'), "no correctness label either");
  });

  it("refuses the view with no token, a made-up token, or another activity's token (same 401)", async () => {
    const a = await openedActivity("Binding A");
    const b = await openedActivity("Binding B");
    const { token: tokenForA } = await joinActivity({ sessionCode: a.code, fullName: "Frank Uy", studentId: "S-014" }, BEFORE);
    await assert.rejects(getStudentActivity(a.id, undefined, BEFORE), isStatus(401, "UNAUTHENTICATED"));
    await assert.rejects(getStudentActivity(a.id, "not-a-real-token", BEFORE), isStatus(401, "UNAUTHENTICATED"));
    await assert.rejects(getStudentActivity(b.id, tokenForA, BEFORE), isStatus(401, "UNAUTHENTICATED"));
  });

  it("never shows another student's name", async () => {
    const { id, code } = await openedActivity("Privacy");
    const me = await joinActivity({ sessionCode: code, fullName: "Gina Lopez", studentId: "S-015" }, BEFORE);
    await joinActivity({ sessionCode: code, fullName: "Hugo Park", studentId: "S-016" }, BEFORE);
    const view = JSON.stringify(await getStudentActivity(id, me.token, BEFORE));
    assert.ok(view.includes("Gina Lopez"));
    assert.ok(!view.includes("Hugo Park"));
  });

  it("a closed activity shows status and no questions", async () => {
    const { id, code } = await openedActivity("Closed view");
    const { token } = await joinActivity({ sessionCode: code, fullName: "Ivy Ong", studentId: "S-017" }, BEFORE);
    await closeActivity(owner, id, BEFORE);
    const view = await getStudentActivity(id, token, BEFORE);
    assert.equal(view.activity.status, "CLOSED");
    assert.equal(view.questions.length, 0);
  });

  it("authenticateParticipant resolves only the matching activity", async () => {
    const { id, code } = await openedActivity("Auth helper");
    const { token } = await joinActivity({ sessionCode: code, fullName: "Jay Ferrer", studentId: "S-018" }, BEFORE);
    const p = await authenticateParticipant(id, token);
    assert.equal(p.displayName, "Jay Ferrer");
  });

  it("the instructor's own view still shows correct answers", async () => {
    const { id } = await openedActivity("Instructor sees answers");
    const { getActivity } = await import("../src/services/activity.service");
    const detail = await getActivity(owner, id);
    assert.ok(detail.questions[0].choices.some((c) => c.isCorrect), "owner sees correctness");
  });
});
