// GET /api/student/activities/:id -> the student's view of one activity.
// Requires the participant cookie issued for THIS activity. Never includes correct answers.
import { errorResponse, jsonOk } from "@/lib/api";
import { parseIdParam } from "@/lib/builder-validation";
import { readParticipantToken } from "@/lib/participant-session";
import { getStudentActivity } from "@/services/student.service";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const activityId = parseIdParam((await params).id);
    const token = await readParticipantToken(activityId);
    return jsonOk(await getStudentActivity(activityId, token));
  } catch (error) {
    return errorResponse(error);
  }
}
