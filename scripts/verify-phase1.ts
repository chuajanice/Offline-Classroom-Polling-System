// Phase 1 verification against the REAL MySQL database.
//
//   npm run db:verify
//
// What it proves
//   1. Structure   - the nine primary tables, 11 foreign keys (with the intended
//                    RESTRICT/CASCADE rules), 9 unique indexes and 7 CHECK
//                    constraints exist exactly as designed.
//   2. CRUD        - rows can be created, read, updated and (draft content)
//                    deleted through Prisma, including nested writes.
//   3. Constraints - MySQL itself rejects every invalid write (duplicates,
//                    bad values, orphans, deleting rows that have history).
//   4. Transactions- a failed multi-step write leaves nothing behind.
//   5. History     - a retake adds attempt 2 without touching attempt 1.
//
// All test rows use e-mails starting with "phase1-verify-" and are deleted at
// the end (and at the start, in case an earlier run crashed). Nothing else in
// the database is touched. Exits with code 1 if any check fails.

import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../src/lib/prisma";

const EMAIL_PREFIX = "phase1-verify-";

// ----------------------------------------------------------------------------
// Tiny test harness
// ----------------------------------------------------------------------------
let passed = 0;
let failed = 0;

function report(ok: boolean, name: string, detail?: string) {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  -  ${detail}` : ""}`);
}

function heading(title: string) {
  console.log(`\n== ${title} ==`);
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    const e = error as Error & { code?: unknown; meta?: unknown; cause?: unknown };
    const cause = e.cause instanceof Error ? e.cause.message : "";
    return `${String(e.code ?? "")} ${e.message} ${JSON.stringify(e.meta ?? {})} ${cause}`;
  }
  return String(error);
}

function shortReason(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return code ? String(code) : "rejected";
}

/** The step must succeed; any exception is a FAIL. */
async function check(name: string, fn: () => Promise<string | void>) {
  try {
    const detail = await fn();
    report(true, name, detail || undefined);
  } catch (error) {
    report(false, name, errorText(error).trim().slice(0, 300));
  }
}

