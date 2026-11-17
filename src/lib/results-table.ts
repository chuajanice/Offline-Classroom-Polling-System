// Rows of the results PDF table (Stage 6). Pure: unit-tested directly.
//
// One row per participant, showing ONLY the current result: the latest accepted attempt
// (chosen upstream by currentResult()). Attempts are never added, averaged, or duplicated,
// and the highest score is never shown instead of the latest.
import { formatReportDate, formatReportTime } from "./report-format";

export type ResultsTableAttempt = {
  score: number;
  maxScore: number;
  submittedAt: string;
  isCurrent: boolean;
};

export type ResultsTableParticipant = {
  displayName: string;
  studentId?: string | null;
  attempts: ResultsTableAttempt[];
};

export type ResultsTableRow = {
  no: string;
  studentId: string;
  name: string;
  score: string;
  date: string;
  time: string;
};

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

export function latestResultRows(participants: ResultsTableParticipant[]): ResultsTableRow[] {
  return participants.map((p, index) => {
    const base = {
      no: String(index + 1),
      // Historical participants have no ID. A dash is shown rather than an invented value.
      studentId: p.studentId ?? "-",
      name: p.displayName,
    };
    const current = p.attempts.find((a) => a.isCurrent);
    if (!current) {
      return { ...base, score: "Not submitted", date: "-", time: "-" };
    }
    return {
      ...base,
      score: `${num(current.score)} / ${num(current.maxScore)}`,
      date: formatReportDate(current.submittedAt),
      time: formatReportTime(current.submittedAt),
    };
  });
}
