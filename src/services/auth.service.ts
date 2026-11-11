// Business logic for instructor accounts and sessions.
//
// Framework-free on purpose: no cookies, no Next.js, no HTTP. The API layer
// (src/app/api/auth/*) and the session helpers (src/lib/session.ts) call into
// this file, and the integration tests call it directly.
import { prisma } from "../lib/prisma";
import { AppError, isUniqueViolation } from "../lib/errors";
import { getDummyHash, hashPassword, verifyPassword } from "../lib/auth";
import { normalizeEmail, normalizeFullName } from "../lib/normalize";
import { SESSION_TTL_MS, generateSessionToken, hashSessionToken } from "../lib/security";

/** The only instructor fields that ever leave the server. Never the hash. */
export type PublicInstructor = { id: number; fullName: string; email: string };
const publicSelect = { id: true, fullName: true, email: true } as const;

export async function registerInstructor(input: {
  fullName: string;
  email: string;
  password: string;
}): Promise<PublicInstructor> {
  const passwordHash = await hashPassword(input.password);
  try {
    return await prisma.instructor.create({
      data: {
        fullName: normalizeFullName(input.fullName),
        email: normalizeEmail(input.email),
        passwordHash,
      },
      select: publicSelect,
    });
  } catch (error) {
    // The unique index on instructors.email is the race-safe duplicate check:
    // two simultaneous registrations cannot both succeed.
    if (isUniqueViolation(error)) {
      const message = "An account with this email address already exists.";
      throw new AppError(409, "EMAIL_TAKEN", message, { fields: { email: message } });
    }
    throw error;
  }
}

/** Verifies credentials. The failure is identical for "no such e-mail" and "wrong password". */
export async function authenticate(emailInput: string, password: string): Promise<PublicInstructor> {
  const instructor = await prisma.instructor.findUnique({ where: { email: normalizeEmail(emailInput) } });
  const passwordOk = await verifyPassword(instructor?.passwordHash ?? (await getDummyHash()), password);
  if (!instructor || !passwordOk) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
  }
  return { id: instructor.id, fullName: instructor.fullName, email: instructor.email };
}

/** Creates a session row and returns the raw token (for the cookie) once. Only its hash is stored. */
export async function createSession(
  instructorId: number,
  now: Date = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  // Housekeeping: expired rows are useless, so each login removes them.
  await prisma.instructorSession.deleteMany({ where: { expiresAt: { lt: now } } });
  await prisma.instructorSession.create({
    data: { instructorId, tokenHash: hashSessionToken(token), expiresAt },
  });
  return { token, expiresAt };
}

/** Resolves a cookie token to its instructor, or null if missing, unknown or expired. */
export async function getInstructorBySessionToken(
  token: string | undefined,
  now: Date = new Date(),
): Promise<PublicInstructor | null> {
  if (!token || token.length > 128) return null;

  const session = await prisma.instructorSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: { id: true, expiresAt: true, instructor: { select: publicSelect } },
  });
  if (!session) return null;

  if (session.expiresAt <= now) {
    await prisma.instructorSession.deleteMany({ where: { id: session.id } });
    return null;
  }
  return session.instructor;
}

/** Logout: really invalidates the session on the server. Safe to call with an unknown token. */
export async function deleteSession(token: string): Promise<void> {
  await prisma.instructorSession.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
}
