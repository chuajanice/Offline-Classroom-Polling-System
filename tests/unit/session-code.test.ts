import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SESSION_CODE_ALPHABET,
  SESSION_CODE_LENGTH,
  generateSessionCode,
  isWellFormedSessionCode,
  normalizeSessionCode,
} from "../../src/lib/session-code";

describe("session codes", () => {
  it("uses 8 characters from an alphabet without look-alikes", () => {
    assert.equal(SESSION_CODE_LENGTH, 8);
    for (const ambiguous of ["0", "O", "1", "I", "L"]) {
      assert.ok(!SESSION_CODE_ALPHABET.includes(ambiguous), `must not contain ${ambiguous}`);
    }
  });

  it("generates well-formed, distinct codes", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const code = generateSessionCode();
      assert.ok(isWellFormedSessionCode(code), code);
      codes.add(code);
    }
    assert.equal(codes.size, 2000, "2000 random codes should all differ");
  });

  it("normalises what students type: case, spaces and hyphens", () => {
    assert.equal(normalizeSessionCode(" ab23-cd45 "), "AB23CD45");
    assert.equal(normalizeSessionCode("ab 23 cd 45"), "AB23CD45");
  });

  it("rejects malformed codes, including ones with ambiguous characters", () => {
    assert.equal(isWellFormedSessionCode("AB23CD4"), false, "too short");
    assert.equal(isWellFormedSessionCode("AB23CD456"), false, "too long");
    assert.equal(isWellFormedSessionCode("OOOOOOOO"), false, "O not allowed");
    assert.equal(isWellFormedSessionCode("ABCD1234"), false, "1 not allowed");
    assert.equal(isWellFormedSessionCode("ABCD;234"), false, "symbols not allowed");
  });
});
