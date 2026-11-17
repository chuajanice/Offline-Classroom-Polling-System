// Builds the question paper and answer key for one activity (Stage 5). Instructor only.
// The answer key is never returned by any student-facing endpoint.
import { prisma } from "@/lib/prisma";
import { buildQuestionPaper } from "@/lib/question-paper-model";
import { renderQuestionPaper } from "@/lib/question-paper-pdf";
import { getActivity } from "./activity.service";

export async function generateQuestionPaper(
  instructorId: number,
  activityId: number,
  now: Date = new Date(),
): Promise<{ filename: string; bytes: Uint8Array }> {
  // Ownership and not-found handling come from the standard activity lookup.
  await getActivity(instructorId, activityId);

  const [activity, instructor] = await Promise.all([
    prisma.activity.findFirstOrThrow({
      where: { id: activityId },
      select: {
        title: true,
        classroom: { select: { classroomName: true } },
        questions: {
          orderBy: { position: "asc" },
          select: {
            questionText: true,
            points: true,
            choices: { orderBy: { position: "asc" }, select: { choiceText: true, isCorrect: true } },
          },
        },
      },
    }),
    prisma.instructor.findUniqueOrThrow({ where: { id: instructorId }, select: { fullName: true } }),
  ]);

  const model = buildQuestionPaper({
    activityTitle: activity.title,
    classroomName: activity.classroom.classroomName,
    instructorName: instructor.fullName,
    generatedAt: now.toISOString(),
    questions: activity.questions,
  });

  return {
    filename: `question-paper-${activityId}.pdf`,
    bytes: await renderQuestionPaper(model),
  };
}
