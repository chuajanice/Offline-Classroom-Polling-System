// GET  /api/classrooms  -> the instructor's active classrooms
// POST /api/classrooms  -> create a classroom
import { assertSameOrigin, errorResponse, jsonOk, readJsonBody } from "@/lib/api";
import { classroomInputSchema, parseDottedOrThrow } from "@/lib/builder-validation";
import { requireInstructorApi } from "@/lib/session";
import { createClassroom, listClassrooms } from "@/services/classroom.service";

export async function GET() {
  try {
    const instructor = await requireInstructorApi();
    return jsonOk({ classrooms: await listClassrooms(instructor.id) });
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
