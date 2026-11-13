import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkDisplayName, cleanDisplayName, normalizeDisplayName } from "../../src/lib/student-name";

describe("student display names", () => {
  it("collapses whitespace and trims", () => {
    assert.equal(cleanDisplayName("  Juan    dela  Cruz "), "Juan dela Cruz");
  });

  it("treats names that differ only by case or spacing as the same person", () => {
    const a = checkDisplayName("Juan  Dela Cruz");
    const b = checkDisplayName("  juan dela cruz ");
    assert.ok(a.ok && b.ok);
    assert.equal(a.normalizedName, b.normalizedName);
    assert.equal(normalizeDisplayName("MARÍA"), "maría");
  });

  it("accepts real names: hyphens, apostrophes, periods, accents", () => {
    for (const name of ["Maria-Jose Santos", "Ma. Clara", "O'Brien", "Núñez Peña", "Ñoño"]) {
      assert.equal(checkDisplayName(name).ok, true, name);
    }
  });

  it("rejects blanks, too-short, too-long, digits and symbols", () => {
    assert.equal(checkDisplayName("   ").ok, false, "blank");
    assert.equal(checkDisplayName("A").ok, false, "one character");
    assert.equal(checkDisplayName("x".repeat(121)).ok, false, "too long");
    assert.equal(checkDisplayName("Student 2").ok, false, "digits");
    assert.equal(checkDisplayName("<script>").ok, false, "markup");
  });
});
