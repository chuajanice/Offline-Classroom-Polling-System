// Security primitives for instructor sessions. Pure and framework-free so they
// can be unit-tested without Next.js, Prisma or a database.
import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE_NAME = "instructor_session";

/** Absolute session lifetime. Long enough for a teaching day, short enough to limit a stolen cookie. */
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

/** 256 bits from the OS CSPRNG, URL/cookie-safe. This is the value in the cookie. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only this SHA-256 hash is stored in the database, never the token itself. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

type HeaderReader = { get(name: string): string | null };

function hostOf(urlLike: string): string | null {
  try {
    return new URL(urlLike).host.toLowerCase();
  } catch {
    return null; // not a URL, e.g. the literal string "null"
  }
}

/**
 * CSRF defence for cookie-authenticated, state-changing requests.
 *
 * Browsers attach an Origin header (or at least Referer) to every cross-site
 * POST/PATCH/DELETE and page scripts cannot forge it. We require it to name
 * the same host the request was sent to. A request with neither header is
 * rejected: real browsers always send one, so only scripts/curl omit both.
 * Together with SameSite=Lax cookies this blocks cross-site request forgery.
 */
export function isSameOrigin(headers: HeaderReader): boolean {
  const host = headers.get("host")?.toLowerCase();
  if (!host) return false;

  const origin = headers.get("origin");
  if (origin !== null) return hostOf(origin) === host;

  const referer = headers.get("referer");
  if (referer) return hostOf(referer) === host;

  return false;
}

/** "Use Secure cookies when HTTPS is enabled": decided per request. */
export function isHttpsRequest(url: string, headers: HeaderReader): boolean {
  try {
    if (new URL(url).protocol === "https:") return true;
  } catch {
    // fall through to the proxy header
  }
  const forwarded = headers.get("x-forwarded-proto");
  return forwarded?.split(",")[0]?.trim().toLowerCase() === "https";
}

export function sessionCookieOptions(secure: boolean, maxAgeSeconds: number) {
  return {
    httpOnly: true, // not readable by page scripts (limits XSS damage)
    sameSite: "lax" as const, // not sent on cross-site POSTs
    secure, // only over HTTPS when the site is served over HTTPS
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
