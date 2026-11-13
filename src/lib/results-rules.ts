// Pure result rules (Phase 5). No database, no framework: unit-tested directly.
// The server computes every figure shown in the dashboard and in PDF reports.

/** Percentage rounded to two decimals. A zero maximum gives 0 rather than dividing by zero. */
export function percentOf(score: number, maxScore: number): number {
  if (maxScore <= 0) return 0;
  return Math.round((score / maxScore) * 10000) / 100;
}

export type AttemptResult = {
  attemptNumber: number;
  score: number;
  maxScore: number;
  percentage: number;
  submittedAt: string;
};

/**
 * The student's current result is the latest accepted attempt. Attempt 2 is
 * accepted only after an authorised retake, so it always supersedes attempt 1.
 * Both attempts remain in the history; this only chooses which one is "current".
 */
export function currentResult<T extends { attemptNumber: number }>(attempts: T[]): T | null {
  if (attempts.length === 0) return null;
  return attempts.reduce((latest, a) => (a.attemptNumber > latest.attemptNumber ? a : latest));
}

export type RetakeState = "none" | "authorized" | "used";

export type SubmissionStatus = "not_submitted" | "submitted" | "retake_authorized" | "retake_submitted";

export const SUBMISSION_STATUS_LABEL: Record<SubmissionStatus, string> = {
  not_submitted: "Not submitted",
  submitted: "Submitted",
  retake_authorized: "Retake authorised",
  retake_submitted: "Retake submitted",
};

/** A short, instructor-facing status for one participant. */
export function submissionStatus(attemptNumbers: number[], retake: RetakeState): SubmissionStatus {
  const hasSecond = attemptNumbers.includes(2);
  if (hasSecond) return "retake_submitted";
  if (attemptNumbers.includes(1)) {
    return retake === "authorized" || retake === "used" ? "retake_authorized" : "submitted";
  }
  return "not_submitted";
}
