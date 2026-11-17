// Results PDF rows (Stage 6) and report date/time formats. Pure: no database, no PDF library.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { latestResultRows } from "../../src/lib/results-table";
import { formatReportDate, formatReportTime } from "../../src/lib/report-format";

const attempt = (n: number, score: number, isCurrent: boolean, submittedAt: string) => ({
  attemptNumber: n, score, maxScore: 3, submittedAt, isCurrent,
});

describe("report date and time", () => {
  it("formats the date as MM/DD/YYYY with zero padding", () => {
    assert.equal(formatReportDate(new Date(2030, 0, 5, 9, 5).toISOString()), "01/05/2030");
  });
  it("formats the time separately, 12-hour clock", () => {
    assert.equal(formatReportTime(new Date(2030, 2, 1, 9, 5).toISOString()), "9:05 AM");
    assert.equal(formatReportTime(new Date(2030, 2, 1, 12, 30).toISOString()), "12:30 PM");
    assert.equal(formatReportTime(new Date(2030, 2, 1, 0, 0).toISOString()), "12:00 AM");
  });
});

describe("latestResultRows", () => {
  it("shows only the current attempt of a retake, never the sum or the average", () => {
    const rows = latestResultRows([
      {
        displayName: "Retake Kid",
        studentId: "2024-0007",
        attempts: [
          attempt(1, 0, false, new Date(2030, 2, 1, 9, 10).toISOString()),
          attempt(2, 3, true, new Date(2030, 2, 1, 9, 40).toISOString()),
        ],
      },
    ]);
    assert.equal(rows.length, 1, "one row per participant");
    assert.equal(rows[0].score, "3 / 3");
    assert.equal(rows[0].time, "9:40 AM");
    assert.equal(rows[0].studentId, "2024-0007");
  });

  it("keeps the latest accepted score even when an earlier attempt was higher", () => {
    // A retake is always the later attempt, and it is the current one, even if it scored less.
    const rows = latestResultRows([
      {
        displayName: "Dip",
        attempts: [
          attempt(1, 3, false, new Date(2030, 2, 1, 9, 0).toISOString()),
          attempt(2, 1, true, new Date(2030, 2, 1, 9, 30).toISOString()),
        ],
      },
    ]);
    assert.equal(rows[0].score, "1 / 3");
  });

  it("numbers rows and marks a participant with no submission", () => {
    const rows = latestResultRows([
      { displayName: "Ana", studentId: "001", attempts: [attempt(1, 2, true, new Date(2030, 0, 1, 8, 0).toISOString())] },
      { displayName: "Quiet", attempts: [] },
    ]);
    assert.deepEqual(rows.map((r) => r.no), ["1", "2"]);
    assert.equal(rows[0].studentId, "001", "leading zeroes are kept");
    assert.equal(rows[1].studentId, "-", "no invented ID for participants who have none");
    assert.equal(rows[1].score, "Not submitted");
    assert.equal(rows[1].date, "-");
  });
});
