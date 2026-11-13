// POST /api/student/activities/:id/submissions  { answers: [{ questionId, choiceId }] }
// Accepts one attempt for the participant bound to this activity. The score is computed on the server.
import { assertSameOrigin, errorResponse, jsonOk, readJsonBody } from "@/lib/api";
import { parseDottedOrThrow, parseIdParam, submissionInputSchema } from "@/lib/builder-validation";
import { readParticipantToken } from "@/lib/participant-session";
import { authenticateParticipant, submitAnswers } from "@/services/student.service";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const activityId = parseIdParam((await params).id);
    const token = await readParticipantToken(activityId);
    // Phase 6: authenticate BEFORE reading the body, so an unauthenticated caller
    // gets the same 401 whatever they send.
    await authenticateParticipant(activityId, token);
    const input = parseDottedOrThrow(submissionInputSchema, await readJsonBody(request));
    return jsonOk({ result: await submitAnswers(activityId, token, input) }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
