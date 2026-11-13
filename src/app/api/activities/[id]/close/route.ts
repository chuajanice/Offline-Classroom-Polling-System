// POST /api/activities/:id/close -> Closes an open activity. Students can no longer join or submit.
import { assertSameOrigin, errorResponse, jsonOk } from "@/lib/api";
import { parseIdParam } from "@/lib/builder-validation";
import { requireInstructorApi } from "@/lib/session";
import { closeActivity } from "@/services/session.service";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const instructor = await requireInstructorApi();
    const id = parseIdParam((await params).id);
    return jsonOk({ activity: await closeActivity(instructor.id, id) });
  } catch (error) {
    return errorResponse(error);
  }
}
