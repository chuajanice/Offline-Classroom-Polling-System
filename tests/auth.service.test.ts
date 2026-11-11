// Integration tests for the authentication service against the REAL MySQL
// database (run `npm run db:init` and the instructor_sessions migration first).
// Covers the section 21 scenarios: successful registration, duplicate e-mail,
// invalid login, successful login and unauthorized access.
//
// Test rows use e-mails starting "phase2-" and are removed afterwards.
import "dotenv/config";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { AppError } from "../src/lib/errors";
import { SESSION_TTL_MS, hashSessionToken } from "../src/lib/security";
import {
  authenticate,
  createSession,
  deleteSession,
  getInstructorBySessionToken,
  registerInstructor,
} from "../src/services/auth.service";

const run = randomBytes(4).toString("hex");
const email = (tag: string) => `phase2-test-${run}-${tag}@example.test`;
const PASSWORD = "correct horse battery staple";

const isAppError = (status: number, code: string) => (e: unknown) =>
  e instanceof AppError && e.status === status && e.code === code;

async function removeTestData() {
  // instructor_sessions rows disappear with their instructor (ON DELETE CASCADE).
  await prisma.instructor.deleteMany({ where: { email: { startsWith: "phase2-" } } });
}

before(async () => {
  await removeTestData();
});
after(async () => {
  await removeTestData();
  await prisma.$disconnect();
});

describe("registration", () => {
  it("successful registration returns only public fields and stores an Argon2id hash", async () => {
    const created = await registerInstructor({ fullName: "  Test   Teacher ", email: `  ${email("reg").toUpperCase()} `, password: PASSWORD });

    assert.deepEqual(Object.keys(created).sort(), ["email", "fullName", "id"], "must not expose passwordHash");
    assert.equal(created.fullName, "Test Teacher");
    assert.equal(created.email, email("reg"), "e-mail is stored trimmed and lower-cased");

    const row = await prisma.instructor.findUniqueOrThrow({ where: { id: created.id } });
    assert.match(row.passwordHash, /^\$argon2id\$/);
    assert.ok(!row.passwordHash.includes(PASSWORD), "the plaintext password must never be stored");
    assert.ok(row.passwordHash.length <= 255, "hash must fit the password_hash column");
  });

  it("the same password produces different hashes (random salt)", async () => {
    const a = await registerInstructor({ fullName: "Salt A", email: email("salt-a"), password: PASSWORD });
    const b = await registerInstructor({ fullName: "Salt B", email: email("salt-b"), password: PASSWORD });
    const [ra, rb] = await Promise.all([
      prisma.instructor.findUniqueOrThrow({ where: { id: a.id } }),
      prisma.instructor.findUniqueOrThrow({ where: { id: b.id } }),
    ]);
    assert.notEqual(ra.passwordHash, rb.passwordHash);
  });

  it("duplicate e-mail is rejected with 409, including a different letter case", async () => {
    await registerInstructor({ fullName: "First", email: email("dup"), password: PASSWORD });
    await assert.rejects(
      registerInstructor({ fullName: "Second", email: email("dup"), password: PASSWORD }),
      isAppError(409, "EMAIL_TAKEN"),
    );
    await assert.rejects(
      registerInstructor({ fullName: "Third", email: email("dup").toUpperCase(), password: PASSWORD }),
      isAppError(409, "EMAIL_TAKEN"),
    );
    const count = await prisma.instructor.count({ where: { email: email("dup") } });
    assert.equal(count, 1);
  });

  it("two simultaneous registrations of one e-mail: exactly one wins", async () => {
    const attempts = await Promise.allSettled(
      Array.from({ length: 4 }, () => registerInstructor({ fullName: "Racer", email: email("race"), password: PASSWORD })),
    );
    assert.equal(attempts.filter((a) => a.status === "fulfilled").length, 1);
    for (const a of attempts) {
      if (a.status === "rejected") assert.ok(isAppError(409, "EMAIL_TAKEN")(a.reason));
    }
  });
});

describe("login", () => {
  before(async () => {
    await registerInstructor({ fullName: "Login Teacher", email: email("login"), password: PASSWORD });
  });

  it("successful login returns the instructor (case and spaces in the e-mail do not matter)", async () => {
    const instructor = await authenticate(`  ${email("login").toUpperCase()} `, PASSWORD);
    assert.equal(instructor.email, email("login"));
    assert.equal(instructor.fullName, "Login Teacher");
    assert.equal("passwordHash" in instructor, false);
  });

  it("wrong password is rejected with 401 INVALID_CREDENTIALS", async () => {
    await assert.rejects(authenticate(email("login"), "wrong password!"), isAppError(401, "INVALID_CREDENTIALS"));
  });

  it("the password is case-sensitive and not trimmed", async () => {
    await assert.rejects(authenticate(email("login"), PASSWORD.toUpperCase()), isAppError(401, "INVALID_CREDENTIALS"));
    await assert.rejects(authenticate(email("login"), ` ${PASSWORD}`), isAppError(401, "INVALID_CREDENTIALS"));
  });

  it("unknown e-mail gives the SAME error and message as a wrong password (no account enumeration)", async () => {
    const wrongPassword = await authenticate(email("login"), "nope nope nope").catch((e: unknown) => e as AppError);
    const unknownEmail = await authenticate(email("nobody"), "nope nope nope").catch((e: unknown) => e as AppError);
    assert.ok(wrongPassword instanceof AppError && unknownEmail instanceof AppError);
    assert.equal(unknownEmail.status, wrongPassword.status);
    assert.equal(unknownEmail.code, wrongPassword.code);
    assert.equal(unknownEmail.message, wrongPassword.message);
  });
});

