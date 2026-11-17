// Pure student-ID rules: no database needed.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkStudentId, STUDENT_ID_MAX } from "../../src/lib/student-id";

describe("checkStudentId", () => {
  it("keeps leading zeroes in the display form", () => {
    const r = checkStudentId("00123");
    assert.ok(r.ok);
    assert.equal(r.studentId, "00123");
    assert.equal(r.normalizedStudentId, "00123");
  });

  it("removes surrounding and inner whitespace before comparing", () => {
    const r = checkStudentId("  2024 - 0042 ");
    assert.ok(r.ok);
    assert.equal(r.studentId, "2024-0042");
  });

  it("compares case-insensitively", () => {
    const a = checkStudentId("ab-12");
    const b = checkStudentId("AB-12");
    assert.ok(a.ok && b.ok);
    assert.equal(a.normalizedStudentId, b.normalizedStudentId);
  });

  it("treats full-width digits as their ASCII equivalents", () => {
    const r = checkStudentId("２０２４１");
    assert.ok(r.ok);
    assert.equal(r.normalizedStudentId, "20241");
  });

  it("rejects empty, too short, too long and malformed IDs", () => {
    assert.equal(checkStudentId("   ").ok, false);
    assert.equal(checkStudentId("ab").ok, false);
    assert.equal(checkStudentId("a".repeat(STUDENT_ID_MAX + 1)).ok, false);
    assert.equal(checkStudentId("-ABC123").ok, false);
    assert.equal(checkStudentId("AB_123").ok, false);
    assert.equal(checkStudentId("AB/123").ok, false);
  });
});
