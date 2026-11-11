// Server-side input validation (Zod 4). Every API route parses its body with
// one of these schemas before anything else touches it (section 23, rule 6).
import { z } from "zod";
import { AppError } from "./errors";
import { normalizeEmail, normalizeFullName } from "./normalize";

export const PASSWORD_MIN_LENGTH = 8;
// Upper bound only to stop absurdly large inputs reaching the hasher.
export const PASSWORD_MAX_LENGTH = 128;

// Limits mirror the database columns (instructors.full_name 120, email 150).
// The transform runs BEFORE the format check, so "  A@B.CO " becomes "a@b.co".
const emailField = z
  .string()
  .min(1, "Email is required.")
  .max(150, "Email must be at most 150 characters.")
  .transform(normalizeEmail)
  .pipe(z.email("Enter a valid email address."));

const fullNameField = z
  .string()
  .transform(normalizeFullName)
  .pipe(
    z
      .string()
      .min(1, "Full name is required.")
      .max(120, "Full name must be at most 120 characters."),
  );

// Passwords are never trimmed or otherwise altered.
const newPasswordField = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`);

export const registerSchema = z
  .object({
    fullName: fullNameField,
    email: emailField,
    password: newPasswordField,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: emailField,
  password: z
    .string()
    .min(1, "Password is required.")
    .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`),
});

export type RegisterInput = z.output<typeof registerSchema>;
export type LoginInput = z.output<typeof loginSchema>;

/**
 * Validate untrusted data. On failure throws an AppError(400) carrying one
 * message per field. Uses safeParse so it does not depend on how a particular
 * Zod version implements its error class.
 */
export function parseOrThrow<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data as z.output<S>;

  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : "_form";
    if (!(key in fields)) fields[key] = issue.message;
  }
  throw new AppError(400, "VALIDATION_ERROR", "Please correct the highlighted fields.", { fields });
}
