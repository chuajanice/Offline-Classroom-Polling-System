// POST /api/activities/:id/archive -> Archives the activity. An open activity is closed first. History is kept.
import { assertSameOrigin, errorResponse, jsonOk } from "@/lib/api";
import { parseIdParam } from "@/lib/builder-validation";
import { requireInstructorApi } from "@/lib/session";
import { archiveActivity } from "@/services/session.service";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const instructor = await requireInstructorApi();
    const id = parseIdParam((await params).id);
    return jsonOk({ activity: await archiveActivity(instructor.id, id) });
  } catch (error) {
    return errorResponse(error);
  }
}
