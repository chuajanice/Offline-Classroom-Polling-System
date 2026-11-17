// Student ID rules. Pure functions: no database, no framework.
//
// The ID is the identity used to stop one student joining an activity twice.
// The display form keeps what was typed (leading zeroes included). The
// normalized form is what duplicate checks compare: NFKC (so full-width digits
// match ASCII ones), no whitespace, upper case.

export const STUDENT_ID_MIN = 3;
export const STUDENT_ID_MAX = 30;

// Letters and digits, optionally separated by hyphens; must start with a letter or digit.
const STUDENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]*$/;

export type StudentIdCheck =
  | { ok: true; studentId: string; normalizedStudentId: string }
  | { ok: false; message: string };

export function normalizeStudentId(cleaned: string): string {
  return cleaned.toUpperCase();
}

export function checkStudentId(raw: string): StudentIdCheck {
  const studentId = raw.normalize("NFKC").replace(/\s+/g, "");
  if (studentId.length === 0) {
    return { ok: false, message: "Enter your student ID." };
  }
  if (studentId.length < STUDENT_ID_MIN) {
    return { ok: false, message: `Your student ID must be at least ${STUDENT_ID_MIN} characters.` };
  }
  if (studentId.length > STUDENT_ID_MAX) {
    return { ok: false, message: `Your student ID must be at most ${STUDENT_ID_MAX} characters.` };
  }
  if (!STUDENT_ID_PATTERN.test(studentId)) {
    return { ok: false, message: "Use letters, numbers and hyphens only." };
  }
  return { ok: true, studentId, normalizedStudentId: normalizeStudentId(studentId) };
}
