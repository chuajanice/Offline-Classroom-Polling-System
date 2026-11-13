// POST /api/student/join  { sessionCode, fullName }
// Creates a participant and sets that activity's participant cookie. No account.
import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse, readJsonBody } from "@/lib/api";
import { joinInputSchema, parseDottedOrThrow } from "@/lib/builder-validation";
import { AppError } from "@/lib/errors";
import { joinLimiter } from "@/lib/rate-limit";
import { setParticipantCookie } from "@/lib/participant-session";
import { joinActivity } from "@/services/student.service";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);

    const gate = joinLimiter.check("join");
    if (!gate.allowed) {
      throw new AppError(429, "RATE_LIMITED", `Too many invalid codes. Try again in ${Math.ceil(gate.retryAfterSeconds / 60)} minute(s).`);
    }

    const input = parseDottedOrThrow(joinInputSchema, await readJsonBody(request));
    let result;
    try {
      result = await joinActivity(input);
    } catch (error) {
      if (error instanceof AppError && error.code === "INVALID_CODE") joinLimiter.recordFailure("join");
      throw error;
    }

    const response = NextResponse.json(
      { redirectTo: `/student/activities/${result.activityId}` },
      { status: 201 },
    );
    setParticipantCookie(response, request, result.activityId, result.token);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
