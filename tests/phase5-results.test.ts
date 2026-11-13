// Phase 5: results accuracy, historical scores, ownership, archived history, and PDF
// contents read back from the database. Against MySQL. Rows use "phase5-" e-mails.
import "dotenv/config";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { AppError } from "../src/lib/errors";
import type { ActivityInput } from "../src/lib/builder-validation";
import { createClassroom } from "../src/services/classroom.service";
import { createActivity, publishActivity } from "../src/services/activity.service";
import { archiveActivity, openActivity } from "../src/services/session.service";
import { getStudentActivity, joinActivity, submitAnswers } from "../src/services/student.service";
import { authorizeRetake, getActivityResults } from "../src/services/results.service";
import { generateActivityReport } from "../src/services/report.service";
import { extractPdfText, isPdf } from "./helpers/pdf-text";

const run = randomBytes(4).toString("hex");
const PUBLISH_NOW = new Date("2030-01-01T00:00:00Z");
const OPEN_AT = new Date("2030-03-01T07:00:00Z");
const WINDOW = new Date("2030-03-01T08:00:00Z");
const LATER = new Date("2030-03-01T08:30:00Z");
const round2 = (n: number) => Math.round(n * 100) / 100;

let owner: number;
let other: number;
let room: number;

type Built = { id: number; code: string; capital: number; paris: number; sum: number; four: number };

async function activity(title: string, maxAttempts: 1 | 2 = 2): Promise<Built> {
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
  return {
    id: a.id,
    code: opened.sessionCode!,
    capital: qs[0].id,
    paris: qs[0].choices.find((c) => c.isCorrect)!.id,
    sum: qs[1].id,
    four: qs[1].choices.find((c) => c.isCorrect)!.id,
  };
}

async function join(a: Built, name: string) {
  return joinActivity({ sessionCode: a.code, fullName: name }, OPEN_AT);
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
  owner = (await prisma.instructor.create({ data: { fullName: "Ana Owner", email: `phase5-${run}-owner@example.test`, passwordHash: "x" } })).id;
  other = (await prisma.instructor.create({ data: { fullName: "Ben Other", email: `phase5-${run}-other@example.test`, passwordHash: "x" } })).id;
  room = (await createClassroom(owner, { classroomName: "Reporting room", description: "Section A" })).id;
});

after(async () => {
  await removeTestData();
  await prisma.$disconnect();
});

describe("results accuracy", () => {
  it("counts participants, submissions, and averages from the stored records", async () => {
    const a = await activity("Accuracy", 2);
    const single = await join(a, "Single Attempt");     // 2 of 3
    const retaker = await join(a, "Retake Student");    // 0 then 3
    await join(a, "Never Submitted");                   // nothing
    await getStudentActivity(a.id, single.token, WINDOW);
    await getStudentActivity(a.id, retaker.token, WINDOW);
    await submitAnswers(a.id, single.token, { answers: [{ questionId: a.capital, choiceId: a.paris }] }, WINDOW);
    await submitAnswers(a.id, retaker.token, { answers: [] }, WINDOW);
    await authorizeRetake(owner, a.id, retaker.participantId);
    await getStudentActivity(a.id, retaker.token, WINDOW);
    await submitAnswers(a.id, retaker.token, { answers: [{ questionId: a.capital, choiceId: a.paris }, { questionId: a.sum, choiceId: a.four }] }, WINDOW);

    const r = await getActivityResults(owner, a.id);
    assert.equal(r.summary.participantCount, 3);
    assert.equal(r.summary.submittedCount, 2, "the student who never submitted is not counted as submitted");
    const byName = (n: string) => r.participants.find((p) => p.displayName === n)!;
    assert.equal(byName("Never Submitted").submissionStatus, "not_submitted");
    assert.equal(byName("Never Submitted").currentResult, null);
    assert.equal(byName("Single Attempt").submissionStatus, "submitted");
    assert.equal(byName("Retake Student").submissionStatus, "retake_submitted");

    // First attempts: 2/3 = 66.67% and 0/3 = 0%  -> 33.335, presented as 33.34 (2 d.p.)
    assert.ok(Math.abs(r.summary.averagePercentage! - round2((66.67 + 0) / 2)) < 0.01);
    // Current results: 66.67% and 100% -> 83.335
    assert.ok(Math.abs(r.summary.averageCurrentPercentage! - round2((66.67 + 100) / 2)) < 0.01);
  });

  it("keeps first and second attempts separate and reports the latest accepted one as current", async () => {
    const a = await activity("Two attempts", 2);
    const s = await join(a, "Two Attempts Kid");
    const p = await prisma.participant.findFirstOrThrow({ where: { activityId: a.id } });
    await getStudentActivity(a.id, s.token, WINDOW);
    await submitAnswers(a.id, s.token, { answers: [] }, WINDOW);
    await authorizeRetake(owner, a.id, p.id);
    await getStudentActivity(a.id, s.token, WINDOW);
    await submitAnswers(a.id, s.token, { answers: [{ questionId: a.capital, choiceId: a.paris }, { questionId: a.sum, choiceId: a.four }] }, WINDOW);

    const row = (await getActivityResults(owner, a.id)).participants[0];
    assert.deepEqual(row.attempts.map((x) => [x.attemptNumber, x.score, x.maxScore, x.percentage]), [[1, 0, 3, 0], [2, 3, 3, 100]]);
    assert.equal(row.currentResult?.attemptNumber, 2);
    assert.equal(row.currentResult?.percentage, 100);
    assert.ok(row.attempts.every((x) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(x.submittedAt)), "each attempt has its own ISO timestamp");
  });

  it("a single attempt is its own current result", async () => {
    const a = await activity("One attempt only", 1);
    const s = await join(a, "Only Once");
    await getStudentActivity(a.id, s.token, WINDOW);
    await submitAnswers(a.id, s.token, { answers: [{ questionId: a.capital, choiceId: a.paris }] }, WINDOW);
    const row = (await getActivityResults(owner, a.id)).participants[0];
    assert.equal(row.currentResult?.attemptNumber, 1);
    assert.equal(row.attempts.length, 1);
  });
});

