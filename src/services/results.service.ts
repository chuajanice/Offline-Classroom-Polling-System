// Instructor-side participation and results (Phase 4 and 5).
// Every function is scoped to the authenticated instructor's own activities.
// Correct-answer information is available here, and only here.
//
// Scores are read from the stored submission rows. Each row carries the maximum it
// was marked against, so historical percentages are never recalculated.
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { generateSessionToken, hashSessionToken } from "@/lib/security";
import {
  currentResult,
  percentOf,
  submissionStatus,
  type AttemptResult,
  type RetakeState,
  type SubmissionStatus,
} from "@/lib/results-rules";

const notFound = () => new AppError(404, "NOT_FOUND", "We could not find that activity.");

async function ownedActivity(instructorId: number, activityId: number) {
  const row = await prisma.activity.findFirst({
    where: { id: activityId, classroom: { instructorId } },
    include: {
      classroom: {
        select: {
          classroomName: true,
          description: true,
          archivedAt: true,
          instructor: { select: { fullName: true } },
        },
      },
      _count: { select: { questions: true } },
    },
  });
  if (!row) throw notFound();
  return row;
}

export type ParticipantResultDto = {
  participantId: number;
  displayName: string;
  joinedAt: string;
  accessReleasedAt: string | null;
  /** Every submitted attempt, kept separately: attempt 1 and, if any, attempt 2. */
  attempts: AttemptResult[];
  /** The latest accepted attempt. Null when nothing has been submitted. */
  currentResult: AttemptResult | null;
  submissionStatus: SubmissionStatus;
  retake: { status: RetakeState; authorizedAt: string | null };
  canAuthorizeRetake: boolean;
  canReleaseAccess: boolean;
};

