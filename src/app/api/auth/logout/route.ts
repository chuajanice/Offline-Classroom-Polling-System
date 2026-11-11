// POST /api/auth/logout: destroy the server-side session and clear the cookie.
// Idempotent: logging out when already logged out still succeeds.
import { assertSameOrigin, errorResponse, jsonOk } from "@/lib/api";
import { clearSessionCookie, readSessionToken } from "@/lib/session";
import { deleteSession } from "@/services/auth.service";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);

    const token = await readSessionToken();
    if (token) await deleteSession(token);

    const response = jsonOk({ ok: true });
    clearSessionCookie(response, request);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