describe("historical scores are never recalculated", () => {
  it("a stored percentage keeps its original denominator after the question points change", async () => {
    const a = await activity("Frozen maximum", 1);
    const s = await join(a, "Frozen Kid");
    await getStudentActivity(a.id, s.token, WINDOW);
    await submitAnswers(a.id, s.token, { answers: [{ questionId: a.capital, choiceId: a.paris }] }, WINDOW);
    const before = (await getActivityResults(owner, a.id)).participants[0].attempts[0];
    assert.equal(before.maxScore, 3);
    assert.equal(before.percentage, 66.67);

    // Bypass the service guard on purpose: simulate a later change to the question's points.
    await prisma.question.update({ where: { id: a.capital }, data: { points: 10 } });
    const after = (await getActivityResults(owner, a.id)).participants[0].attempts[0];
    assert.equal(after.maxScore, 3, "the stored maximum is unchanged");
    assert.equal(after.percentage, 66.67, "the historical percentage is unchanged");
    assert.equal(after.score, 2, "the stored score is unchanged");
  });

  it("the database refuses a score above its stored maximum", async () => {
    const a = await activity("Score invariant", 1);
    await join(a, "Invariant Kid");
    const p = await prisma.participant.findFirstOrThrow({ where: { activityId: a.id } });
    await assert.rejects(
      prisma.submission.create({ data: { participantId: p.id, attemptNumber: 1, score: "4.00", maxScore: "3.00" } }),
      "a score of 4 cannot be stored against a maximum of 3",
    );
  });
});

describe("ownership", () => {
  it("another instructor cannot read the results, the participants, or the report", async () => {
    const a = await activity("Private", 1);
    await join(a, "Private Kid");
    await assert.rejects(getActivityResults(other, a.id), isStatus(404, "NOT_FOUND"));
    await assert.rejects(generateActivityReport(other, a.id), isStatus(404, "NOT_FOUND"));
  });

  it("a report for a non-existent activity is refused the same way", async () => {
    await assert.rejects(generateActivityReport(owner, 2147483000), isStatus(404, "NOT_FOUND"));
  });
});

describe("archived activities keep their history", () => {
  it("results and the PDF still work for an archived activity, with its submissions", async () => {
    const a = await activity("Archived history", 1);
    const s = await join(a, "History Kid");
    await getStudentActivity(a.id, s.token, WINDOW);
    await submitAnswers(a.id, s.token, { answers: [{ questionId: a.capital, choiceId: a.paris }] }, WINDOW);
    await archiveActivity(owner, a.id, LATER);

    const r = await getActivityResults(owner, a.id);
    assert.equal(r.activity.archived, true);
    assert.equal(r.participants[0].currentResult?.score, 2);

    const report = await generateActivityReport(owner, a.id, LATER);
    assert.ok(isPdf(report.bytes));
    assert.ok(extractPdfText(report.bytes).includes("History Kid"));
  });
});

describe("the PDF report built from the database", () => {
  it("contains the required fields and the real records, and no question text or answers", async () => {
    const a = await activity("Report contents", 2);
    const one = await join(a, "Report One");
    const two = await join(a, "Report Two");
    await join(a, "Report Three");
    await getStudentActivity(a.id, one.token, WINDOW);
    await getStudentActivity(a.id, two.token, WINDOW);
    await submitAnswers(a.id, one.token, { answers: [{ questionId: a.capital, choiceId: a.paris }] }, WINDOW);
    await submitAnswers(a.id, two.token, { answers: [] }, WINDOW);

    const report = await generateActivityReport(owner, a.id, LATER);
    const text = extractPdfText(report.bytes);
    for (const expected of [
      "Offline Classroom Polling System",
      "Ana Owner",
      "Reporting room",
      "Report contents",
      "Report One",
      "Report Two",
      "Report Three",
      "Not submitted",
      "Total participants",
      "Total submissions",
      "66.67%",
      "2 / 3",
      "1 (current)",
    ]) {
      assert.ok(text.includes(expected), `missing "${expected}"`);
    }
    assert.equal(report.participantCount, 3);
    assert.equal(report.submissionCount, 2);
    assert.ok(!text.includes("Capital of France"), "question text is not in the report");
    assert.ok(!text.includes("Paris"), "answer choices are not in the report");
    assert.ok(!text.includes("Berlin"), "wrong choices are not in the report");
    assert.equal(report.filename, `results-report-contents-${a.id}.pdf`);
  });

  it("the PDF and the dashboard report the same numbers", async () => {
    const a = await activity("Same numbers", 1);
    const s = await join(a, "Same Kid");
    await getStudentActivity(a.id, s.token, WINDOW);
    await submitAnswers(a.id, s.token, { answers: [{ questionId: a.capital, choiceId: a.paris }] }, WINDOW);
    const dashboard = await getActivityResults(owner, a.id);
    const pdf = extractPdfText((await generateActivityReport(owner, a.id, LATER)).bytes);
    assert.ok(pdf.includes(String(dashboard.summary.participantCount)));
    assert.ok(pdf.includes(`${dashboard.participants[0].currentResult!.percentage}%`));
  });
});
