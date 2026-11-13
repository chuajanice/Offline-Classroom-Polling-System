// Student-side business logic (Phase 4). Students have no accounts: they join
// with a name and a session code, and are then identified only by the random
// participant token in their browser's cookie (stored hashed).
//
// Rules enforced here, on the server:
//  - a join or submission is accepted only while the activity is OPEN and its deadline has not passed
//  - the activity row is locked during join and submit, so nothing can slip in after closing
//    and two submissions for one attempt cannot both succeed
//  - a token authenticates only the activity it was issued for
//  - scores are computed here from the stored answer key; the browser never supplies points
//  - the student view never contains correct-answer information
import { prisma } from "@/lib/prisma";
import { AppError, isUniqueViolation } from "@/lib/errors";
import { hashSessionToken, generateSessionToken } from "@/lib/security";
import { checkDisplayName } from "@/lib/student-name";
import { isWellFormedSessionCode, normalizeSessionCode } from "@/lib/session-code";
import type { JoinInput, SubmissionInput } from "@/lib/builder-validation";
import { closeIfDeadlinePassed } from "./lifecycle";
import { attemptDeadline, planAttempt, scoreAnswers } from "@/lib/attempt-rules";

const INVALID_CODE_MESSAGE = "We could not find an activity with that session code. Check the code and try again.";
const CLOSED_MESSAGE = "This activity is no longer accepting participants.";
const UNAUTHENTICATED = () =>
  new AppError(401, "UNAUTHENTICATED", "Join the activity with your session code first.");

export type JoinResult = { activityId: number; participantId: number; token: string };

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Locks the activity row for the rest of the transaction (serialises joins and submissions). */
export async function lockActivity(tx: Tx, activityId: number): Promise<void> {
  await tx.$queryRaw`SELECT id FROM activities WHERE id = ${activityId} FOR UPDATE`;
}

/** Student join: validates the name and code, creates the participant, and returns a fresh token. */
export async function joinActivity(input: JoinInput, now: Date = new Date()): Promise<JoinResult> {
  const name = checkDisplayName(input.fullName);
  if (!name.ok) {
    throw new AppError(400, "VALIDATION_ERROR", "Please correct the highlighted field.", {
      fields: { fullName: name.message },
    });
  }

  const code = normalizeSessionCode(input.sessionCode);
  if (!isWellFormedSessionCode(code)) {
    throw new AppError(404, "INVALID_CODE", INVALID_CODE_MESSAGE);
  }
  const activity = await prisma.activity.findUnique({ where: { sessionCode: code }, select: { id: true } });
  if (!activity) throw new AppError(404, "INVALID_CODE", INVALID_CODE_MESSAGE);

  await closeIfDeadlinePassed(activity.id, now);

  const token = generateSessionToken();
  try {
    return await prisma.$transaction(async (tx) => {
      await lockActivity(tx, activity.id);
      const current = await tx.activity.findUniqueOrThrow({
        where: { id: activity.id },
        select: { status: true, archivedAt: true, scheduledClosesAt: true },
      });
      if (current.status !== "OPEN" || current.archivedAt) {
        throw new AppError(409, "ACTIVITY_CLOSED", CLOSED_MESSAGE);
      }
      if (current.scheduledClosesAt && now.getTime() >= current.scheduledClosesAt.getTime()) {
        throw new AppError(409, "ACTIVITY_CLOSED", CLOSED_MESSAGE);
      }

      const existing = await tx.participant.findFirst({
        where: { activityId: activity.id, normalizedName: name.normalizedName },
        select: { id: true, accessReleasedAt: true },
      });
      if (existing) {
        // Only an instructor-released participant may reclaim the name. The new token
        // replaces the hash, so the old token stops working. History is kept.
        if (existing.accessReleasedAt === null) throw nameTaken();
        await tx.participant.update({
          where: { id: existing.id },
          data: { sessionTokenHash: hashSessionToken(token), accessReleasedAt: null },
        });
        return { activityId: activity.id, participantId: existing.id, token };
      }

      const participant = await tx.participant.create({
        data: {
          activityId: activity.id,
          displayName: name.displayName,
          normalizedName: name.normalizedName,
          sessionTokenHash: hashSessionToken(token),
        },
        select: { id: true },
      });
      return { activityId: activity.id, participantId: participant.id, token };
    });
  } catch (error) {
    // The unique index on (activity, normalized name) catches a concurrent duplicate join.
    if (isUniqueViolation(error)) throw nameTaken();
    throw error;
  }
}

