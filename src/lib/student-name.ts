// Student display names. Pure functions: no database, no framework.
//
// A name is NOT proof of identity (master prompt 4.6). It only labels a
// participant and prevents accidental duplicate joins within one activity.

export const NAME_MIN = 2;
export const NAME_MAX = 120;

// Letters (any script), combining marks, spaces, apostrophes, hyphens and periods.
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}\p{Zs}.'’-]*$/u;

/** Trim, Unicode-normalise, and collapse runs of whitespace to one space. */
export function cleanDisplayName(raw: string): string {
  return raw.normalize("NFC").replace(/\s+/g, " ").trim();
}

/** Key for duplicate detection: case-insensitive, otherwise identical to the cleaned name. */
export function normalizeDisplayName(cleaned: string): string {
  return cleaned.toLowerCase();
}

export type NameCheck =
  | { ok: true; displayName: string; normalizedName: string }
  | { ok: false; message: string };

export function checkDisplayName(raw: string): NameCheck {
  const displayName = cleanDisplayName(raw);
  if (displayName.length < NAME_MIN) {
    return { ok: false, message: `Enter your full name (at least ${NAME_MIN} characters).` };
  }
  if (displayName.length > NAME_MAX) {
    return { ok: false, message: `Your name must be at most ${NAME_MAX} characters.` };
  }
  if (!NAME_PATTERN.test(displayName)) {
    return { ok: false, message: "Use letters, spaces, hyphens, apostrophes or periods only." };
  }
  return { ok: true, displayName, normalizedName: normalizeDisplayName(displayName) };
}
