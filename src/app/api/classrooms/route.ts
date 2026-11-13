// GET  /api/classrooms  -> the instructor's active classrooms
// POST /api/classrooms  -> create a classroom
import { assertSameOrigin, errorResponse, jsonOk, readJsonBody } from "@/lib/api";
import { classroomInputSchema, parseDottedOrThrow } from "@/lib/builder-validation";
import { requireInstructorApi } from "@/lib/session";
import { createClassroom, listArchivedClassrooms, listClassrooms } from "@/services/classroom.service";

/** GET /api/classrooms            -> active classrooms
 *  GET /api/classrooms?archived=true -> archived classrooms (for restore) */
export async function GET(request: Request) {
  try {
    const instructor = await requireInstructorApi();
    const archived = new URL(request.url).searchParams.get("archived") === "true";
    const classrooms = archived
      ? await listArchivedClassrooms(instructor.id)
      : await listClassrooms(instructor.id);
    return jsonOk({ classrooms });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const instructor = await requireInstructorApi();
    const input = parseDottedOrThrow(classroomInputSchema, await readJsonBody(request));
    const classroom = await createClassroom(instructor.id, input);
    return jsonOk({ classroom }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
