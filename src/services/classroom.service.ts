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

const withCount = { _count: { select: { activities: true } } } as const;

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

/**
 * "Delete" for classrooms. Classrooms are archived, never hard-deleted, because
 * activities and their history reference them (see the schema notes). Archived
 * classrooms keep their activities but disappear from the active list and can
 * no longer receive new activities.
 */
export async function archiveClassroom(instructorId: number, id: number): Promise<ClassroomDto> {
  const existing = await findOwned(instructorId, id);
  const row = await prisma.classroom.update({
    where: { id },
    data: { archivedAt: existing.archivedAt ?? new Date() },
    include: withCount,
  });
  return toClassroomDto(row);
}
