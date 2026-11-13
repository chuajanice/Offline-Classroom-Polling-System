// The student's temporary participant cookie: one per activity, so a single
// browser can take part in several activities. The cookie holds an
// unpredictable token; the database stores only its SHA-256 hash.
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { isHttpsRequest, sessionCookieOptions } from "./security";

/** A class session lasts well beyond one lesson, but not indefinitely. */
export const PARTICIPANT_COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60;

export function participantCookieName(activityId: number): string {
  return `ocp_participant_${activityId}`;
}

export function setParticipantCookie(
  response: NextResponse,
  request: Request,
  activityId: number,
  token: string,
): void {
  response.cookies.set(
    participantCookieName(activityId),
    token,
    sessionCookieOptions(isHttpsRequest(request.url, request.headers), PARTICIPANT_COOKIE_MAX_AGE_SECONDS),
  );
}

/** Raw token from the request's cookie for this activity, or undefined. Server components and route handlers only. */
export async function readParticipantToken(activityId: number): Promise<string | undefined> {
  return (await cookies()).get(participantCookieName(activityId))?.value;
}
