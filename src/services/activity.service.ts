// Activity Builder business logic (Phase 3).
//
// Scope: create, edit, delete, draft, publish and unpublish activities together
// with their questions and choices. Publishing marks an activity as ready. It
// does NOT open a session, issue a session code, or accept students. That is
// Phase 4.
//
// Security rules applied here:
//  - every query is scoped to the authenticated instructor (classroom.instructorId)
//  - correct-answer flags are returned only by instructor-only functions
//  - a missing or foreign activity is reported as "not found"
//  - multi-table writes run inside a transaction so no half-saved activity is left behind
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import {
  publishProblems,
  validateSchedule,
  type FieldErrors,
} from "@/lib/activity-rules";
import type { ActivityInput } from "@/lib/builder-validation";
import type {
  ActivityDetailDto,
  ActivityStatusDto,
  ActivitySummaryDto,
  QuestionDto,
} from "@/lib/dto-types";

// ---- row shapes returned by Prisma (only the fields we select) -------------

type SummaryRow = {
  id: number;
  classroomId: number;
  title: string;
  status: ActivityStatusDto;
  publishedAt: Date | null;
  scheduledOpensAt: Date | null;
  scheduledClosesAt: Date | null;
  durationMinutes: number | null;
  maxAttempts: number;
  createdAt: Date;
  updatedAt: Date;
  classroom: { classroomName: string; archivedAt: Date | null };
  _count: { questions: number };
};

type DetailRow = Omit<SummaryRow, "_count"> & {
  instructions: string | null;
  _count: { questions: number; participants: number };
  questions: Array<{
    id: number;
    questionText: string;
    points: number;
    position: number;
    choices: Array<{ id: number; choiceText: string; isCorrect: boolean; position: number }>;
  }>;
};

const summaryInclude = {
  classroom: { select: { classroomName: true, archivedAt: true } },
  _count: { select: { questions: true } },
} as const;

const detailInclude = {
  classroom: { select: { classroomName: true, archivedAt: true } },
  questions: {
    orderBy: { position: "asc" },
    include: { choices: { orderBy: { position: "asc" } } },
  },
  _count: { select: { questions: true, participants: true } },
} as const;

const iso = (date: Date | null): string | null => (date ? date.toISOString() : null);

/** MySQL DATETIME(0) has whole-second precision. */
function toWholeSecond(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 1000) * 1000);
}

function toDate(value: string | null | undefined): Date | null {
  return value ? toWholeSecond(new Date(value)) : null;
}

