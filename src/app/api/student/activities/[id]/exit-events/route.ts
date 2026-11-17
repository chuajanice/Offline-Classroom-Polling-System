// POST /api/student/activities/:id/exit-events  { event: "left" | "stay" | "leave" }
// Records the exit warning for the participant's current attempt. The server decides the outcome.
import { assertSameOrigin, errorResponse, jsonOk, readJsonBody } from "@/lib/api";
import { exitEventInputSchema, parseDottedOrThrow, parseIdParam } from "@/lib/builder-validation";
import { readParticipantToken } from "@/lib/participant-session";
import { authenticateParticipant, recordExitEvent } from "@/services/student.service";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const activityId = parseIdParam((await params).id);
    const token = await readParticipantToken(activityId);
    await authenticateParticipant(activityId, token);
    const input = parseDottedOrThrow(exitEventInputSchema, await readJsonBody(request));
    return jsonOk({ result: await recordExitEvent(activityId, token, input.event) });
  } catch (error) {
    return errorResponse(error);
  }
}
