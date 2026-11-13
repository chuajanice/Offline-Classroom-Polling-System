// PDF results reports (Phase 5), built with pdf-lib.
//
// Layout rules:
//  - A4, black text, thin grey rules, no colour fills: prints cleanly in greyscale.
//  - The table header repeats on every page. Rows are never split across pages.
//  - Standard Helvetica is used (no font file to ship). Characters Helvetica cannot
//    encode are transliterated where possible, otherwise replaced with "?", so a
//    single unusual name cannot stop a report from being produced.
//  - The report contains results only. It never contains question text or the answer key.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export const SYSTEM_TITLE = "Offline Classroom Polling System";

export type ReportAttempt = {
  attemptNumber: number;
  score: number;
  maxScore: number;
  percentage: number;
  submittedAt: string;
  isCurrent: boolean;
};

export type ReportParticipant = {
  displayName: string;
  statusLabel: string;
  attempts: ReportAttempt[];
};

export type ActivityReportData = {
  systemTitle: string;
  instructorName: string;
  classroomName: string;
  activityTitle: string;
  /** Human-readable date the activity opened (or was scheduled to open). */
  activityDate: string;
  openedAt: string | null;
  closedAt: string | null;
  attemptsAllowed: number;
  questionCount: number;
  maxScore: number;
  totalParticipants: number;
  totalSubmissions: number;
  averageFirstAttempt: number | null;
  averageCurrent: number | null;
  generatedAt: string;
  participants: ReportParticipant[];
};

// ---- layout constants (points) ---------------------------------------------

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const ROW_HEIGHT = 16;
const HEADER_HEIGHT = 18;
const FOOTER_Y = 28;

const COLUMNS = [
  { key: "name", title: "Student name", width: 150 },
  { key: "status", title: "Status", width: 96 },
  { key: "attempt", title: "Attempt", width: 56 },
  { key: "score", title: "Score", width: 62 },
  { key: "percent", title: "Percent", width: 54 },
  { key: "submitted", title: "Submitted", width: 81 },
] as const;

// ---- text helpers ----------------------------------------------------------

/** Keeps only characters the standard font can encode. Accents are folded to their base letter. */
export function toPrintable(text: string, font: PDFFont, cache = new Map<string, boolean>()): string {
  const encodable = (ch: string) => {
    const known = cache.get(ch);
    if (known !== undefined) return known;
    let ok = true;
    try {
      font.encodeText(ch);
    } catch {
      ok = false;
    }
    cache.set(ch, ok);
    return ok;
  };

  let out = "";
  for (const ch of text.normalize("NFC")) {
    if (encodable(ch)) {
      out += ch;
      continue;
    }
    const folded = ch.normalize("NFKD").replace(/\p{M}/gu, "");
    out += [...folded].every(encodable) && folded.length > 0 ? folded : "?";
  }
  return out;
}

/** Cuts text to fit a width, adding an ellipsis when it is too long. */
export function fitText(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 0 && font.widthOfTextAtSize(`${cut}…`, size) > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return cut.length > 0 ? `${cut.trimEnd()}...` : "";
}

/** Whole numbers print without decimals; other scores print with two. */
export function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

// ---- rendering -------------------------------------------------------------