const nameTaken = () =>
  new AppError(
    409,
    "NAME_TAKEN",
    "This name has already joined this activity. If that was you, ask your instructor to restore your access.",
  );

/**
 * Confirms that `token` belongs to a participant of THIS activity. Any other
 * outcome (missing, wrong, or another activity's token) gets the same 401,
 * so the response reveals nothing about which tokens exist.
 */
export async function authenticateParticipant(activityId: number, token: string | undefined) {
  if (!token) throw UNAUTHENTICATED();
  const participant = await prisma.participant.findUnique({
    where: { sessionTokenHash: hashSessionToken(token) },
    select: { id: true, activityId: true, displayName: true },
  });
  if (!participant || participant.activityId !== activityId) throw UNAUTHENTICATED();
  return participant;
}

// ---- submission ------------------------------------------------------------

export type ResultDto = {
  attemptNumber: number;
  score: number;
  maxScore: number;
  percentage: number;
  submittedAt: string;
};

const percentOf = (score: number, maxScore: number) =>
  maxScore === 0 ? 0 : Math.round((score / maxScore) * 10000) / 100;

/**
 * Accepts one attempt. Inside one locked transaction it checks the activity is
 * open, the attempt is available, the time limit has not run out, and every
 * answer belongs to this activity. Then it stores the submission and its answers.
 */
export async function submitAnswers(
  activityId: number,
  token: string | undefined,
  input: SubmissionInput,
  now: Date = new Date(),
): Promise<ResultDto> {
  const participant = await authenticateParticipant(activityId, token);
  await closeIfDeadlinePassed(activityId, now);

  return prisma.$transaction(async (tx) => {
    await lockActivity(tx, activityId);

    const activity = await tx.activity.findUniqueOrThrow({
      where: { id: activityId },
      include: {
        questions: { select: { id: true, points: true, choices: { select: { id: true, isCorrect: true } } } },
      },
    });
    if (activity.status !== "OPEN" || activity.archivedAt) {
      throw new AppError(409, "ACTIVITY_CLOSED", "This activity has closed. Your answers were not saved.");
    }
    if (activity.scheduledClosesAt && now.getTime() >= activity.scheduledClosesAt.getTime()) {
      throw new AppError(409, "ACTIVITY_CLOSED", "This activity has closed. Your answers were not saved.");
    }

    const [submissions, retake] = await Promise.all([
      tx.submission.findMany({ where: { participantId: participant.id }, select: { attemptNumber: true } }),
      tx.retakeAuthorization.findUnique({ where: { participantId: participant.id }, select: { usedAt: true } }),
    ]);
    const plan = planAttempt(
      submissions.map((s) => s.attemptNumber),
      activity.maxAttempts,
      retake,
    );
    if (!plan.available) {
      throw new AppError(409, "NO_ATTEMPT_LEFT", "You have already submitted every attempt you are allowed.");
    }

    // The start row is normally created when the questions were first shown. If it is missing, start now.
    const start = await tx.attemptStart.upsert({
      where: { participantId_attemptNumber: { participantId: participant.id, attemptNumber: plan.attemptNumber } },
      create: { participantId: participant.id, attemptNumber: plan.attemptNumber, startedAt: wholeSecond(now) },
      update: {},
    });
    const deadline = attemptDeadline(start.startedAt, activity.durationMinutes, activity.scheduledClosesAt);
    if (deadline && now.getTime() > deadline.getTime()) {
      throw new AppError(409, "TIME_UP", "Your time is up. Your answers were not saved.");
    }

    const scored = scoreAnswers(activity.questions, input.answers);
    const submission = await tx.submission.create({
      data: {
        participantId: participant.id,
        attemptNumber: plan.attemptNumber,
        score: scored.score,
        maxScore: scored.maxScore,
        submittedAt: wholeSecond(now),
      },
      select: { id: true, submittedAt: true },
    });
    if (scored.rows.length > 0) {
      await tx.submissionAnswer.createMany({
        data: scored.rows.map((r) => ({
          submissionId: submission.id,
          questionId: r.questionId,
          selectedChoiceId: r.choiceId,
          isCorrect: r.isCorrect,
          awardedPoints: r.awardedPoints,
        })),
      });
    }
    if (plan.attemptNumber === 2) {
      await tx.retakeAuthorization.update({
        where: { participantId: participant.id },
        data: { usedAt: wholeSecond(now) },
      });
    }

    return {
      attemptNumber: plan.attemptNumber,
      score: scored.score,
      maxScore: scored.maxScore,
      percentage: percentOf(scored.score, scored.maxScore),
      submittedAt: submission.submittedAt.toISOString(),
    };
  });
}

