// Classroom business logic. Every function takes the instructorId that came
// from the server-side session (never from the request body) and scopes its
// queries to that instructor. A classroom owned by someone else is reported as
// "not found", so the existence of other instructors' data is not revealed.
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { ClassroomDto } from "@/lib/dto-types";
import type { ClassroomInput, ClassroomUpdate } from "@/lib/builder-validation";

type ClassroomRow = {
  id: number;
  classroomName: string;
  description: string | null;
  createdAt: Date;
  archivedAt: Date | null;
  _count: { activities: number };
};

// Phase 6: the card count is the number of ACTIVE activities. Archived activities
// keep their history but are not counted as current work.
const withCount = { _count: { select: { activities: { where: { archivedAt: null } } } } } as const;

export function toClassroomDto(row: ClassroomRow): ClassroomDto {
  return {
    id: row.id,
    classroomName: row.classroomName,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    activityCount: row._count.activities,
  };
}

const notFound = () => new AppError(404, "NOT_FOUND", "We could not find that classroom.");

async function findOwned(instructorId: number, id: number): Promise<ClassroomRow> {
  const row = await prisma.classroom.findFirst({
    where: { id, instructorId },
    include: withCount,
  });
  if (!row) throw notFound();
  return row;
}

/** Active (non-archived) classrooms of this instructor, alphabetical. */
export async function listClassrooms(instructorId: number): Promise<ClassroomDto[]> {
  const rows = await prisma.classroom.findMany({
    where: { instructorId, archivedAt: null },
    orderBy: [{ classroomName: "asc" }, { id: "asc" }],
    include: withCount,
  });
  return rows.map(toClassroomDto);
}

export async function getClassroom(instructorId: number, id: number): Promise<ClassroomDto> {
  return toClassroomDto(await findOwned(instructorId, id));
}

export async function createClassroom(instructorId: number, input: ClassroomInput): Promise<ClassroomDto> {
  const row = await prisma.classroom.create({
    data: {
      instructorId,
      classroomName: input.classroomName,
      description: input.description,
    },
    include: withCount,
  });
  return toClassroomDto(row);
}

export async function updateClassroom(
  instructorId: number,
  id: number,
  patch: ClassroomUpdate,
): Promise<ClassroomDto> {
  const existing = await findOwned(instructorId, id);
  if (existing.archivedAt) {
    throw new AppError(409, "CLASSROOM_ARCHIVED", "Archived classrooms cannot be changed.");
  }
  const row = await prisma.classroom.update({
    where: { id },
    data: {
      classroomName: patch.classroomName ?? existing.classroomName,
      description: patch.description !== undefined ? patch.description : existing.description,
    },
    include: withCount,
  });
  return toClassroomDto(row);
}

/** Archived classrooms, most recently archived first. */
export async function listArchivedClassrooms(instructorId: number): Promise<ClassroomDto[]> {
  const rows = await prisma.classroom.findMany({
    where: { instructorId, archivedAt: { not: null } },
    orderBy: [{ archivedAt: "desc" }, { id: "desc" }],
    include: withCount,
  });
  return rows.map(toClassroomDto);
}

/**
 * Archives a classroom. Classrooms are never hard-deleted, because activities
 * and their history reference them. Any OPEN activity in the classroom is
 * closed in the same transaction, so no students can keep joining a hidden
 * classroom. Activities are kept and can be reached again after a restore.
 */
export async function archiveClassroom(instructorId: number, id: number, now: Date = new Date()): Promise<ClassroomDto> {
  const wholeSecond = new Date(Math.floor(now.getTime() / 1000) * 1000);
  const row = await prisma.$transaction(async (tx) => {
    const existing = await tx.classroom.findFirst({ where: { id, instructorId }, select: { id: true, archivedAt: true } });
    if (!existing) throw new AppError(404, "NOT_FOUND", "We could not find that classroom.");
    if (!existing.archivedAt) {
      await tx.activity.updateMany({
        where: { classroomId: id, status: "OPEN" },
        data: { status: "CLOSED", closedAt: wholeSecond },
      });
      await tx.classroom.update({ where: { id }, data: { archivedAt: wholeSecond } });
    }
    return tx.classroom.findFirstOrThrow({ where: { id }, include: withCount });
  });
  return toClassroomDto(row);
}

/** Restores an archived classroom. Its activities are not reopened automatically. */
export async function restoreClassroom(instructorId: number, id: number): Promise<ClassroomDto> {
  await findOwned(instructorId, id);
  const row = await prisma.classroom.update({
    where: { id },
    data: { archivedAt: null },
    include: withCount,
  });
  return toClassroomDto(row);
}
