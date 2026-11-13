import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { postJson } from "../../src/lib/post-json";

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("postJson (browser helper)", () => {
  it("returns the parsed body on success", async () => {
    const result = await postJson("/x", { a: 1 }, { fetchImpl: async () => jsonResponse(200, { ok: 1 }) });
    assert.deepEqual(result, { ok: true, data: { ok: 1 } });
  });

  it("returns the server's message and field errors on a failed request", async () => {
    const result = await postJson("/x", {}, {
      fetchImpl: async () => jsonResponse(400, { error: { message: "Check the form.", fields: { email: "Required." } } }),
    });
    assert.deepEqual(result, { ok: false, error: { message: "Check the form.", fields: { email: "Required." } } });
  });

  it("reports a stalled request as a timeout instead of hanging", async () => {
    const stalled: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    const started = Date.now();
    const result = await postJson("/x", {}, { timeoutMs: 50, fetchImpl: stalled });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error.message, /took too long/);
    assert.ok(Date.now() - started < 2000, "returns promptly after the timeout");
  });

  it("reports a network failure as a connection problem", async () => {
    const result = await postJson("/x", {}, { fetchImpl: async () => { throw new TypeError("Failed to fetch"); } });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error.message, /Could not reach the server/);
  });
});
