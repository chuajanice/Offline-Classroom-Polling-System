// Pure attempt and scoring rules (Phase 4). No database: unit-tested directly.
import { AppError } from "./errors";

type AttemptPlan =
  | { available: true; attemptNumber: 1 | 2 }
  | { available: false };

/**
 * Which attempt, if any, the student may answer now. Attempt 1 is always
 * available until submitted. Attempt 2 requires an authorised retake that has
 * not been used, and an activity whose attempt limit is 2.
 */
export function planAttempt(
  submittedAttempts: number[],
  maxAttempts: number,
  retake: { usedAt: Date | null } | null,
): AttemptPlan {
  if (!submittedAttempts.includes(1)) return { available: true, attemptNumber: 1 };
  if (submittedAttempts.includes(2)) return { available: false };
  if (maxAttempts >= 2 && retake && retake.usedAt === null) return { available: true, attemptNumber: 2 };
  return { available: false };
}

/** The deadline for one attempt: the time limit from its start, never later than the scheduled close. */
export function attemptDeadline(
  startedAt: Date,
  durationMinutes: number | null,
  scheduledClosesAt: Date | null,
): Date | null {
  const limits: number[] = [];
  if (durationMinutes !== null) limits.push(startedAt.getTime() + durationMinutes * 60_000);
  if (scheduledClosesAt) limits.push(scheduledClosesAt.getTime());
  return limits.length ? new Date(Math.min(...limits)) : null;
}

/** Scores an answer set against the stored answer key. Pure, so it can be unit-tested. */
export function scoreAnswers(
  questions: Array<{ id: number; points: number; choices: Array<{ id: number; isCorrect: boolean }> }>,
  answers: Array<{ questionId: number; choiceId: number }>,
): { rows: Array<{ questionId: number; choiceId: number; isCorrect: boolean; awardedPoints: number }>; score: number; maxScore: number } {
  const byQuestion = new Map(questions.map((q) => [q.id, q]));
  const seen = new Set<number>();
  const rows: Array<{ questionId: number; choiceId: number; isCorrect: boolean; awardedPoints: number }> = [];

  for (const answer of answers) {
    const question = byQuestion.get(answer.questionId);
    if (!question) throw new AppError(400, "ANSWER_INVALID", "One of the answers is not part of this activity.");
    if (seen.has(answer.questionId)) {
      throw new AppError(400, "ANSWER_INVALID", "Each question can be answered only once.");
    }
    const choice = question.choices.find((c) => c.id === answer.choiceId);
    if (!choice) throw new AppError(400, "ANSWER_INVALID", "One of the chosen answers does not belong to its question.");
    seen.add(answer.questionId);
    rows.push({
      questionId: question.id,
      choiceId: choice.id,
      isCorrect: choice.isCorrect,
      awardedPoints: choice.isCorrect ? question.points : 0,
    });
  }

  const score = rows.reduce((sum, r) => sum + r.awardedPoints, 0);
  const maxScore = questions.reduce((sum, q) => sum + q.points, 0);
  return { rows, score, maxScore };
}

