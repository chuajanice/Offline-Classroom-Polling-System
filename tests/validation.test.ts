// Needs the `zod` dependency (npm install zod@4). No database required.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AppError } from "../src/lib/errors";
import { loginSchema, parseOrThrow, registerSchema } from "../src/lib/validation";

const valid = {
  fullName: "  Ana   Cruz ",
  email: "  Ana.Cruz@School.EDU ",
  password: "correct horse battery",
  confirmPassword: "correct horse battery",
};

function fieldsOf(fn: () => unknown): Record<string, string> {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof AppError, "validation must throw AppError");
    assert.equal(error.status, 400);
    assert.equal(error.code, "VALIDATION_ERROR");
    return error.fields ?? {};
  }
  assert.fail("expected validation to fail");
}

describe("registerSchema", () => {
  it("accepts valid input and normalises name and e-mail", () => {
    const out = parseOrThrow(registerSchema, valid);
    assert.equal(out.fullName, "Ana Cruz");
    assert.equal(out.email, "ana.cruz@school.edu");
    assert.equal(out.password, "correct horse battery");
  });

  it("never alters the password (no trimming)", () => {
    const out = parseOrThrow(registerSchema, { ...valid, password: "  spaced out  ", confirmPassword: "  spaced out  " });
    assert.equal(out.password, "  spaced out  ");
  });

  it("rejects an invalid e-mail", () => {
    for (const email of ["", "   ", "not-an-email", "a@", "@b.co", "a b@c.co"]) {
      const fields = fieldsOf(() => parseOrThrow(registerSchema, { ...valid, email }));
      assert.ok(fields.email, `"${email}" should be rejected`);
    }
  });

  it("rejects a password shorter than 8 or longer than 128", () => {
    assert.ok(fieldsOf(() => parseOrThrow(registerSchema, { ...valid, password: "short", confirmPassword: "short" })).password);
    const long = "x".repeat(129);
    assert.ok(fieldsOf(() => parseOrThrow(registerSchema, { ...valid, password: long, confirmPassword: long })).password);
  });

  it("accepts the boundary lengths 8 and 128", () => {
    for (const n of [8, 128]) {
      const pw = "x".repeat(n);
      assert.doesNotThrow(() => parseOrThrow(registerSchema, { ...valid, password: pw, confirmPassword: pw }));
    }
  });

  it("rejects mismatching confirmation, reported on confirmPassword", () => {
    const fields = fieldsOf(() => parseOrThrow(registerSchema, { ...valid, confirmPassword: "different password" }));
    assert.equal(fields.confirmPassword, "Passwords do not match.");
  });

  it("enforces the database column limits (name 120, e-mail 150)", () => {
    assert.ok(fieldsOf(() => parseOrThrow(registerSchema, { ...valid, fullName: "n".repeat(121) })).fullName);
    assert.doesNotThrow(() => parseOrThrow(registerSchema, { ...valid, fullName: "n".repeat(120) }));
    const longEmail = `${"a".repeat(146)}@b.co`; // 146 + 5 = 151 characters, one over the limit
    assert.equal(longEmail.length, 151);
    assert.ok(fieldsOf(() => parseOrThrow(registerSchema, { ...valid, email: longEmail })).email);
  });

  it("rejects an empty or whitespace-only name", () => {
    assert.ok(fieldsOf(() => parseOrThrow(registerSchema, { ...valid, fullName: "   " })).fullName);
  });

  it("rejects missing fields and wrong types without crashing", () => {
    const fields = fieldsOf(() => parseOrThrow(registerSchema, {}));
    for (const key of ["fullName", "email", "password", "confirmPassword"]) assert.ok(fields[key], `${key} missing`);
    assert.ok(fieldsOf(() => parseOrThrow(registerSchema, { ...valid, email: 42 })).email);
    fieldsOf(() => parseOrThrow(registerSchema, null)); // throws AppError(400), not a TypeError
  });

  it("drops unknown properties, so a client cannot smuggle an instructor id or role", () => {
    const out = parseOrThrow(registerSchema, { ...valid, id: 1, role: "admin", passwordHash: "x" }) as Record<string, unknown>;
    assert.equal("id" in out, false);
    assert.equal("role" in out, false);
    assert.equal("passwordHash" in out, false);
  });
});

describe("loginSchema", () => {
  it("normalises the e-mail and keeps the password untouched", () => {
    const out = parseOrThrow(loginSchema, { email: "  A@B.CO ", password: " pw " });
    assert.equal(out.email, "a@b.co");
    assert.equal(out.password, " pw ");
  });

  it("requires both fields", () => {
    const fields = fieldsOf(() => parseOrThrow(loginSchema, { email: "", password: "" }));
    assert.ok(fields.email && fields.password);
  });

  it("drops unknown properties here too", () => {
    const out = parseOrThrow(loginSchema, { email: "a@b.co", password: "pw", instructorId: 99, role: "admin" }) as Record<string, unknown>;
    assert.deepEqual(Object.keys(out).sort(), ["email", "password"]);
  });

  it("rejects an oversized password before it reaches the hasher", () => {
    assert.ok(fieldsOf(() => parseOrThrow(loginSchema, { email: "a@b.co", password: "x".repeat(129) })).password);
  });
});
