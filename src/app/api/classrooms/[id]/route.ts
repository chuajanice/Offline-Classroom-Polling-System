// GET    /api/classrooms/:id  -> one classroom you own
// PATCH  /api/classrooms/:id  -> edit name / description
// DELETE /api/classrooms/:id  -> archive (classrooms are never hard-deleted)
import { assertSameOrigin, errorResponse, jsonOk, readJsonBody } from "@/lib/api";
import { classroomUpdateSchema, parseDottedOrThrow, parseIdParam } from "@/lib/builder-validation";
import { requireInstructorApi } from "@/lib/session";
import {
  archiveClassroom,
  getClassroom,
  updateClassroom,
} from "@/services/classroom.service";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const instructor = await requireInstructorApi();
    const id = parseIdParam((await params).id);
    return jsonOk({ classroom: await getClassroom(instructor.id, id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const instructor = await requireInstructorApi();
    const id = parseIdParam((await params).id);
    const patch = parseDottedOrThrow(classroomUpdateSchema, await readJsonBody(request));
    return jsonOk({ classroom: await updateClassroom(instructor.id, id, patch) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const instructor = await requireInstructorApi();
    const id = parseIdParam((await params).id);
    return jsonOk({ classroom: await archiveClassroom(instructor.id, id) });
  } catch (error) {
    return errorResponse(error);
  }
}
