// POST /api/classrooms/:id/archive -> archive (closes any open activity in it)
import { assertSameOrigin, errorResponse, jsonOk } from "@/lib/api";
import { parseIdParam } from "@/lib/builder-validation";
import { requireInstructorApi } from "@/lib/session";
import { archiveClassroom } from "@/services/classroom.service";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const instructor = await requireInstructorApi();
    const id = parseIdParam((await params).id);
    return jsonOk({ classroom: await archiveClassroom(instructor.id, id) });
  } catch (error) {
    return errorResponse(error);
  }
}
