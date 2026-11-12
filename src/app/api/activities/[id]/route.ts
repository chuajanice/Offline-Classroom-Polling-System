// GET    /api/activities/:id  -> full activity incl. questions and correct answers (instructor only)
// PATCH  /api/activities/:id  -> save the whole activity (details, schedule, questions, choices)
// DELETE /api/activities/:id  -> delete a draft that has no student records
import { assertSameOrigin, errorResponse, jsonOk, readJsonBody } from "@/lib/api";
import { activityInputSchema, parseDottedOrThrow, parseIdParam } from "@/lib/builder-validation";
import { requireInstructorApi } from "@/lib/session";
import {
  deleteActivity,
  getActivity,
  updateActivity,
} from "@/services/activity.service";

const ACTIVITY_BODY_MAX_CHARS = 200_000;

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const instructor = await requireInstructorApi();
    const id = parseIdParam((await params).id);
    return jsonOk({ activity: await getActivity(instructor.id, id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const instructor = await requireInstructorApi();
    const id = parseIdParam((await params).id);
    const input = parseDottedOrThrow(
      activityInputSchema,
      await readJsonBody(request, ACTIVITY_BODY_MAX_CHARS),
    );
    const result = await updateActivity(instructor.id, id, input);
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const instructor = await requireInstructorApi();
    const id = parseIdParam((await params).id);
    await deleteActivity(instructor.id, id);
    return jsonOk({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
