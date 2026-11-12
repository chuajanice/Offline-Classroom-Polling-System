// POST /api/activities/:id/unpublish -> return a published activity to draft.
import { assertSameOrigin, errorResponse, jsonOk } from "@/lib/api";
import { parseIdParam } from "@/lib/builder-validation";
import { requireInstructorApi } from "@/lib/session";
import { unpublishActivity } from "@/services/activity.service";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const instructor = await requireInstructorApi();
    const id = parseIdParam((await params).id);
    return jsonOk({ activity: await unpublishActivity(instructor.id, id) });
  } catch (error) {
    return errorResponse(error);
  }
}