describe("sessions and unauthorized access", () => {
  let instructorId = 0;
  before(async () => {
    instructorId = (await registerInstructor({ fullName: "Session Teacher", email: email("sess"), password: PASSWORD })).id;
  });

  it("a new session resolves to its instructor", async () => {
    const { token } = await createSession(instructorId);
    const found = await getInstructorBySessionToken(token);
    assert.equal(found?.id, instructorId);
    assert.equal(found?.email, email("sess"));
  });

  it("the database stores only the SHA-256 hash, never the token", async () => {
    const { token } = await createSession(instructorId);
    assert.equal(await prisma.instructorSession.count({ where: { tokenHash: token } }), 0);
    assert.equal(await prisma.instructorSession.count({ where: { tokenHash: hashSessionToken(token) } }), 1);
  });

  it("each login gets its own session and tokens never repeat", async () => {
    const a = await createSession(instructorId);
    const b = await createSession(instructorId);
    assert.notEqual(a.token, b.token);
    assert.equal((await getInstructorBySessionToken(a.token))?.id, instructorId);
    assert.equal((await getInstructorBySessionToken(b.token))?.id, instructorId);
  });

  it("timestamps round-trip through MySQL without time-zone drift, and the lifetime is 8 hours", async () => {
    const { token, expiresAt } = await createSession(instructorId);
    const row = await prisma.instructorSession.findUniqueOrThrow({ where: { tokenHash: hashSessionToken(token) } });
    assert.ok(Math.abs(row.expiresAt.getTime() - expiresAt.getTime()) < 2000, "stored and read expiry differ: time-zone problem");
    const remaining = row.expiresAt.getTime() - Date.now();
    assert.ok(Math.abs(remaining - SESSION_TTL_MS) < 60_000, `expected ~8h left, got ${Math.round(remaining / 60000)} min`);
  });

  it("UNAUTHORIZED: missing, empty, garbage, oversized and forged tokens all resolve to nobody", async () => {
    assert.equal(await getInstructorBySessionToken(undefined), null);
    assert.equal(await getInstructorBySessionToken(""), null);
    assert.equal(await getInstructorBySessionToken("not-a-real-token"), null);
    assert.equal(await getInstructorBySessionToken("x".repeat(500)), null);
    // The stored HASH is not a valid token: knowing the database content is not enough to log in.
    const { token } = await createSession(instructorId);
    assert.equal(await getInstructorBySessionToken(hashSessionToken(token)), null);
  });

  it("UNAUTHORIZED: an expired session is rejected and removed", async () => {
    const longAgo = new Date(Date.now() - SESSION_TTL_MS - 60_000);
    const { token } = await createSession(instructorId, longAgo);
    assert.equal(await getInstructorBySessionToken(token), null);
    assert.equal(await prisma.instructorSession.count({ where: { tokenHash: hashSessionToken(token) } }), 0);
  });

  it("each login removes other people's expired sessions (housekeeping)", async () => {
    const longAgo = new Date(Date.now() - SESSION_TTL_MS - 60_000);
    const stale = await createSession(instructorId, longAgo);
    await createSession(instructorId); // a normal login
    assert.equal(await prisma.instructorSession.count({ where: { tokenHash: hashSessionToken(stale.token) } }), 0);
  });

  it("logout invalidates the session on the server, and is safe to repeat or call with junk", async () => {
    const { token } = await createSession(instructorId);
    assert.equal((await getInstructorBySessionToken(token))?.id, instructorId);
    await deleteSession(token);
    assert.equal(await getInstructorBySessionToken(token), null, "a logged-out cookie must not work any more");
    await deleteSession(token);
    await deleteSession("never-existed");
  });

  it("logging out one session leaves the same instructor's other sessions alone", async () => {
    const a = await createSession(instructorId);
    const b = await createSession(instructorId);
    await deleteSession(a.token);
    assert.equal(await getInstructorBySessionToken(a.token), null);
    assert.equal((await getInstructorBySessionToken(b.token))?.id, instructorId);
  });

  it("deleting an instructor removes their sessions (ON DELETE CASCADE from the migration)", async () => {
    const temp = await registerInstructor({ fullName: "Temp", email: email("cascade"), password: PASSWORD });
    const { token } = await createSession(temp.id);
    await prisma.instructor.delete({ where: { id: temp.id } });
    assert.equal(await prisma.instructorSession.count({ where: { tokenHash: hashSessionToken(token) } }), 0);
  });
});
