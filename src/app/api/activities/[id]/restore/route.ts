// POST /api/activities/:id/restore -> Restores an archived activity to the active list.
import { assertSameOrigin, errorResponse, jsonOk } from "@/lib/api";
import { parseIdParam } from "@/lib/builder-validation";
import { requireInstructorApi } from "@/lib/session";
import { restoreActivity } from "@/services/session.service";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const instructor = await requireInstructorApi();
    const id = parseIdParam((await params).id);
    return jsonOk({ activity: await restoreActivity(instructor.id, id) });
  } catch (error) {
    return errorResponse(error);
  }
}