export async function renderActivityReport(data: ActivityReportData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${data.activityTitle} - results`);
  pdf.setAuthor(data.systemTitle);
  pdf.setSubject("Activity results report");
  pdf.setCreator(data.systemTitle);
  pdf.setProducer(data.systemTitle);

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const cache = new Map<string, boolean>();
  const t = (s: string) => toPrintable(s, regular, cache);
  /** Sanitise first, then truncate: the width must be measured on characters the font can draw. */
  const fit = (value: string, size: number, width: number) => fitText(t(value), regular, size, width);

  const pages: PDFPage[] = [];
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  pages.push(page);
  let y = PAGE_HEIGHT - MARGIN;

  const text = (value: string, x: number, yy: number, size = 10, font = regular) =>
    page.drawText(t(value), { x, y: yy, size, font, color: rgb(0, 0, 0) });

  // -- title and details
  text(data.systemTitle, MARGIN, y - 14, 16, bold);
  text("Activity results report", MARGIN, y - 32, 11, regular);
  y -= 52;

  const details: Array<[string, string]> = [
    ["Instructor", data.instructorName],
    ["Classroom", data.classroomName],
    ["Activity", data.activityTitle],
    ["Activity date", data.activityDate],
    ["Opened", data.openedAt ? formatDate(data.openedAt) : "Not opened"],
    ["Closed", data.closedAt ? formatDate(data.closedAt) : "Not closed"],
    ["Attempts allowed", String(data.attemptsAllowed)],
    ["Questions", `${data.questionCount} (maximum score ${formatNumber(data.maxScore)})`],
  ];
  for (const [label, value] of details) {
    text(`${label}:`, MARGIN, y, 10, bold);
    text(fit(value, 10, CONTENT_WIDTH - 110), MARGIN + 110, y, 10, regular);
    y -= 15;
  }
  y -= 8;

  // -- summary
  text("Summary", MARGIN, y, 12, bold);
  y -= 6;
  rule(page, y);
  y -= 16;
  const summary: Array<[string, string]> = [
    ["Total participants", String(data.totalParticipants)],
    ["Total submissions", String(data.totalSubmissions)],
    ["Average of first attempts", data.averageFirstAttempt === null ? "No submissions yet" : `${formatNumber(data.averageFirstAttempt)}%`],
    ["Average of current results", data.averageCurrent === null ? "No submissions yet" : `${formatNumber(data.averageCurrent)}%`],
  ];
  for (const [label, value] of summary) {
    text(`${label}:`, MARGIN, y, 10, bold);
    text(value, MARGIN + 170, y, 10, regular);
    y -= 15;
  }
  y -= 10;

  // -- results table
  text("Results", MARGIN, y, 12, bold);
  y -= 10;

  const drawHeader = () => {
    rule(page, y);
    let x = MARGIN;
    for (const col of COLUMNS) {
      text(col.title, x + 4, y - 12, 9, bold);
      x += col.width;
    }
    y -= HEADER_HEIGHT;
    rule(page, y);
  };
  drawHeader();

  const newPage = () => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(page);
    y = PAGE_HEIGHT - MARGIN;
    drawHeader();
  };

  const rowFor = (cells: Record<(typeof COLUMNS)[number]["key"], string>) => {
    if (y - ROW_HEIGHT < MARGIN + 24) newPage();
    let x = MARGIN;
    for (const col of COLUMNS) {
      text(fit(cells[col.key], 9, col.width - 8), x + 4, y - 11, 9, regular);
      x += col.width;
    }
    y -= ROW_HEIGHT;
    rule(page, y, 0.4);
  };

  if (data.participants.length === 0) {
    rowFor({ name: "No students have joined", status: "", attempt: "", score: "", percent: "", submitted: "" });
  }

  for (const participant of data.participants) {
    const name = participant.displayName;
    if (participant.attempts.length === 0) {
      rowFor({ name, status: participant.statusLabel, attempt: "-", score: "-", percent: "-", submitted: "Not submitted" });
      continue;
    }
    participant.attempts.forEach((a, index) => {
      rowFor({
        name: index === 0 ? name : "",
        status: index === 0 ? participant.statusLabel : "",
        attempt: a.isCurrent ? `${a.attemptNumber} (current)` : String(a.attemptNumber),
        score: `${formatNumber(a.score)} / ${formatNumber(a.maxScore)}`,
        percent: `${formatNumber(a.percentage)}%`,
        submitted: formatDate(a.submittedAt),
      });
    });
  }

  // -- footers
  pages.forEach((p, i) => {
    p.drawText(t(`Generated ${formatDate(data.generatedAt)}`), { x: MARGIN, y: FOOTER_Y, size: 8, font: regular, color: rgb(0.2, 0.2, 0.2) });
    const label = `Page ${i + 1} of ${pages.length}`;
    p.drawText(label, {
      x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(label, 8),
      y: FOOTER_Y,
      size: 8,
      font: regular,
      color: rgb(0.2, 0.2, 0.2),
    });
  });

  return pdf.save();
}

function rule(page: PDFPage, y: number, thickness = 0.8) {
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness,
    color: rgb(0.55, 0.55, 0.55),
  });
}

/** Dates are shown in the server's local time zone, which is the instructor's own computer. */
export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
