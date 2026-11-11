// Application errors that are safe to show to the user.
//
// Services throw AppError; the API layer turns it into an HTTP response
// (see src/lib/api.ts). Anything that is NOT an AppError is treated as an
// unexpected failure and reported as a generic 500, so internal details
// (SQL, stack traces, hashes) never reach the browser.

export type AppErrorOptions = {
  /** Field-level messages, keyed by form field name. */
  fields?: Record<string, string>;
  /** Extra response headers, e.g. Retry-After. */
  headers?: Record<string, string>;
};

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;
  readonly headers?: Record<string, string>;

  constructor(status: number, code: string, message: string, options: AppErrorOptions = {}) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.fields = options.fields;
    this.headers = options.headers;
  }
}

/**
 * True when a database error is a unique-constraint violation.
 * Prisma reports P2002; the message check is a fallback in case a driver
 * adapter surfaces the raw MySQL error ("Duplicate entry ...") instead.
 */
export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const e = error as { code?: unknown; message?: unknown };
  if (e.code === "P2002") return true;
  return typeof e.message === "string" && /unique constraint|duplicate entry/i.test(e.message);
}
