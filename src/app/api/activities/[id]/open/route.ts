// POST /api/activities/:id/open -> Opens the activity for students: issues the session code and sets opened_at.
import { assertSameOrigin, errorResponse, jsonOk } from "@/lib/api";
import { parseIdParam } from "@/lib/builder-validation";
import { requireInstructorApi } from "@/lib/session";
import { openActivity } from "@/services/session.service";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const instructor = await requireInstructorApi();
    const id = parseIdParam((await params).id);
    return jsonOk({ activity: await openActivity(instructor.id, id) });
  } catch (error) {
    return errorResponse(error);
  }
}