export function toSummary(row: SummaryRow): ActivitySummaryDto {
  return {
    id: row.id,
    classroomId: row.classroomId,
    classroomName: row.classroom.classroomName,
    title: row.title,
    status: row.status,
    isPublished: row.publishedAt !== null,
    publishedAt: iso(row.publishedAt),
    opensAt: iso(row.scheduledOpensAt),
    closesAt: iso(row.scheduledClosesAt),
    durationMinutes: row.durationMinutes,
    maxAttempts: row.maxAttempts,
    questionCount: row._count.questions,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toDetail(row: DetailRow): ActivityDetailDto {
  const questions: QuestionDto[] = row.questions.map((q) => ({
    id: q.id,
    questionText: q.questionText,
    points: q.points,
    position: q.position,
    choices: q.choices.map((c) => ({
      id: c.id,
      choiceText: c.choiceText,
      isCorrect: c.isCorrect,
      position: c.position,
    })),
  }));
  return {
    ...toSummary({ ...row, _count: { questions: row.questions.length } }),
    instructions: row.instructions,
    participantCount: row._count.participants,
    questions,
  };
}

// ---- ownership helpers -----------------------------------------------------

const notFoundActivity = () => new AppError(404, "NOT_FOUND", "We could not find that activity.");

async function loadOwnedActivity(instructorId: number, id: number): Promise<DetailRow> {
  const row = await prisma.activity.findFirst({
    where: { id, classroom: { instructorId } },
    include: detailInclude,
  });
  if (!row) throw notFoundActivity();
  return row;
}

/** The classroom must belong to this instructor and must not be archived. */
async function assertUsableClassroom(
  db: Pick<typeof prisma, "classroom">,
  instructorId: number,
  classroomId: number,
): Promise<void> {
  const classroom = await db.classroom.findFirst({ where: { id: classroomId, instructorId } });
  if (!classroom) {
    throw new AppError(404, "NOT_FOUND", "We could not find that classroom.");
  }
  if (classroom.archivedAt) {
    throw new AppError(400, "VALIDATION_ERROR", "Choose an active classroom.", {
      fields: { classroomId: "This classroom is archived." },
    });
  }
}

/** Schedule validity is checked for drafts as well, so invalid dates never get saved. */
function assertScheduleValid(input: ActivityInput): void {
  const errors: FieldErrors = validateSchedule(
    toDate(input.opensAt),
    toDate(input.closesAt),
    input.durationMinutes ?? null,
  );
  if (Object.keys(errors).length > 0) {
    throw new AppError(400, "VALIDATION_ERROR", "Please correct the highlighted fields.", {
      fields: errors,
    });
  }
}

/** Nested create payload. Positions come from array order, never from the client. */
function questionCreateData(questions: ActivityInput["questions"]) {
  return questions.map((q, qi) => ({
    questionText: q.questionText,
    points: q.points,
    position: qi + 1,
    choices: {
      create: q.choices.map((c, ci) => ({
        choiceText: c.choiceText,
        isCorrect: c.isCorrect,
        position: ci + 1,
      })),
    },
  }));
}

// ---- public service API ----------------------------------------------------

export async function listActivities(
  instructorId: number,
  classroomId?: number,
): Promise<ActivitySummaryDto[]> {
  const rows = await prisma.activity.findMany({
    where: {
      classroom: { instructorId },
      ...(classroomId !== undefined ? { classroomId } : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    include: summaryInclude,
  });
  return rows.map(toSummary);
}

export async function getActivity(instructorId: number, id: number): Promise<ActivityDetailDto> {
  return toDetail(await loadOwnedActivity(instructorId, id));
}

export async function createActivity(
  instructorId: number,
  input: ActivityInput,
): Promise<ActivityDetailDto> {
  assertScheduleValid(input);
  await assertUsableClassroom(prisma, instructorId, input.classroomId);

  const created = await prisma.activity.create({
    data: {
      classroomId: input.classroomId,
      title: input.title,
      instructions: input.instructions,
      scheduledOpensAt: toDate(input.opensAt),
      scheduledClosesAt: toDate(input.closesAt),
      durationMinutes: input.durationMinutes ?? null,
      maxAttempts: input.maxAttempts,
      questions: { create: questionCreateData(input.questions) },
    },
    select: { id: true },
  });
  return getActivity(instructorId, created.id);
}

/**
 * Saves the whole activity (details, schedule and every question and choice)
 * in one transaction. Any change to a published activity returns it to draft,
 * so the instructor must validate and publish the new version again.
 * Refused once students have participated (guarded now, relevant in Phase 4).
 */
export async function updateActivity(
  instructorId: number,
  id: number,
  input: ActivityInput,
): Promise<{ activity: ActivityDetailDto; returnedToDraft: boolean }> {
  assertScheduleValid(input);

  const returnedToDraft = await prisma.$transaction(async (tx) => {
    const existing = await tx.activity.findFirst({
      where: { id, classroom: { instructorId } },
      include: { _count: { select: { participants: true } } },
    });
    if (!existing) throw notFoundActivity();
    if (existing._count.participants > 0) {
      throw new AppError(
        409,
        "ACTIVITY_IN_USE",
        "Students have already joined this activity, so its content can no longer be changed.",
      );
    }

    await assertUsableClassroom(tx, instructorId, input.classroomId);

    // Questions and choices are replaced wholesale. Choices are removed by the
    // database cascade. This avoids clashes with the unique position columns.
    await tx.question.deleteMany({ where: { activityId: id } });

    await tx.activity.update({
      where: { id },
      data: {
        classroomId: input.classroomId,
        title: input.title,
        instructions: input.instructions,
        scheduledOpensAt: toDate(input.opensAt),
        scheduledClosesAt: toDate(input.closesAt),
        durationMinutes: input.durationMinutes ?? null,
        maxAttempts: input.maxAttempts,
        publishedAt: null,
        questions: { create: questionCreateData(input.questions) },
      },
    });

    return existing.publishedAt !== null;
  });

  return { activity: await getActivity(instructorId, id), returnedToDraft };
}

export async function deleteActivity(instructorId: number, id: number): Promise<void> {
  const existing = await prisma.activity.findFirst({
    where: { id, classroom: { instructorId } },
    include: { _count: { select: { participants: true } } },
  });
  if (!existing) throw notFoundActivity();
  if (existing._count.participants > 0) {
    throw new AppError(
      409,
      "ACTIVITY_IN_USE",
      "This activity has student records and cannot be deleted.",
    );
  }
  await prisma.activity.delete({ where: { id } });
}

/**
 * Validates everything in activity-rules.publishProblems against the stored
 * data and the server clock. `now` is a parameter only so tests can be exact.
 */
export async function publishActivity(
  instructorId: number,
  id: number,
  now: Date = new Date(),
): Promise<ActivityDetailDto> {
  const row = await loadOwnedActivity(instructorId, id);
  if (row.publishedAt) return toDetail(row);

  const problems = publishProblems({
    title: row.title,
    classroomArchived: row.classroom.archivedAt !== null,
    opensAt: row.scheduledOpensAt,
    closesAt: row.scheduledClosesAt,
    durationMinutes: row.durationMinutes,
    questions: row.questions.map((q) => ({
      questionText: q.questionText,
      points: q.points,
      choices: q.choices.map((c) => ({ choiceText: c.choiceText, isCorrect: c.isCorrect })),
    })),
    now,
  });

  if (Object.keys(problems).length > 0) {
    throw new AppError(
      400,
      "PUBLISH_BLOCKED",
      "This activity is not ready to publish yet. Fix the highlighted items.",
      { fields: problems },
    );
  }

  await prisma.activity.update({ where: { id }, data: { publishedAt: toWholeSecond(now) } });
  return getActivity(instructorId, id);
}

export async function unpublishActivity(instructorId: number, id: number): Promise<ActivityDetailDto> {
  await loadOwnedActivity(instructorId, id);
  await prisma.activity.update({ where: { id }, data: { publishedAt: null } });
  return getActivity(instructorId, id);
}

export async function getDashboardStats(instructorId: number) {
  const [classrooms, activities, published, recent] = await Promise.all([
    prisma.classroom.count({ where: { instructorId, archivedAt: null } }),
    prisma.activity.count({ where: { classroom: { instructorId } } }),
    prisma.activity.count({
      where: { classroom: { instructorId }, publishedAt: { not: null } },
    }),
    prisma.activity.findMany({
      where: { classroom: { instructorId } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 5,
      include: summaryInclude,
    }),
  ]);

  return {
    classrooms,
    activities,
    published,
    drafts: activities - published,
    recent: recent.map(toSummary),
  };
}
