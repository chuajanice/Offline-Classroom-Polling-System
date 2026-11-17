// POST /api/student/activities/:id/start -> the student pressed "Start activity". This starts the timer.
import { assertSameOrigin, errorResponse, jsonOk } from "@/lib/api";
import { parseIdParam } from "@/lib/builder-validation";
import { readParticipantToken } from "@/lib/participant-session";
import { startAttempt } from "@/services/student.service";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const activityId = parseIdParam((await params).id);
    const token = await readParticipantToken(activityId);
    return jsonOk({ result: await startAttempt(activityId, token) });
  } catch (error) {
    return errorResponse(error);
  }
}
