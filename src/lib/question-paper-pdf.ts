// Question paper PDF (Stage 5), built with pdf-lib.
//
// Layout rules: A4, black text, thin rules, no colour fills. Standard Helvetica (no font file, so
// it works offline). A question and its choices are never split across pages. The answer key is
// on its own final page. Every page has a header and a "Page x of y" footer.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { fitText, SYSTEM_TITLE, toPrintable } from "./pdf";
import type { QuestionPaperModel } from "./question-paper-model";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM = MARGIN + 30;
const GAP = 4;

type Style = { size: number; font: PDFFont; indent: number };
type Line = { text: string; style: Style };

/** Greedy word wrap. Single words wider than the column are shortened with an ellipsis. */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const piece = font.widthOfTextAtSize(word, size) > maxWidth ? fitText(word, font, size, maxWidth) : word;
      const candidate = line ? `${line} ${piece}` : piece;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        if (line) out.push(line);
        line = piece;
      }
    }
    out.push(line);
  }
  return out;
}

export async function renderQuestionPaper(model: QuestionPaperModel): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${model.activityTitle} - question paper`);
  pdf.setAuthor(SYSTEM_TITLE);
  pdf.setSubject("Question paper and answer key");
  pdf.setCreator(model.productName);
  pdf.setProducer(model.productName);

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const cache = new Map<string, boolean>();
  const t = (s: string) => toPrintable(s, regular, cache);

  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;

  const drawText = (value: string, x: number, yy: number, size: number, font: PDFFont) =>
    page.drawText(t(value), { x, y: yy, size, font, color: rgb(0, 0, 0) });

  const rule = (yy: number) =>
    page.drawLine({ start: { x: MARGIN, y: yy }, end: { x: PAGE_WIDTH - MARGIN, y: yy }, thickness: 0.8, color: rgb(0.55, 0.55, 0.55) });

  const newPage = () => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(page);
    drawText(model.productName, MARGIN, PAGE_HEIGHT - MARGIN, 11, bold);
    drawText(SYSTEM_TITLE, MARGIN + 62, PAGE_HEIGHT - MARGIN, 8, regular);
    rule(PAGE_HEIGHT - MARGIN - 8);
    y = PAGE_HEIGHT - MARGIN - 26;
  };

  /** Starts a new page first if the block would not fit, so a question never splits. */
  const ensure = (height: number) => {
    if (y - height < BOTTOM) newPage();
  };

  const linesHeight = (lines: Line[]) => lines.reduce((sum, l) => sum + l.style.size + GAP, 0);
  const drawLines = (lines: Line[]) => {
    for (const line of lines) {
      drawText(line.text, MARGIN + line.style.indent, y - line.style.size, line.style.size, line.style.font);
      y -= line.style.size + GAP;
    }
  };
  const linesFor = (text: string, style: Style): Line[] =>
    wrapText(t(text), style.font, style.size, CONTENT_WIDTH - style.indent).map((line) => ({ text: line, style }));

  const TITLE: Style = { size: 16, font: bold, indent: 0 };
  const SUB: Style = { size: 12, font: bold, indent: 0 };
  const BODY: Style = { size: 10, font: regular, indent: 0 };
  const QUESTION: Style = { size: 11, font: bold, indent: 0 };
  const CHOICE: Style = { size: 10, font: regular, indent: 22 };
  const POINTS: Style = { size: 9, font: regular, indent: 0 };

  // -- question paper, first page
  newPage();
  const titleLines = [
    ...linesFor("Question paper", TITLE),
    ...linesFor(model.activityTitle, SUB),
    ...linesFor(`Classroom: ${model.classroomName}`, BODY),
    ...linesFor(`Instructor: ${model.instructorName}`, BODY),
    ...linesFor(`Generated: ${model.generated}`, BODY),
  ];
  drawLines(titleLines);
  y -= 6;
  rule(y);
  y -= 16;

  for (const q of model.questions) {
    const block: Line[] = [
      ...linesFor(`${q.number}. ${q.text}`, QUESTION),
      ...linesFor(`${q.points} ${q.points === 1 ? "point" : "points"}`, POINTS),
      ...q.choices.flatMap((c) => linesFor(`${c.letter}.  ${c.text}`, CHOICE)),
    ];
    ensure(linesHeight(block) + 14);
    drawLines(block);
    y -= 14;
  }

  // -- answer key, separate final page
  newPage();
  drawLines([
    ...linesFor("ANSWER KEY", TITLE),
    ...linesFor(model.activityTitle, SUB),
    ...linesFor("For the instructor only. Do not give this page to students.", POINTS),
  ]);
  y -= 6;
  rule(y);
  y -= 16;
  for (const k of model.answerKey) {
    const answer = k.letter === null ? "No correct answer is set" : `${k.letter}.  ${k.text}`;
    const block = [
      ...linesFor(`Question ${k.number}`, QUESTION),
      ...linesFor(answer, CHOICE),
    ];
    ensure(linesHeight(block) + 10);
    drawLines(block);
    y -= 10;
  }

  // -- footers
  pages.forEach((p, i) => {
    const label = `Page ${i + 1} of ${pages.length}`;
    p.drawText(t(label), {
      x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(label, 8),
      y: 28,
      size: 8,
      font: regular,
      color: rgb(0.2, 0.2, 0.2),
    });
  });

  return pdf.save();
}
