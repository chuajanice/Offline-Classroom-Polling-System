// POST /api/activities/:id/publish -> validate the activity and mark it published.
// Does NOT open a student session (Phase 4).
import { assertSameOrigin, errorResponse, jsonOk } from "@/lib/api";
import { parseIdParam } from "@/lib/builder-validation";
import { requireInstructorApi } from "@/lib/session";
import { publishActivity } from "@/services/activity.service";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const instructor = await requireInstructorApi();
    const id = parseIdParam((await params).id);
    return jsonOk({ activity: await publishActivity(instructor.id, id) });
  } catch (error) {
    return errorResponse(error);
  }
}
