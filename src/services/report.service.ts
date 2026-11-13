// Builds the downloadable PDF report for one activity (Phase 5).
// The data comes from the same results service the dashboard uses, so the PDF and
// the screen can never disagree. Ownership is enforced by getActivityResults.
import { getActivityResults, type ActivityResultsDto } from "./results.service";
import { formatDate, renderActivityReport, SYSTEM_TITLE, type ActivityReportData } from "@/lib/pdf";
import { SUBMISSION_STATUS_LABEL } from "@/lib/results-rules";

export function toReportData(r: ActivityResultsDto, generatedAt: Date): ActivityReportData {
  const totalSubmissions = r.participants.reduce((sum, p) => sum + p.attempts.length, 0);
  const activityDate = r.activity.openedAt
    ? formatDate(r.activity.openedAt)
    : r.activity.scheduledOpensAt
      ? `Scheduled for ${formatDate(r.activity.scheduledOpensAt)}`
      : "Not scheduled";

  return {
    systemTitle: SYSTEM_TITLE,
    instructorName: r.instructor.fullName,
    classroomName: r.classroom.name,
    activityTitle: r.activity.title,
    activityDate,
    openedAt: r.activity.openedAt,
    closedAt: r.activity.closedAt,
    attemptsAllowed: r.activity.maxAttempts,
    questionCount: r.activity.questionCount,
    maxScore: r.activity.maxScore,
    totalParticipants: r.summary.participantCount,
    totalSubmissions,
    averageFirstAttempt: r.summary.averagePercentage,
    averageCurrent: r.summary.averageCurrentPercentage,
    generatedAt: generatedAt.toISOString(),
    participants: r.participants.map((p) => ({
      displayName: p.displayName,
      statusLabel: SUBMISSION_STATUS_LABEL[p.submissionStatus],
      attempts: p.attempts.map((a) => ({
        attemptNumber: a.attemptNumber,
        score: a.score,
        maxScore: a.maxScore,
        percentage: a.percentage,
        submittedAt: a.submittedAt,
        isCurrent: p.currentResult?.attemptNumber === a.attemptNumber,
      })),
    })),
  };
}

/** ASCII-only file name: accents are folded, everything else becomes a hyphen. */
export function reportFilename(activityTitle: string, activityId: number): string {
  const slug = activityTitle
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
  return `results-${slug || "activity"}-${activityId}.pdf`;
}

export async function generateActivityReport(
  instructorId: number,
  activityId: number,
  now: Date = new Date(),
): Promise<{ filename: string; bytes: Uint8Array; participantCount: number; submissionCount: number }> {
  const results = await getActivityResults(instructorId, activityId);
  const data = toReportData(results, now);
  const bytes = await renderActivityReport(data);
  return {
    filename: reportFilename(results.activity.title, results.activity.id),
    bytes,
    participantCount: data.totalParticipants,
    submissionCount: data.totalSubmissions,
  };
}
