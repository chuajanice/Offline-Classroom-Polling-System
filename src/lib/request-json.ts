// Browser-side helper for PATCH and DELETE (and POST without a body), returning
// the same ApiResult shape as post-json.ts. Client-safe: no server imports.
import type { ApiResult } from "./post-json";

const GENERIC = "Something went wrong. Please try again.";

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every((v) => typeof v === "string")
  );
}

export async function requestJson(
  method: "POST" | "PATCH" | "DELETE",
  url: string,
  body?: unknown,
): Promise<ApiResult> {
  try {
    const response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data: unknown = await response.json().catch(() => null);
    if (response.ok) return { ok: true, data };

    const error = (data as { error?: { message?: unknown; fields?: unknown } } | null)?.error;
    return {
      ok: false,
      error: {
        message: typeof error?.message === "string" ? error.message : GENERIC,
        fields: isStringRecord(error?.fields) ? error.fields : {},
      },
    };
  } catch {
    return {
      ok: false,
      error: { message: "Could not reach the server. Check your connection and try again.", fields: {} },
    };
  }
}