export type ActivityResultsDto = {
  activity: {
    id: number;
    title: string;
    status: string;
    archived: boolean;
    maxAttempts: number;
    questionCount: number;
    maxScore: number;
    openedAt: string | null;
    closedAt: string | null;
    scheduledOpensAt: string | null;
    scheduledClosesAt: string | null;
  };
  classroom: { name: string; description: string | null; archived: boolean };
  instructor: { fullName: string };
  summary: {
    participantCount: number;
    submittedCount: number;
    /** Average of attempt 1 across participants who submitted it. */
    averagePercentage: number | null;
    /** Average of each participant's current result. */
    averageCurrentPercentage: number | null;
  };
  questionStats: Array<{ questionId: number; position: number; questionText: string; points: number; answered: number; correct: number }>;
  participants: ParticipantResultDto[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const iso = (d: Date | null) => (d ? d.toISOString() : null);

export async function getActivityResults(instructorId: number, activityId: number): Promise<ActivityResultsDto> {
  const activity = await ownedActivity(instructorId, activityId);

  const [questions, participants] = await Promise.all([
    prisma.question.findMany({
      where: { activityId },
      orderBy: { position: "asc" },
      select: {
        id: true,
        position: true,
        questionText: true,
        points: true,
        answers: { select: { isCorrect: true } },
      },
    }),
    prisma.participant.findMany({
      where: { activityId },
      orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        displayName: true,
        joinedAt: true,
        accessReleasedAt: true,
        submissions: {
          orderBy: { attemptNumber: "asc" },
          select: { attemptNumber: true, score: true, maxScore: true, submittedAt: true },
        },
        retakeAuthorization: { select: { authorizedAt: true, usedAt: true } },
      },
    }),
  ]);

  const maxScore = Number(questions.reduce((sum, q) => sum + q.points, 0));
  const isOpen = activity.status === "OPEN" && !activity.archivedAt;

  const rows: ParticipantResultDto[] = participants.map((p) => {
    const attempts: AttemptResult[] = p.submissions.map((s) => {
      const score = Number(s.score.toString());
      const max = Number(s.maxScore.toString());
      return {
        attemptNumber: s.attemptNumber,
        score,
        maxScore: max,
        percentage: percentOf(score, max),
        submittedAt: s.submittedAt.toISOString(),
      };
    });
    const hasFirst = attempts.some((a) => a.attemptNumber === 1);
    const hasSecond = attempts.some((a) => a.attemptNumber === 2);
    const retakeState: RetakeState = p.retakeAuthorization
      ? (p.retakeAuthorization.usedAt ? "used" : "authorized")
      : "none";

    return {
      participantId: p.id,
      displayName: p.displayName,
      joinedAt: p.joinedAt.toISOString(),
      accessReleasedAt: iso(p.accessReleasedAt),
      attempts,
      currentResult: currentResult(attempts),
      submissionStatus: submissionStatus(attempts.map((a) => a.attemptNumber), retakeState),
      retake: {
        status: retakeState,
        authorizedAt: iso(p.retakeAuthorization?.authorizedAt ?? null),
      },
      canAuthorizeRetake: isOpen && activity.maxAttempts === 2 && hasFirst && !hasSecond && !p.retakeAuthorization,
      canReleaseAccess: isOpen && !p.accessReleasedAt && !hasSecond,
    };
  });

  const firstAttempts = rows
    .map((r) => r.attempts.find((a) => a.attemptNumber === 1))
    .filter((a): a is AttemptResult => Boolean(a));
  const currents = rows.map((r) => r.currentResult).filter((a): a is AttemptResult => Boolean(a));
  const average = (list: AttemptResult[]) =>
    list.length === 0 ? null : round2(list.reduce((sum, a) => sum + a.percentage, 0) / list.length);

  return {
    activity: {
      id: activity.id,
      title: activity.title,
      status: activity.status,
      archived: activity.archivedAt !== null,
      maxAttempts: activity.maxAttempts,
      questionCount: activity._count.questions,
      maxScore,
      openedAt: iso(activity.openedAt),
      closedAt: iso(activity.closedAt),
      scheduledOpensAt: iso(activity.scheduledOpensAt),
      scheduledClosesAt: iso(activity.scheduledClosesAt),
    },
    classroom: {
      name: activity.classroom.classroomName,
      description: activity.classroom.description,
      archived: activity.classroom.archivedAt !== null,
    },
    instructor: { fullName: activity.classroom.instructor.fullName },
    summary: {
      participantCount: rows.length,
      submittedCount: rows.filter((r) => r.attempts.length > 0).length,
      averagePercentage: average(firstAttempts),
      averageCurrentPercentage: average(currents),
    },
    questionStats: questions.map((q) => ({
      questionId: q.id,
      position: q.position,
      questionText: q.questionText,
      points: q.points,
      answered: q.answers.length,
      correct: q.answers.filter((a) => a.isCorrect).length,
    })),
    participants: rows,
  };
}

async function ownedParticipant(instructorId: number, activityId: number, participantId: number) {
  await ownedActivity(instructorId, activityId);
  const row = await prisma.participant.findFirst({
    where: { id: participantId, activityId },
    select: {
      id: true,
      accessReleasedAt: true,
      submissions: { select: { attemptNumber: true } },
      retakeAuthorization: { select: { id: true } },
    },
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "We could not find that participant.");
  return row;
}

/**
 * Authorises the single retake. Allowed only while the activity is open, its
 * attempt limit is 2, the student has submitted attempt 1, and no retake exists yet.
 */
export async function authorizeRetake(instructorId: number, activityId: number, participantId: number) {
  const activity = await ownedActivity(instructorId, activityId);
  const p = await ownedParticipant(instructorId, activityId, participantId);
  if (activity.status !== "OPEN" || activity.archivedAt) {
    throw new AppError(409, "ACTIVITY_CLOSED", "Retakes can only be authorised while the activity is open.");
  }
  if (activity.maxAttempts !== 2) {
    throw new AppError(409, "RETAKE_NOT_ALLOWED", "This activity allows only one attempt, so no retake can be authorised.");
  }
  if (!p.submissions.some((s) => s.attemptNumber === 1) || p.submissions.some((s) => s.attemptNumber === 2)) {
    throw new AppError(409, "RETAKE_NOT_ALLOWED", "A retake can be authorised only after the first attempt is submitted.");
  }
  if (p.retakeAuthorization) {
    throw new AppError(409, "RETAKE_EXISTS", "This student already has a retake authorisation.");
  }
  await prisma.retakeAuthorization.create({
    data: { participantId, authorizedBy: instructorId },
  });
  return getActivityResults(instructorId, activityId);
}

/**
 * Releases a student's access: the old token is replaced with an unguessable
 * value (so the old cookie stops working at once) and the same name may rejoin.
 * Submissions and scores are untouched.
 */
export async function releaseAccess(instructorId: number, activityId: number, participantId: number, now: Date = new Date()) {
  await ownedParticipant(instructorId, activityId, participantId);
  await prisma.participant.update({
    where: { id: participantId },
    data: {
      sessionTokenHash: hashSessionToken(generateSessionToken()),
      accessReleasedAt: new Date(Math.floor(now.getTime() / 1000) * 1000),
    },
  });
  return getActivityResults(instructorId, activityId);
}
