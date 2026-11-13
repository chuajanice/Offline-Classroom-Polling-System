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

/** Phase 6: a request that never answers (a stalled mobile connection) must not leave the form spinning forever. */
export const POST_TIMEOUT_MS = 15_000;
const TIMEOUT_MESSAGE = "The server took too long to respond. Check the connection and try again.";

export async function postJson(
  url: string,
  body: unknown,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<ApiResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? POST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
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
      error: {
        message: timedOut ? TIMEOUT_MESSAGE : "Could not reach the server. Check your connection and try again.",
        fields: {},
      },
    };
  } finally {
    clearTimeout(timer);
  }
}