/** The step must be REJECTED by the database for the stated reason. */
async function expectRejected(name: string, reason: RegExp, fn: () => Promise<unknown>) {
  try {
    await fn();
    report(false, name, "was ACCEPTED, but the database should have rejected it");
  } catch (error) {
    const text = errorText(error);
    if (reason.test(text)) report(true, name, shortReason(error));
    else report(false, name, `rejected for an unexpected reason: ${text.trim().slice(0, 240)}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const UNIQUE = /P2002|unique|duplicate/i;
const FOREIGN_KEY = /P2003|foreign key/i;
const CHECK = /3819|check constraint|chk_/i;

const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");

// ----------------------------------------------------------------------------
// Cleanup (deletes children before parents; scoped to the test e-mail prefix)
// ----------------------------------------------------------------------------
async function cleanup(): Promise<number> {
  const instructors = await prisma.instructor.findMany({
    where: { email: { startsWith: EMAIL_PREFIX } },
    select: { id: true },
  });
  const instructorIds = instructors.map((i) => i.id);
  if (instructorIds.length === 0) return 0;

  const inScope = { classroom: { instructorId: { in: instructorIds } } };

  const participantIds = (
    await prisma.participant.findMany({ where: { activity: inScope }, select: { id: true } })
  ).map((p) => p.id);
  const submissionIds = (
    await prisma.submission.findMany({
      where: { participantId: { in: participantIds } },
      select: { id: true },
    })
  ).map((s) => s.id);

  await prisma.submissionAnswer.deleteMany({ where: { submissionId: { in: submissionIds } } });
  await prisma.submission.deleteMany({ where: { id: { in: submissionIds } } });
  await prisma.retakeAuthorization.deleteMany({
    where: { OR: [{ participantId: { in: participantIds } }, { authorizedBy: { in: instructorIds } }] },
  });
  await prisma.participant.deleteMany({ where: { id: { in: participantIds } } });
  await prisma.choice.deleteMany({ where: { question: { activity: inScope } } });
  await prisma.question.deleteMany({ where: { activity: inScope } });
  await prisma.activity.deleteMany({ where: inScope });
  await prisma.classroom.deleteMany({ where: { instructorId: { in: instructorIds } } });
  await prisma.instructor.deleteMany({ where: { id: { in: instructorIds } } });
  return instructorIds.length;
}

// ----------------------------------------------------------------------------
// 1. Structure
// ----------------------------------------------------------------------------
const EXPECTED_TABLES = [
  "activities",
  "choices",
  "classrooms",
  "instructors",
  "participants",
  "questions",
  "retake_authorizations",
  "submission_answers",
  "submissions",
];

// "child -> parent" : delete rule
const EXPECTED_FOREIGN_KEYS: Record<string, string> = {
  "classrooms->instructors": "RESTRICT",
  "activities->classrooms": "RESTRICT",
  "questions->activities": "CASCADE",
  "choices->questions": "CASCADE",
  "participants->activities": "RESTRICT",
  "submissions->participants": "RESTRICT",
  "submission_answers->submissions": "RESTRICT",
  "submission_answers->questions": "RESTRICT",
  "submission_answers->choices": "RESTRICT",
  "retake_authorizations->participants": "RESTRICT",
  "retake_authorizations->instructors": "RESTRICT",
};

const EXPECTED_UNIQUE_INDEXES = [
  "activities(session_code)",
  "choices(question_id,position)",
  "instructors(email)",
  "participants(activity_id,normalized_name)",
  "participants(session_token_hash)",
  "questions(activity_id,position)",
  "retake_authorizations(participant_id)",
  "submission_answers(submission_id,question_id)",
  "submissions(participant_id,attempt_number)",
];

// Supporting objects added by LATER phases. They are not part of the nine primary
// tables of the specification, so they are tolerated here (and verified when
// present), while any other unexpected table / key / index still fails.
// Phase 2: instructor_sessions (server-side login sessions).
// Phase 4: attempt_starts (time limit per attempt; one row per participant+attempt).
const SUPPORTING_TABLES = ["instructor_sessions", "attempt_starts"];
const SUPPORTING_FOREIGN_KEYS: Record<string, string> = {
  "instructor_sessions->instructors": "CASCADE",
  "attempt_starts->participants": "RESTRICT",
};
const SUPPORTING_UNIQUE_INDEXES = [
  "instructor_sessions(token_hash)",
  "attempt_starts(participant_id,attempt_number)",
];

const EXPECTED_CHECKS = [
  "chk_activities_lifecycle",
  "chk_choices_position_positive",
  "chk_questions_points_positive",
  "chk_questions_position_positive",
  "chk_submission_answers_points_nonneg",
  "chk_submissions_attempt_number",
  "chk_submissions_score_nonneg",
];

async function verifyStructure() {
  heading("1. Structure (information_schema)");

  await check("connects to MySQL", async () => {
    const rows = await prisma.$queryRaw<{ v: string }[]>`SELECT VERSION() AS v`;
    return `MySQL ${rows[0]?.v ?? "unknown"}`;
  });

  await check("the nine primary tables exist (and nothing unknown besides supporting tables)", async () => {
    const rows = await prisma.$queryRaw<{ name: string }[]>`
      SELECT TABLE_NAME AS name FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME <> '_prisma_migrations'
      ORDER BY TABLE_NAME`;
    const actual = rows
      .map((r) => String(r.name))
      .filter((name) => !SUPPORTING_TABLES.includes(name))
      .sort();
    assert(
      JSON.stringify(actual) === JSON.stringify(EXPECTED_TABLES),
      `found [${actual.join(", ")}]`,
    );
  });

  await check("tables use the InnoDB engine", async () => {
    const rows = await prisma.$queryRaw<{ name: string; engine: string }[]>`
      SELECT TABLE_NAME AS name, ENGINE AS engine FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME <> '_prisma_migrations'`;
    const bad = rows.filter((r) => String(r.engine) !== "InnoDB").map((r) => String(r.name));
    assert(bad.length === 0, `not InnoDB: ${bad.join(", ")}`);
  });

  await check("the 11 foreign keys have the intended ON DELETE rules", async () => {
    const rows = await prisma.$queryRaw<{ child: string; parent: string; del_rule: string }[]>`
      SELECT TABLE_NAME AS child, REFERENCED_TABLE_NAME AS parent, DELETE_RULE AS del_rule
      FROM information_schema.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE()`;
    const actual: Record<string, string> = {};
    for (const r of rows) actual[`${String(r.child)}->${String(r.parent)}`] = String(r.del_rule);
    const problems: string[] = [];
    for (const [key, rule] of Object.entries(EXPECTED_FOREIGN_KEYS)) {
      if (actual[key] !== rule) problems.push(`${key}: expected ${rule}, got ${actual[key] ?? "missing"}`);
    }
    for (const [key, rule] of Object.entries(SUPPORTING_FOREIGN_KEYS)) {
      if (key in actual && actual[key] !== rule) problems.push(`${key}: expected ${rule}, got ${actual[key]}`);
    }
    for (const key of Object.keys(actual)) {
      if (!(key in EXPECTED_FOREIGN_KEYS) && !(key in SUPPORTING_FOREIGN_KEYS)) {
        problems.push(`unexpected foreign key ${key}`);
      }
    }
    assert(problems.length === 0, problems.join("; "));
  });

  await check("9 unique indexes (besides primary keys) on the intended columns", async () => {
    const rows = await prisma.$queryRaw<{ t: string; cols: unknown }[]>`
      SELECT TABLE_NAME AS t,
             CAST(GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') AS CHAR) AS cols
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND NON_UNIQUE = 0 AND INDEX_NAME <> 'PRIMARY'
      GROUP BY TABLE_NAME, INDEX_NAME`;
    const actual = rows
      .map((r) => `${String(r.t)}(${String(r.cols)})`)
      .filter((index) => !SUPPORTING_UNIQUE_INDEXES.includes(index))
      .sort();
    assert(
      JSON.stringify(actual) === JSON.stringify(EXPECTED_UNIQUE_INDEXES),
      `found [${actual.join(" | ")}]`,
    );
  });

  await check("7 CHECK constraints are present", async () => {
    const rows = await prisma.$queryRaw<{ name: string }[]>`
      SELECT CONSTRAINT_NAME AS name FROM information_schema.CHECK_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE() ORDER BY CONSTRAINT_NAME`;
    const actual = rows.map((r) => String(r.name)).sort();
    const missing = EXPECTED_CHECKS.filter((n) => !actual.includes(n));
    assert(missing.length === 0, `missing: ${missing.join(", ")}`);
  });
}

// ----------------------------------------------------------------------------
// 2-5. Data behaviour
// ----------------------------------------------------------------------------
async function verifyBehaviour(run: string) {
  const emailA = `${EMAIL_PREFIX}${run}-a@example.test`;
  const codeA = `V${run}`.toUpperCase(); // 9 chars, fits VARCHAR(12)
  const codeB = `W${run}`.toUpperCase();

  // Shared fixtures, filled in by the CRUD section and reused afterwards.
  let instructorId = 0;
  let classroomId = 0;
  let activityId = 0;
  let activityBId = 0;
  let q1Id = 0;
  let q2Id = 0;
  let q1Choices: { id: number; isCorrect: boolean }[] = [];
  let q2Choices: { id: number; isCorrect: boolean }[] = [];
  let participantId = 0;
  let participant2Id = 0;
  let submission1Id = 0;
  const tokenHash = sha256(randomBytes(32));

  heading("2. CRUD");

  await check("create + read instructor", async () => {
    const created = await prisma.instructor.create({
      data: { fullName: "Phase1 Verify", email: emailA, passwordHash: "x".repeat(60) },
    });
    instructorId = created.id;
    const found = await prisma.instructor.findUnique({ where: { email: emailA } });
    assert(found?.id === created.id, "instructor not found by e-mail");
    assert(found.createdAt instanceof Date, "created_at default was not applied");
  });

  await check("create classroom, update description, archive and restore", async () => {
    const created = await prisma.classroom.create({
      data: { instructorId, classroomName: "Verify Class", description: "first" },
    });
    classroomId = created.id;
    assert(created.archivedAt === null, "new classroom should not be archived");
    const updated = await prisma.classroom.update({
      where: { id: classroomId },
      data: { description: "second", archivedAt: new Date() },
    });
    assert(updated.description === "second" && updated.archivedAt !== null, "update/archive failed");
    const restored = await prisma.classroom.update({
      where: { id: classroomId },
      data: { archivedAt: null },
    });
    assert(restored.archivedAt === null, "restore failed");
  });

  await check("create DRAFT activity (defaults: status DRAFT, no session code)", async () => {
    const created = await prisma.activity.create({
      data: { classroomId, title: "Verify Activity", instructions: "Pick one answer." },
    });
    activityId = created.id;
    assert(created.status === "DRAFT", `status was ${created.status}`);
    assert(created.sessionCode === null && created.openedAt === null, "draft must have no code");
  });

  await check("create questions with nested choices (2 pts and 1 pt)", async () => {
    const q1 = await prisma.question.create({
      data: {
        activityId,
        questionText: "2 + 2 = ?",
        points: 2,
        position: 1,
        choices: {
          create: [
            { choiceText: "3", position: 1 },
            { choiceText: "4", position: 2, isCorrect: true },
            { choiceText: "5", position: 3 },
          ],
        },
      },
      include: { choices: { orderBy: { position: "asc" } } },
    });
    const q2 = await prisma.question.create({
      data: {
        activityId,
        questionText: "The sky is blue.",
        position: 2, // points defaults to 1
        choices: {
          create: [
            { choiceText: "True", position: 1, isCorrect: true },
            { choiceText: "False", position: 2 },
          ],
        },
      },
      include: { choices: { orderBy: { position: "asc" } } },
    });
    q1Id = q1.id;
    q2Id = q2.id;
    q1Choices = q1.choices.map((c) => ({ id: c.id, isCorrect: c.isCorrect }));
    q2Choices = q2.choices.map((c) => ({ id: c.id, isCorrect: c.isCorrect }));
    assert(q2.points === 1, "points default should be 1");
    assert(q1Choices.length === 3 && q2Choices.length === 2, "unexpected choice counts");
    assert(q1Choices.filter((c) => c.isCorrect).length === 1, "q1 should have one correct choice");
  });

  await check("open the activity (status OPEN + session code + opened_at)", async () => {
    const opened = await prisma.activity.update({
      where: { id: activityId },
      data: { status: "OPEN", sessionCode: codeA, openedAt: new Date() },
    });
    assert(opened.status === "OPEN" && opened.sessionCode === codeA, "open failed");
    const byCode = await prisma.activity.findUnique({ where: { sessionCode: codeA } });
    assert(byCode?.id === activityId, "activity not found by session code");
  });

  await check("join: create participants (display name kept, normalized copy stored)", async () => {
    const p1 = await prisma.participant.create({
      data: {
        activityId,
        displayName: "  Ana  Maria Cruz ",
        normalizedName: "ana maria cruz",
        sessionTokenHash: tokenHash,
      },
    });
    const p2 = await prisma.participant.create({
      data: {
        activityId,
        displayName: "Ben Reyes",
        normalizedName: "ben reyes",
        sessionTokenHash: sha256(randomBytes(32)),
      },
    });
    participantId = p1.id;
    participant2Id = p2.id;
  });

  await check("first submission (attempt 1) with answers: score 2.00 of 3", async () => {
    const q1Correct = q1Choices.find((c) => c.isCorrect);
    const q2Wrong = q2Choices.find((c) => !c.isCorrect);
    assert(q1Correct && q2Wrong, "fixture choices missing");
    const created = await prisma.submission.create({
      data: {
        participantId,
        attemptNumber: 1,
        score: "2.00",
        maxScore: "10.00",
        answers: {
          create: [
            { questionId: q1Id, selectedChoiceId: q1Correct.id, isCorrect: true, awardedPoints: "2.00" },
            { questionId: q2Id, selectedChoiceId: q2Wrong.id, isCorrect: false, awardedPoints: "0.00" },
          ],
        },
      },
      include: { answers: true },
    });
    submission1Id = created.id;
    assert(Number(created.score) === 2, `score was ${String(created.score)}`);
    const total = created.answers.reduce((sum, a) => sum + Number(a.awardedPoints), 0);
    assert(total === Number(created.score), "answer points do not add up to the score");
    return `percentage = ${((2 / 3) * 100).toFixed(2)}%`;
  });

  await check("retake: authorization + attempt 2 + used_at in ONE transaction; attempt 1 untouched", async () => {
    await prisma.retakeAuthorization.create({
      data: { participantId, authorizedBy: instructorId },
    });
    const q1Correct = q1Choices.find((c) => c.isCorrect);
    const q2Correct = q2Choices.find((c) => c.isCorrect);
    assert(q1Correct && q2Correct, "fixture choices missing");
    await prisma.$transaction(async (tx) => {
      await tx.submission.create({
        data: {
          participantId,
          attemptNumber: 2,
          score: "3.00",
          maxScore: "10.00",
          answers: {
            create: [
              { questionId: q1Id, selectedChoiceId: q1Correct.id, isCorrect: true, awardedPoints: "2.00" },
              { questionId: q2Id, selectedChoiceId: q2Correct.id, isCorrect: true, awardedPoints: "1.00" },
            ],
          },
        },
      });
      await tx.retakeAuthorization.update({
        where: { participantId },
        data: { usedAt: new Date() },
      });
    });
    const attempts = await prisma.submission.findMany({
      where: { participantId },
      orderBy: { attemptNumber: "asc" },
    });
    assert(attempts.length === 2, `expected 2 attempts, found ${attempts.length}`);
    assert(attempts[0].id === submission1Id && Number(attempts[0].score) === 2, "attempt 1 was changed");
    assert(Number(attempts[1].score) === 3, "attempt 2 score wrong");
    const auth = await prisma.retakeAuthorization.findUnique({ where: { participantId } });
    assert(auth?.usedAt instanceof Date, "used_at was not set");
  });

  await check("nested read: activity -> questions -> choices in saved order", async () => {
    const full = await prisma.activity.findUniqueOrThrow({
      where: { id: activityId },
      include: {
        classroom: true,
        questions: {
          orderBy: { position: "asc" },
          include: { choices: { orderBy: { position: "asc" } } },
        },
      },
    });
    assert(full.questions.length === 2, "expected 2 questions");
    assert(full.questions[0].choices.map((c) => c.choiceText).join(",") === "3,4,5", "choice order wrong");
    assert(full.classroom.id === classroomId, "classroom relation wrong");
  });

  await check("same name is allowed in a DIFFERENT activity", async () => {
    const other = await prisma.activity.create({
      data: {
        classroomId,
        title: "Verify Activity B",
        status: "OPEN",
        sessionCode: codeB,
        openedAt: new Date(),
      },
    });
    activityBId = other.id;
    await prisma.participant.create({
      data: {
        activityId: activityBId,
        displayName: "Ana Maria Cruz",
        normalizedName: "ana maria cruz",
        sessionTokenHash: sha256(randomBytes(32)),
      },
    });
  });

  await check("delete a DRAFT question: its choices are removed (CASCADE)", async () => {
    const draft = await prisma.activity.create({ data: { classroomId, title: "Verify Draft C" } });
    const q = await prisma.question.create({
      data: {
        activityId: draft.id,
        questionText: "temporary",
        position: 1,
        choices: { create: [{ choiceText: "a", position: 1, isCorrect: true }, { choiceText: "b", position: 2 }] },
      },
    });
    await prisma.question.delete({ where: { id: q.id } });
    const left = await prisma.choice.count({ where: { questionId: q.id } });
    assert(left === 0, `${left} orphaned choices remain`);
  });

  heading("3. Constraints: the database must REJECT these");

  // Uniqueness
  await expectRejected("duplicate instructor e-mail (same text)", UNIQUE, () =>
    prisma.instructor.create({ data: { fullName: "Dup", email: emailA, passwordHash: "x" } }),
  );
  await expectRejected("duplicate instructor e-mail (different letter case)", UNIQUE, () =>
    prisma.instructor.create({ data: { fullName: "Dup", email: emailA.toUpperCase(), passwordHash: "x" } }),
  );
  await expectRejected("duplicate session code on another activity", UNIQUE, () =>
    prisma.activity.create({
      data: { classroomId, title: "Dup code", status: "OPEN", sessionCode: codeA, openedAt: new Date() },
    }),
  );
  await expectRejected("duplicate participant name in the same activity", UNIQUE, () =>
    prisma.participant.create({
      data: {
        activityId,
        displayName: "ANA MARIA CRUZ",
        normalizedName: "ana maria cruz",
        sessionTokenHash: sha256(randomBytes(32)),
      },
    }),
  );
  await expectRejected("duplicate participant session token", UNIQUE, () =>
    prisma.participant.create({
      data: {
        activityId: activityBId,
        displayName: "Token Thief",
        normalizedName: "token thief",
        sessionTokenHash: tokenHash,
      },
    }),
  );
  await expectRejected("second attempt_number 1 for the same participant", UNIQUE, () =>
    prisma.submission.create({ data: { participantId, attemptNumber: 1, score: "0.00", maxScore: "10.00" } }),
  );
  await expectRejected("two answers to one question in one submission", UNIQUE, () =>
    prisma.submissionAnswer.create({
      data: {
        submissionId: submission1Id,
        questionId: q1Id,
        selectedChoiceId: q1Choices[0].id,
        isCorrect: false,
        awardedPoints: "0.00",
      },
    }),
  );
  await expectRejected("second retake authorization for one participant", UNIQUE, () =>
    prisma.retakeAuthorization.create({ data: { participantId, authorizedBy: instructorId } }),
  );
  await expectRejected("two questions at the same position in an activity", UNIQUE, () =>
    prisma.question.create({ data: { activityId, questionText: "dup pos", position: 1 } }),
  );
  await expectRejected("two choices at the same position in a question", UNIQUE, () =>
    prisma.choice.create({ data: { questionId: q1Id, choiceText: "dup pos", position: 1 } }),
  );

  // CHECK constraints
  await expectRejected("attempt_number 3 (only 1 and 2 are allowed)", CHECK, () =>
    prisma.submission.create({ data: { participantId: participant2Id, attemptNumber: 3, score: "0.00", maxScore: "10.00" } }),
  );
  await expectRejected("negative submission score", CHECK, () =>
    prisma.submission.create({ data: { participantId: participant2Id, attemptNumber: 1, score: "-1.00", maxScore: "10.00" } }),
  );
  await expectRejected("question with 0 points", CHECK, () =>
    prisma.question.create({ data: { activityId, questionText: "zero", points: 0, position: 99 } }),
  );
  await expectRejected("question position 0", CHECK, () =>
    prisma.question.create({ data: { activityId, questionText: "pos zero", position: 0 } }),
  );
  await expectRejected("OPEN activity without a session code", CHECK, () =>
    prisma.activity.create({ data: { classroomId, title: "bad open", status: "OPEN", openedAt: new Date() } }),
  );
  await expectRejected("CLOSED activity without closed_at", CHECK, () =>
    prisma.activity.create({
      data: { classroomId, title: "bad closed", status: "CLOSED", sessionCode: `X${run}`.toUpperCase(), openedAt: new Date() },
    }),
  );
  await expectRejected("DRAFT activity that already has a session code", CHECK, () =>
    prisma.activity.create({ data: { classroomId, title: "bad draft", sessionCode: `Y${run}`.toUpperCase() } }),
  );


  // Foreign keys / orphans
  await expectRejected("submission for a participant that does not exist", FOREIGN_KEY, () =>
    prisma.submission.create({ data: { participantId: 2147483647, attemptNumber: 1, score: "0.00", maxScore: "10.00" } }),
  );

  // Use a fresh submission so the unique (submissionId, questionId)
  // constraint does not interfere with the invalid-choice foreign-key test.
  const invalidChoiceSubmission = await prisma.submission.create({
    data: {
      participantId: participant2Id,
      attemptNumber: 1,
      score: "0.00",
      maxScore: "10.00",
    },
  });

  await expectRejected("answer that selects a choice that does not exist", FOREIGN_KEY, () =>
    prisma.submissionAnswer.create({
      data: {
        submissionId: invalidChoiceSubmission.id,
        questionId: q2Id,
        selectedChoiceId: 2147483647,
        isCorrect: false,
        awardedPoints: "0.00",
      },
    }),
  );


  // History is protected (RESTRICT)
  await expectRejected("delete an instructor who owns classrooms", FOREIGN_KEY, () =>
    prisma.instructor.delete({ where: { id: instructorId } }),
  );
  await expectRejected("delete a participant who has submissions", FOREIGN_KEY, () =>
    prisma.participant.delete({ where: { id: participantId } }),
  );
  await expectRejected("delete an activity that has participants", FOREIGN_KEY, () =>
    prisma.activity.delete({ where: { id: activityId } }),
  );
  await check("...and that failed delete removed nothing (questions still there)", async () => {
    const n = await prisma.question.count({ where: { activityId } });
    assert(n === 2, `expected 2 questions, found ${n}`);
  });
  await expectRejected("delete a choice that a student selected", FOREIGN_KEY, () =>
    prisma.choice.delete({ where: { id: q1Choices.find((c) => c.isCorrect)!.id } }),
  );
  await expectRejected("delete a question that has recorded answers", FOREIGN_KEY, () =>
    prisma.question.delete({ where: { id: q1Id } }),
  );
  await check("...and that failed delete removed none of its choices", async () => {
    const n = await prisma.choice.count({ where: { questionId: q1Id } });
    assert(n === 3, `expected 3 choices, found ${n}`);
  });

  heading("4. Transactions");

  await check("failed multi-step submission rolls back completely", async () => {
    const before = await prisma.submission.count({ where: { participantId: participant2Id } });
    let threw = false;
    try {
      await prisma.$transaction(async (tx) => {
        const s = await tx.submission.create({
          data: { participantId: participant2Id, attemptNumber: 1, score: "2.00", maxScore: "10.00" },
        });
        await tx.submissionAnswer.create({
          data: { submissionId: s.id, questionId: q1Id, selectedChoiceId: q1Choices[1].id, isCorrect: true, awardedPoints: "2.00" },
        });
        // Deliberate violation: a second answer to the same question.
        await tx.submissionAnswer.create({
          data: { submissionId: s.id, questionId: q1Id, selectedChoiceId: q1Choices[0].id, isCorrect: false, awardedPoints: "0.00" },
        });
      });
    } catch {
      threw = true;
    }
    assert(threw, "the transaction should have failed");
    const after = await prisma.submission.count({ where: { participantId: participant2Id } });
    const strayAnswers = await prisma.submissionAnswer.count({
      where: { submission: { participantId: participant2Id } },
    });
    assert(after === before, `submission persisted (${before} -> ${after})`);
    assert(strayAnswers === 0, `${strayAnswers} answers survived the rollback`);
  });

  heading("5. Historical records");

  await check("attempt 1 and attempt 2 are both still stored with their own scores", async () => {
    const attempts = await prisma.submission.findMany({
      where: { participantId },
      orderBy: { attemptNumber: "asc" },
      include: { answers: true },
    });
    assert(attempts.map((a) => a.attemptNumber).join(",") === "1,2", "attempt numbers wrong");
    assert(Number(attempts[0].score) === 2 && Number(attempts[1].score) === 3, "scores were altered");
    assert(attempts.every((a) => a.answers.length === 2), "answers missing");
  });

}

// ----------------------------------------------------------------------------
async function main() {
  const run = randomBytes(4).toString("hex");
  console.log(`Phase 1 database verification (run ${run})`);

  try {
    await verifyStructure();

    const leftovers = await cleanup();
    if (leftovers > 0) console.log(`\n(removed ${leftovers} leftover test instructor(s) from an earlier run)`);

    await verifyBehaviour(run);
  } finally {
    heading("Cleanup");
    try {
      await cleanup();
      const remaining = await prisma.instructor.count({ where: { email: { startsWith: EMAIL_PREFIX } } });
      report(remaining === 0, "all test rows removed");
    } catch (error) {
      report(false, "cleanup", errorText(error).trim().slice(0, 300));
    }
    await prisma.$disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("PHASE 1 NOT READY - fix the FAIL lines above before starting Phase 2.");
    process.exit(1);
  }
  console.log("PHASE 1 READY - database layer verified.");
}

main().catch((error) => {
  console.error("\nverification crashed:", error);
  process.exit(1);
});
