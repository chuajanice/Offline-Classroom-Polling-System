// POST /api/auth/register: create an instructor account and sign them in.
import { assertSameOrigin, errorResponse, jsonOk, readJsonBody } from "@/lib/api";
import { setSessionCookie } from "@/lib/session";
import { parseOrThrow, registerSchema } from "@/lib/validation";
import { createSession, registerInstructor } from "@/services/auth.service";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = parseOrThrow(registerSchema, await readJsonBody(request));

    const instructor = await registerInstructor(input);
    const { token, expiresAt } = await createSession(instructor.id);

    const response = jsonOk({ instructor }, 201);
    setSessionCookie(response, request, token, expiresAt);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
