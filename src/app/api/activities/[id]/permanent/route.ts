// DELETE /api/activities/:id/permanent -> permanently removes an ARCHIVED activity (instructor only).
import { assertSameOrigin, errorResponse, jsonOk } from "@/lib/api";
import { parseIdParam } from "@/lib/builder-validation";
import { requireInstructorApi } from "@/lib/session";
import { permanentlyDeleteActivity } from "@/services/activity.service";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const instructor = await requireInstructorApi();
    const id = parseIdParam((await params).id);
    await permanentlyDeleteActivity(instructor.id, id);
    return jsonOk({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
