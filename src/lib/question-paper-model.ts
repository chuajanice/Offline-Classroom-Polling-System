// Question paper and answer key (Stage 5). Pure data model: no PDF library, unit-tested directly.
//
// Choice labels are assigned by display position (A, B, C, ...). The same order is used on the
// paper, in the answer key, and by the student screen, because all three read the same
// position-sorted list.
import { formatReportDate, formatReportTime } from "./report-format";

export const PRODUCT_NAME = "Pollify";

export type QuestionPaperInput = {
  activityTitle: string;
  classroomName: string;
  instructorName: string;
  generatedAt: string;
  questions: Array<{
    questionText: string;
    points: number;
    choices: Array<{ choiceText: string; isCorrect: boolean }>;
  }>;
};

export type QuestionPaperModel = {
  productName: string;
  activityTitle: string;
  classroomName: string;
  instructorName: string;
  generated: string;
  questions: Array<{
    number: number;
    text: string;
    points: number;
    choices: Array<{ letter: string; text: string }>;
  }>;
  /** Shown only on the separate answer-key page. Never sent to students. */
  answerKey: Array<{ number: number; letter: string | null; text: string | null }>;
};

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function choiceLetter(index: number): string {
  return index < LETTERS.length ? LETTERS[index] : String(index + 1);
}

export function buildQuestionPaper(input: QuestionPaperInput): QuestionPaperModel {
  const questions = input.questions.map((q, qi) => ({
    number: qi + 1,
    text: q.questionText,
    points: q.points,
    choices: q.choices.map((c, ci) => ({ letter: choiceLetter(ci), text: c.choiceText })),
  }));

  const answerKey = input.questions.map((q, qi) => {
    const correctIndex = q.choices.findIndex((c) => c.isCorrect);
    if (correctIndex === -1) return { number: qi + 1, letter: null, text: null };
    return {
      number: qi + 1,
      letter: choiceLetter(correctIndex),
      text: q.choices[correctIndex].choiceText,
    };
  });

  const generatedAt = new Date(input.generatedAt);
  return {
    productName: PRODUCT_NAME,
    activityTitle: input.activityTitle,
    classroomName: input.classroomName,
    instructorName: input.instructorName,
    generated: `${formatReportDate(input.generatedAt)} ${formatReportTime(generatedAt.toISOString())}`,
    questions,
    answerKey,
  };
}