const wholeSecond = (d: Date) => new Date(Math.floor(d.getTime() / 1000) * 1000);

// ---- student view ----------------------------------------------------------

export type StudentActivityDto = {
  activity: {
    id: number;
    title: string;
    instructions: string | null;
    status: "OPEN" | "CLOSED";
    closesAt: string | null;
    durationMinutes: number | null;
    maxAttempts: number;
  };
  participant: { displayName: string };
  attempt: {
    /** ready: answer now. timeUp: the time limit ran out. finished: nothing left to answer. closed: activity closed. */
    state: "ready" | "timeUp" | "finished" | "closed";
    number: number | null;
    deadline: string | null;
  };
  results: ResultDto[];
  /** Empty unless the attempt is ready. Never contains correct-answer information. */
  questions: Array<{
    id: number;
    questionText: string;
    points: number;
    position: number;
    choices: Array<{ id: number; choiceText: string; position: number }>;
  }>;
};

/**
 * The student's view. Starting the attempt is recorded here, when the
 * questions are first shown: the time limit then runs from that moment.
 */
export async function getStudentActivity(activityId: number, token: string | undefined, now: Date = new Date()): Promise<StudentActivityDto> {
  const participant = await authenticateParticipant(activityId, token);
  await closeIfDeadlinePassed(activityId, now);

  const [row, submissions, retake] = await Promise.all([
    prisma.activity.findUnique({
      where: { id: activityId },
      select: {
        id: true,
        title: true,
        instructions: true,
        status: true,
        scheduledClosesAt: true,
        durationMinutes: true,
        maxAttempts: true,
        questions: {
          orderBy: { position: "asc" },
          select: {
            id: true,
            questionText: true,
            points: true,
            position: true,
            choices: {
              orderBy: { position: "asc" },
              select: { id: true, choiceText: true, position: true },
            },
          },
        },
      },
    }),
    prisma.submission.findMany({
      where: { participantId: participant.id },
      orderBy: { attemptNumber: "asc" },
      select: { attemptNumber: true, score: true, maxScore: true, submittedAt: true },
    }),
    prisma.retakeAuthorization.findUnique({ where: { participantId: participant.id }, select: { usedAt: true } }),
  ]);
  if (!row) throw UNAUTHENTICATED();

  const results: ResultDto[] = submissions.map((s) => {
    const score = Number(s.score.toString());
    const maxScore = Number(s.maxScore.toString());
    return {
      attemptNumber: s.attemptNumber,
      score,
      maxScore,
      percentage: percentOf(score, maxScore),
      submittedAt: s.submittedAt.toISOString(),
    };
  });

  const base = {
    activity: {
      id: row.id,
      title: row.title,
      instructions: row.instructions,
      status: (row.status === "OPEN" ? "OPEN" : "CLOSED") as "OPEN" | "CLOSED",
      closesAt: row.scheduledClosesAt ? row.scheduledClosesAt.toISOString() : null,
      durationMinutes: row.durationMinutes,
      maxAttempts: row.maxAttempts,
    },
    participant: { displayName: participant.displayName },
    results,
  };

  if (row.status !== "OPEN") {
    return { ...base, attempt: { state: "closed", number: null, deadline: null }, questions: [] };
  }

  const plan = planAttempt(
    submissions.map((s) => s.attemptNumber),
    row.maxAttempts,
    retake,
  );
  if (!plan.available) {
    return { ...base, attempt: { state: "finished", number: null, deadline: null }, questions: [] };
  }

  // Record the start of this attempt the first time it is shown (idempotent).
  await prisma.attemptStart.createMany({
    data: [{ participantId: participant.id, attemptNumber: plan.attemptNumber, startedAt: wholeSecond(now) }],
    skipDuplicates: true,
  });
  const start = await prisma.attemptStart.findUniqueOrThrow({
    where: { participantId_attemptNumber: { participantId: participant.id, attemptNumber: plan.attemptNumber } },
  });
  const deadline = attemptDeadline(start.startedAt, row.durationMinutes, row.scheduledClosesAt);

  if (deadline && now.getTime() >= deadline.getTime()) {
    return { ...base, attempt: { state: "timeUp", number: plan.attemptNumber, deadline: deadline.toISOString() }, questions: [] };
  }
  return {
    ...base,
    attempt: { state: "ready", number: plan.attemptNumber, deadline: deadline ? deadline.toISOString() : null },
    questions: row.questions,
  };
}
