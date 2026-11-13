import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { fitText, formatNumber, renderActivityReport, toPrintable, type ActivityReportData, type ReportParticipant } from "../../src/lib/pdf";
import { reportFilename } from "../../src/services/report.service";
import { extractPdfText, isPdf } from "../helpers/pdf-text";

function sampleData(participants: ReportParticipant[]): ActivityReportData {
  return {
    systemTitle: "Offline Classroom Polling System",
    instructorName: "Ana Teacher",
    classroomName: "BSIT 3A",
    activityTitle: "Quiz 1: Networks",
    activityDate: "Mar 1, 2030, 8:00 AM",
    openedAt: "2030-03-01T00:00:00Z",
    closedAt: "2030-03-01T01:00:00Z",
    attemptsAllowed: 2,
    questionCount: 2,
    maxScore: 3,
    totalParticipants: participants.length,
    totalSubmissions: participants.reduce((n, p) => n + p.attempts.length, 0),
    averageFirstAttempt: 66.67,
    averageCurrent: 66.67,
    generatedAt: "2030-03-01T02:00:00Z",
    participants,
  };
}

const oneAttempt = (name: string): ReportParticipant => ({
  displayName: name,
  statusLabel: "Submitted",
  attempts: [{ attemptNumber: 1, score: 2, maxScore: 3, percentage: 66.67, submittedAt: "2030-03-01T00:20:00Z", isCurrent: true }],
});

describe("PDF rendering", () => {
  it("produces a valid PDF that pdf-lib can read back", async () => {
    const bytes = await renderActivityReport(sampleData([oneAttempt("Ana Santos")]));
    assert.ok(isPdf(bytes));
    const doc = await PDFDocument.load(bytes);
    assert.ok(doc.getPageCount() >= 1);
    assert.equal(doc.getTitle(), "Quiz 1: Networks - results");
  });

  it("contains the required report fields, read back from the document", async () => {
    const text = extractPdfText(await renderActivityReport(sampleData([oneAttempt("Ana Santos")])));
    for (const expected of [
      "Offline Classroom Polling System",
      "Ana Teacher",
      "BSIT 3A",
      "Quiz 1: Networks",
      "Total participants",
      "Total submissions",
      "Ana Santos",
      "Submitted",
      "2 / 3",
      "66.67%",
    ]) {
      assert.ok(text.includes(expected), `missing: ${expected}`);
    }
  });

  it("lists a participant with no submission as Not submitted", async () => {
    const text = extractPdfText(
      await renderActivityReport(
        sampleData([{ displayName: "Quiet Student", statusLabel: "Not submitted", attempts: [] }]),
      ),
    );
    assert.ok(text.includes("Quiet Student"));
    assert.ok(text.includes("Not submitted"));
  });

  it("shows both attempts of a retake, marking the current one", async () => {
    const retake: ReportParticipant = {
      displayName: "Retake Kid",
      statusLabel: "Retake submitted",
      attempts: [
        { attemptNumber: 1, score: 0, maxScore: 3, percentage: 0, submittedAt: "2030-03-01T00:10:00Z", isCurrent: false },
        { attemptNumber: 2, score: 3, maxScore: 3, percentage: 100, submittedAt: "2030-03-01T00:40:00Z", isCurrent: true },
      ],
    };
    const text = extractPdfText(await renderActivityReport(sampleData([retake])));
    assert.ok(text.includes("2 (current)"));
    assert.ok(text.includes("100%"));
    assert.ok(text.includes("0%"));
    assert.equal(text.split("Retake Kid").length - 1, 1, "the name appears once, on the first row");
  });

  it("never contains question text or the answer key", async () => {
    // The report data has no question or choice fields at all; this guards against that changing.
    const text = extractPdfText(await renderActivityReport(sampleData([oneAttempt("Ana Santos")])));
    assert.ok(!text.includes("Capital of France"));
    assert.ok(!text.toLowerCase().includes("correct answer"));
  });

  it("repeats the table header across pages and paginates long reports", async () => {
    const many = Array.from({ length: 120 }, (_, i) => oneAttempt(`Student ${i + 1}`));
    const bytes = await renderActivityReport(sampleData(many));
    const doc = await PDFDocument.load(bytes);
    assert.ok(doc.getPageCount() > 1, "120 rows need more than one page");
    const text = extractPdfText(bytes);
    assert.equal(text.split("Student name").length - 1, doc.getPageCount(), "header on every page");
    assert.ok(text.includes(`Page ${doc.getPageCount()} of ${doc.getPageCount()}`));
  });

  it("renders an empty activity without failing", async () => {
    const empty = { ...sampleData([]), averageFirstAttempt: null, averageCurrent: null };
    const text = extractPdfText(await renderActivityReport(empty));
    assert.ok(text.includes("No students have joined"));
    assert.ok(text.includes("No submissions yet"));
  });

  it("does not fail on characters Helvetica cannot draw; names remain readable", async () => {
    const text = extractPdfText(await renderActivityReport(sampleData([oneAttempt("Núñez 中文 Ő")])));
    assert.ok(text.includes("Núñez"), "accented Latin letters are kept");
    assert.ok(text.includes("?"), "unsupported characters are replaced, not dropped silently");
  });
});

describe("text helpers", () => {
  it("toPrintable keeps encodable characters and folds accents", async () => {
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    assert.equal(toPrintable("José ñ", font), "José ñ");
    assert.equal(toPrintable("Ő", font), "O");
    assert.equal(toPrintable("中", font), "?");
  });

  it("fitText shortens long text with an ellipsis and leaves short text alone", async () => {
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    assert.equal(fitText("Short", font, 10, 200), "Short");
    const cut = fitText("An extremely long student name that will not fit", font, 10, 60);
    assert.ok(cut.endsWith("..."));
    assert.ok(font.widthOfTextAtSize(cut, 10) <= 60);
  });

  it("formatNumber prints whole numbers without decimals", () => {
    assert.equal(formatNumber(3), "3");
    assert.equal(formatNumber(2.5), "2.50");
    assert.equal(formatNumber(66.67), "66.67");
  });

  it("reportFilename is ASCII, safe, and keeps the activity id", () => {
    assert.equal(reportFilename("Quiz 1: Networks & Routing!", 42), "results-quiz-1-networks-routing-42.pdf");
    assert.equal(reportFilename("Pagsusulit Ñ 中", 7), "results-pagsusulit-n-7.pdf");
    assert.equal(reportFilename("!!!", 3), "results-activity-3.pdf");
  });
});
