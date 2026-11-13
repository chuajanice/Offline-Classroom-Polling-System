// Instructor lifecycle actions for activities (Phase 4, Stage B):
// open (issues the session code), close, archive, restore.
//
// Every query is scoped to the authenticated instructor. The database
// constraints (lifecycle CHECK, unique session code, archived-not-open CHECK)
// are the final guard; these checks give clear error messages first.
import { prisma } from "@/lib/prisma";
import { AppError, isUniqueViolation } from "@/lib/errors";
import { publishProblems } from "@/lib/activity-rules";
import { generateSessionCode } from "@/lib/session-code";
import type { ActivityDetailDto } from "@/lib/dto-types";
import { getActivity } from "./activity.service";

const notFound = () => new AppError(404, "NOT_FOUND", "We could not find that activity.");
const MAX_CODE_ATTEMPTS = 5;

/** MySQL DATETIME(0) has whole-second precision. */
const wholeSecond = (d: Date) => new Date(Math.floor(d.getTime() / 1000) * 1000);

async function findOwnedWithContent(instructorId: number, id: number) {
  const row = await prisma.activity.findFirst({
    where: { id, classroom: { instructorId } },
    include: {
      classroom: { select: { archivedAt: true } },
      questions: {
        orderBy: { position: "asc" },
        include: { choices: { orderBy: { position: "asc" } } },
      },
    },
  });
  if (!row) throw notFound();
  return row;
}

/**
 * Opens an activity for students. Generates the session code, sets opened_at,
 * and changes status to OPEN in one conditional update. Publish rules are
 * re-checked here, because the server (not the browser) decides what students
 * will be able to answer.
 */
export async function openActivity(
  instructorId: number,
  id: number,
  now: Date = new Date(),
): Promise<ActivityDetailDto> {
  const row = await findOwnedWithContent(instructorId, id);

  if (row.archivedAt) {
    throw new AppError(409, "ACTIVITY_ARCHIVED", "Restore this activity before opening it.");
  }
  if (row.status === "OPEN") {
    throw new AppError(409, "ALREADY_OPEN", "This activity is already open.");
  }
  if (row.status === "CLOSED") {
    throw new AppError(409, "ACTIVITY_CLOSED", "This activity has closed and cannot be reopened.");
  }
  if (row.classroom.archivedAt) {
    throw new AppError(409, "CLASSROOM_ARCHIVED", "Restore the classroom before opening its activities.");
  }
  if (!row.publishedAt) {
    throw new AppError(409, "NOT_PUBLISHED", "Publish the activity before opening it.");
  }

  const problems = publishProblems({
    title: row.title,
    classroomArchived: false,
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
    throw new AppError(400, "OPEN_BLOCKED", "This activity cannot be opened yet. Fix the highlighted items.", {
      fields: problems,
    });
  }

  for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt++) {
    try {
      const result = await prisma.activity.updateMany({
        where: { id, status: "DRAFT", archivedAt: null },
        data: { status: "OPEN", sessionCode: generateSessionCode(), openedAt: wholeSecond(now) },
      });
      if (result.count !== 1) {
        throw new AppError(409, "STATE_CHANGED", "The activity changed while it was being opened. Refresh and try again.");
      }
      return getActivity(instructorId, id);
    } catch (error) {
      // A code collision is astronomically rare (31^8 codes), but the unique index is the guarantee.
      if (isUniqueViolation(error) && attempt < MAX_CODE_ATTEMPTS) continue;
      throw error;
    }
  }
  throw new AppError(500, "INTERNAL_ERROR", "Could not create a session code. Please try again.");
}

/** Closes an open activity. Closing an already closed activity is a harmless no-op. */
export async function closeActivity(
  instructorId: number,
  id: number,
  now: Date = new Date(),
): Promise<ActivityDetailDto> {
  const row = await prisma.activity.findFirst({
    where: { id, classroom: { instructorId } },
    select: { id: true, status: true },
  });
  if (!row) throw notFound();
  if (row.status === "CLOSED") return getActivity(instructorId, id);
  if (row.status !== "OPEN") {
    throw new AppError(409, "NOT_OPEN", "Only an open activity can be closed.");
  }
  await prisma.activity.updateMany({
    where: { id, status: "OPEN" },
    data: { status: "CLOSED", closedAt: wholeSecond(now) },
  });
  return getActivity(instructorId, id);
}

/**
 * Archives an activity. An OPEN activity is closed first, in the same
 * transaction, so no session stays live while the activity is archived.
 * Questions, choices, schedules, submissions and participants are all kept.
 */
export async function archiveActivity(
  instructorId: number,
  id: number,
  now: Date = new Date(),
): Promise<ActivityDetailDto> {
  await prisma.$transaction(async (tx) => {
    const row = await tx.activity.findFirst({
      where: { id, classroom: { instructorId } },
      select: { id: true, status: true, archivedAt: true },
    });
    if (!row) throw notFound();
    if (row.archivedAt) return; // already archived

    if (row.status === "OPEN") {
      await tx.activity.updateMany({
        where: { id, status: "OPEN" },
        data: { status: "CLOSED", closedAt: wholeSecond(now) },
      });
    }
    await tx.activity.updateMany({
      where: { id, archivedAt: null },
      data: { archivedAt: wholeSecond(now) },
    });
  });
  return getActivity(instructorId, id);
}

/** Restores an archived activity. Its status is unchanged (a closed activity stays closed). */
export async function restoreActivity(instructorId: number, id: number): Promise<ActivityDetailDto> {
  const row = await prisma.activity.findFirst({
    where: { id, classroom: { instructorId } },
    select: { id: true },
  });
  if (!row) throw notFound();
  await prisma.activity.updateMany({
    where: { id, archivedAt: { not: null } },
    data: { archivedAt: null },
  });
  return getActivity(instructorId, id);
}
