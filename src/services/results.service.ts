// Instructor-side participation and results (Phase 4, Stage E).
// Every function is scoped to the authenticated instructor's own activities.
// Correct-answer information is available here, and only here.
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { generateSessionToken, hashSessionToken } from "@/lib/security";

const notFound = () => new AppError(404, "NOT_FOUND", "We could not find that activity.");

async function ownedActivity(instructorId: number, activityId: number) {
  const row = await prisma.activity.findFirst({
    where: { id: activityId, classroom: { instructorId } },
    select: { id: true, title: true, status: true, archivedAt: true, maxAttempts: true },
  });
  if (!row) throw notFound();
  return row;
}

export type ParticipantResultDto = {
  participantId: number;
  displayName: string;
  joinedAt: string;
  accessReleasedAt: string | null;
  attempts: Array<{ attemptNumber: number; score: number; maxScore: number; percentage: number; submittedAt: string }>;
  retake: { status: "none" | "authorized" | "used"; authorizedAt: string | null };
  /** What the instructor can do for this participant right now. */
  canAuthorizeRetake: boolean;
  canReleaseAccess: boolean;
};

export type ActivityResultsDto = {
  activity: { id: number; title: string; status: string; archived: boolean; maxAttempts: number };
  summary: {
    participantCount: number;
    submittedCount: number;
    averagePercentage: number | null;
  };
  questionStats: Array<{ questionId: number; position: number; questionText: string; points: number; answered: number; correct: number }>;
  participants: ParticipantResultDto[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function getActivityResults(instructorId: number, activityId: number): Promise<ActivityResultsDto> {
  const activity = await ownedActivity(instructorId, activityId);

  const [questions, participants] = await Promise.all([
    prisma.question.findMany({
      where: { activityId },
      orderBy: { position: "asc" },
      select: { id: true, position: true, questionText: true, points: true, answers: { select: { isCorrect: true } } },
    }),
    prisma.participant.findMany({
      where: { activityId },
      orderBy: { joinedAt: "asc" },
      select: {
        id: true,
        displayName: true,
        joinedAt: true,
        accessReleasedAt: true,
        submissions: { orderBy: { attemptNumber: "asc" }, select: { attemptNumber: true, score: true, submittedAt: true } },
        retakeAuthorization: { select: { authorizedAt: true, usedAt: true } },
      },
    }),
  ]);

  const maxScore = questions.reduce((sum, q) => sum + q.points, 0);
  const isOpen = activity.status === "OPEN" && !activity.archivedAt;

  const rows: ParticipantResultDto[] = participants.map((p) => {
    const attempts = p.submissions.map((s) => {
      const score = Number(s.score.toString());
      return {
        attemptNumber: s.attemptNumber,
        score,
        maxScore,
        percentage: maxScore === 0 ? 0 : round2((score / maxScore) * 100),
        submittedAt: s.submittedAt.toISOString(),
      };
    });
    const hasFirst = attempts.some((a) => a.attemptNumber === 1);
    const hasSecond = attempts.some((a) => a.attemptNumber === 2);
    const retake = p.retakeAuthorization
      ? { status: (p.retakeAuthorization.usedAt ? "used" : "authorized") as "used" | "authorized", authorizedAt: p.retakeAuthorization.authorizedAt.toISOString() }
      : { status: "none" as const, authorizedAt: null };

    return {
      participantId: p.id,
      displayName: p.displayName,
      joinedAt: p.joinedAt.toISOString(),
      accessReleasedAt: p.accessReleasedAt ? p.accessReleasedAt.toISOString() : null,
      attempts,
      retake,
      canAuthorizeRetake: isOpen && activity.maxAttempts === 2 && hasFirst && !hasSecond && !p.retakeAuthorization,
      canReleaseAccess: isOpen && !p.accessReleasedAt && !hasSecond,
    };
  });

  const firstAttempts = rows
    .map((r) => r.attempts.find((a) => a.attemptNumber === 1))
    .filter((a): a is NonNullable<typeof a> => Boolean(a));
  const averagePercentage =
    firstAttempts.length === 0
      ? null
      : round2(firstAttempts.reduce((sum, a) => sum + a.percentage, 0) / firstAttempts.length);

  return {
    activity: {
      id: activity.id,
      title: activity.title,
      status: activity.status,
      archived: activity.archivedAt !== null,
      maxAttempts: activity.maxAttempts,
    },
    summary: {
      participantCount: rows.length,
      submittedCount: rows.filter((r) => r.attempts.length > 0).length,
      averagePercentage,
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
