// POST /api/auth/login: verify credentials and start a session.
import { AppError } from "@/lib/errors";
import { assertSameOrigin, errorResponse, jsonOk, readJsonBody } from "@/lib/api";
import { loginLimiter } from "@/lib/rate-limit";
import { setSessionCookie } from "@/lib/session";
import { loginSchema, parseOrThrow } from "@/lib/validation";
import { authenticate, createSession } from "@/services/auth.service";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { email, password } = parseOrThrow(loginSchema, await readJsonBody(request));

    const gate = loginLimiter.check(email);
    if (!gate.allowed) {
      const minutes = Math.ceil(gate.retryAfterSeconds / 60);
      throw new AppError(
        429,
        "TOO_MANY_ATTEMPTS",
        `Too many failed login attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
        { headers: { "Retry-After": String(gate.retryAfterSeconds) } },
      );
    }

    let instructor;
    try {
      instructor = await authenticate(email, password);
    } catch (error) {
      if (error instanceof AppError && error.status === 401) loginLimiter.recordFailure(email);
      throw error;
    }
    loginLimiter.reset(email);

    const { token, expiresAt } = await createSession(instructor.id);
    const response = jsonOk({ instructor });
    setSessionCookie(response, request, token, expiresAt);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
