// Input normalisation shared by validation and services.
// Pure functions, no dependencies.

/** Section 4.1: e-mail addresses are normalised before saving AND comparing. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** Trim, collapse runs of whitespace to one space, use canonical Unicode form. */
export function normalizeFullName(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}
