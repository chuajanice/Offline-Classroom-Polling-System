// Session codes students type to join an activity. Pure functions: no database.
import { randomInt } from "node:crypto";

/** 31 characters. Omits 0/O, 1/I/L so codes read clearly when written or spoken. */
export const SESSION_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const SESSION_CODE_LENGTH = 8;
const SHAPE = new RegExp(`^[${SESSION_CODE_ALPHABET}]{${SESSION_CODE_LENGTH}}$`);

/** Cryptographically random. The database unique index is still the final guarantee. */
export function generateSessionCode(): string {
  let code = "";
  for (let i = 0; i < SESSION_CODE_LENGTH; i++) {
    code += SESSION_CODE_ALPHABET[randomInt(SESSION_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Students may type lower case, spaces or hyphens. Those are removed, and
 * characters that look alike are mapped to the code alphabet (O->0 is not
 * used, so O is rejected rather than guessed).
 */
export function normalizeSessionCode(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, "");
}

export function isWellFormedSessionCode(code: string): boolean {
  return SHAPE.test(code);
}
