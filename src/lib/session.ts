// Request-scoped session handling: cookies in, cookies out, and the
// authorisation helpers every instructor page and API route must call.
//
// RULE: the instructor's identity comes ONLY from the server-side session
// looked up here. Never read an instructor id from a request body, query
// string or URL (section 6: "never trust instructor IDs supplied by the browser").
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextResponse } from "next/server";
import { AppError } from "./errors";
import {
  SESSION_COOKIE_NAME,
  isHttpsRequest,
  sessionCookieOptions,
} from "./security";
import { getInstructorBySessionToken, type PublicInstructor } from "../services/auth.service";

export function setSessionCookie(response: NextResponse, request: Request, token: string, expiresAt: Date): void {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  response.cookies.set(
    SESSION_COOKIE_NAME,
    token,
    sessionCookieOptions(isHttpsRequest(request.url, request.headers), maxAge),
  );
}

export function clearSessionCookie(response: NextResponse, request: Request): void {
  response.cookies.set(
    SESSION_COOKIE_NAME,
    "",
    sessionCookieOptions(isHttpsRequest(request.url, request.headers), 0),
  );
}

/** The raw session token from the request cookie, if any. */
export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE_NAME)?.value;
}

/** The logged-in instructor, or null. Memoised per request so layout + page share one lookup. */
export const getCurrentInstructor = cache(async (): Promise<PublicInstructor | null> => {
  return getInstructorBySessionToken(await readSessionToken());
});

/** For pages and layouts: send visitors without a valid session to the login page. */
export async function requireInstructor(): Promise<PublicInstructor> {
  const instructor = await getCurrentInstructor();
  if (!instructor) redirect("/login");
  return instructor;
}

/** For API routes: respond 401 instead of redirecting. */
export async function requireInstructorApi(): Promise<PublicInstructor> {
  const instructor = await getCurrentInstructor();
  if (!instructor) throw new AppError(401, "UNAUTHENTICATED", "You must be logged in to do this.");
  return instructor;
}
