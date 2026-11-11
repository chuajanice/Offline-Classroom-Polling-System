import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeEmail, normalizeFullName } from "../../src/lib/normalize";
import { AppError, isUniqueViolation } from "../../src/lib/errors";

describe("normalizeEmail", () => {
  it("trims and lower-cases", () => {
    assert.equal(normalizeEmail("  Teacher@School.EDU  "), "teacher@school.edu");
  });
  it("is idempotent", () => {
    const once = normalizeEmail(" A@B.CO ");
    assert.equal(normalizeEmail(once), once);
  });
});

describe("normalizeFullName", () => {
  it("trims and collapses internal whitespace", () => {
    assert.equal(normalizeFullName("  Ana   Maria \t Cruz\n"), "Ana Maria Cruz");
  });
  it("keeps letter case and accents (display value)", () => {
    assert.equal(normalizeFullName("José  Núñez"), "José Núñez");
  });
  it("uses one canonical Unicode form", () => {
    assert.equal(normalizeFullName("Jose\u0301"), normalizeFullName("Jos\u00e9"));
  });
  it("turns whitespace-only input into an empty string", () => {
    assert.equal(normalizeFullName("   \n "), "");
  });
});

describe("AppError", () => {
  it("carries status, code, message, fields and headers", () => {
    const e = new AppError(429, "TOO_MANY_ATTEMPTS", "slow down", {
      fields: { email: "x" },
      headers: { "Retry-After": "30" },
    });
    assert.ok(e instanceof Error);
    assert.equal(e.name, "AppError");
    assert.equal(e.status, 429);
    assert.equal(e.code, "TOO_MANY_ATTEMPTS");
    assert.equal(e.message, "slow down");
    assert.deepEqual(e.fields, { email: "x" });
    assert.deepEqual(e.headers, { "Retry-After": "30" });
  });
});

describe("isUniqueViolation", () => {
  it("recognises Prisma P2002 and raw MySQL duplicate-entry messages", () => {
    assert.equal(isUniqueViolation({ code: "P2002" }), true);
    assert.equal(isUniqueViolation(new Error("Duplicate entry 'a@b.co' for key 'instructors_email_key'")), true);
    assert.equal(isUniqueViolation(new Error("Unique constraint failed on the constraint: `email`")), true);
  });
  it("does not match other errors", () => {
    assert.equal(isUniqueViolation({ code: "P2003" }), false);
    assert.equal(isUniqueViolation(new Error("connection refused")), false);
    assert.equal(isUniqueViolation(null), false);
    assert.equal(isUniqueViolation("P2002"), false);
  });
});
