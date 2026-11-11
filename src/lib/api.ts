// Helpers shared by every API Route Handler.
import { NextResponse } from "next/server";
import { AppError } from "./errors";
import { isSameOrigin } from "./security";

const NO_STORE = { "Cache-Control": "no-store" };

/** JSON success response that browsers and proxies must never cache. */
export function jsonOk(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

/** CSRF check. Call first in every POST/PATCH/DELETE handler. */
export function assertSameOrigin(request: Request): void {
  if (!isSameOrigin(request.headers)) {
    throw new AppError(403, "BAD_ORIGIN", "This request was blocked because it did not come from this application.");
  }
}

/** Reads a small JSON body, rejecting wrong content types, oversized bodies and malformed JSON. */
export async function readJsonBody(request: Request, maxChars = 10_000): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "Send the request body as JSON.");
  }
  // Refuse obviously huge bodies from the declared length before buffering them.
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxChars * 4) {
    throw new AppError(413, "BODY_TOO_LARGE", "The request body is too large.");
  }
  const text = await request.text();
  if (text.length > maxChars) {
    throw new AppError(413, "BODY_TOO_LARGE", "The request body is too large.");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError(400, "INVALID_JSON", "The request body is not valid JSON.");
  }
}

/** Turns any thrown value into a consistent JSON error response. */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.fields ? { fields: error.fields } : {}),
        },
      },
      { status: error.status, headers: { ...NO_STORE, ...error.headers } },
    );
  }

  // Unexpected failure. Log only the name, code and first line: Prisma error
  // messages can embed the failed query's arguments (including a password hash).
  const e = error as { name?: unknown; code?: unknown; message?: unknown } | null;
  const firstLine = typeof e?.message === "string" ? e.message.split("\n").find((l) => l.trim()) : undefined;
  console.error("Unhandled API error:", { name: e?.name, code: e?.code, message: firstLine });

  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } },
    { status: 500, headers: NO_STORE },
  );
}
