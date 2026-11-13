// GET  /api/activities[?classroomId=N]  -> your activities (summaries)
// POST /api/activities                  -> create an activity draft with its questions
import { assertSameOrigin, errorResponse, jsonOk, readJsonBody } from "@/lib/api";
import { activityInputSchema, parseDottedOrThrow, toPositiveId } from "@/lib/builder-validation";
import { AppError } from "@/lib/errors";
import { requireInstructorApi } from "@/lib/session";
import { createActivity, listActivities } from "@/services/activity.service";

// The builder sends the whole activity in one request (a few KB), so the limit is larger.
const ACTIVITY_BODY_MAX_CHARS = 200_000;

export async function GET(request: Request) {
  try {
    const instructor = await requireInstructorApi();
    const url = new URL(request.url);
    const raw = url.searchParams.get("classroomId");
    let classroomId: number | undefined;
    if (raw !== null) {
      const parsed = toPositiveId(raw);
      if (parsed === null) throw new AppError(400, "VALIDATION_ERROR", "classroomId must be a number.");
      classroomId = parsed;
    }
    const archived = url.searchParams.get("archived") === "true";
    return jsonOk({ activities: await listActivities(instructor.id, classroomId, archived) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const instructor = await requireInstructorApi();
    const input = parseDottedOrThrow(
      activityInputSchema,
      await readJsonBody(request, ACTIVITY_BODY_MAX_CHARS),
    );
    const activity = await createActivity(instructor.id, input);
    return jsonOk({ activity }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
