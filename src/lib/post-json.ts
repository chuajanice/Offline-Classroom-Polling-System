// Browser-side helper: POST JSON to our own API and normalise the outcome.
// Client-safe (no server imports). Used by the auth forms and the logout button.

export type ApiFailure = { message: string; fields: Record<string, string> };
export type ApiResult = { ok: true; data: unknown } | { ok: false; error: ApiFailure };

const GENERIC = "Something went wrong. Please try again.";

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every((v) => typeof v === "string")
  );
}

export async function postJson(url: string, body: unknown): Promise<ApiResult> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
