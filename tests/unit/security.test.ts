import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  generateSessionToken,
  hashSessionToken,
  isHttpsRequest,
  isSameOrigin,
  sessionCookieOptions,
} from "../../src/lib/security";

describe("session tokens", () => {
  it("are 256-bit, cookie-safe and unique", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateSessionToken()));
    assert.equal(tokens.size, 200, "tokens must never repeat");
    for (const t of tokens) {
      assert.match(t, /^[A-Za-z0-9_-]{43}$/, "32 random bytes as base64url = 43 chars");
    }
  });

  it("are stored as a deterministic 64-char SHA-256 hash that differs from the token", () => {
    const token = generateSessionToken();
    const hash = hashSessionToken(token);
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.equal(hashSessionToken(token), hash);
    assert.notEqual(hash, token);
    assert.notEqual(hashSessionToken(token + "x"), hash);
  });

  it("have a sane lifetime and cookie name", () => {
    assert.equal(SESSION_TTL_MS, 8 * 60 * 60 * 1000);
    assert.equal(SESSION_COOKIE_NAME, "instructor_session");
  });
});

describe("isSameOrigin (CSRF defence)", () => {
  const h = (o: Record<string, string>) => new Headers(o);

  it("accepts a request whose Origin matches the Host", () => {
    assert.equal(isSameOrigin(h({ host: "localhost:3000", origin: "http://localhost:3000" })), true);
    assert.equal(isSameOrigin(h({ host: "192.168.1.20:3000", origin: "http://192.168.1.20:3000" })), true);
  });

  it("is case-insensitive for the host name", () => {
    assert.equal(isSameOrigin(h({ host: "Classroom.local:3000", origin: "http://classroom.LOCAL:3000" })), true);
  });

  it("rejects a different host, a different port, or a malicious site", () => {
    assert.equal(isSameOrigin(h({ host: "localhost:3000", origin: "http://evil.example" })), false);
    assert.equal(isSameOrigin(h({ host: "localhost:3000", origin: "http://localhost:3001" })), false);
    assert.equal(isSameOrigin(h({ host: "localhost:3000", origin: "http://localhost:3000.evil.example" })), false);
  });

  it("rejects Origin: null and unparsable origins", () => {
    assert.equal(isSameOrigin(h({ host: "localhost:3000", origin: "null" })), false);
    assert.equal(isSameOrigin(h({ host: "localhost:3000", origin: "" })), false);
    assert.equal(isSameOrigin(h({ host: "localhost:3000", origin: "not a url" })), false);
  });

  it("falls back to Referer when Origin is absent", () => {
    assert.equal(isSameOrigin(h({ host: "localhost:3000", referer: "http://localhost:3000/login" })), true);
    assert.equal(isSameOrigin(h({ host: "localhost:3000", referer: "http://evil.example/login" })), false);
  });

  it("Origin wins over Referer when both are present", () => {
    assert.equal(
      isSameOrigin(h({ host: "localhost:3000", origin: "http://evil.example", referer: "http://localhost:3000/" })),
      false,
    );
  });

  it("rejects when neither Origin nor Referer is sent, or Host is missing", () => {
    assert.equal(isSameOrigin(h({ host: "localhost:3000" })), false);
    assert.equal(isSameOrigin(h({ origin: "http://localhost:3000" })), false);
  });
});

describe("isHttpsRequest (Secure cookie decision)", () => {
  it("is true for https URLs and for an https X-Forwarded-Proto", () => {
    assert.equal(isHttpsRequest("https://classroom.local/api/auth/login", new Headers()), true);
    assert.equal(isHttpsRequest("http://localhost:3000/x", new Headers({ "x-forwarded-proto": "https" })), true);
    assert.equal(isHttpsRequest("http://localhost:3000/x", new Headers({ "x-forwarded-proto": "HTTPS, http" })), true);
  });

  it("is false on plain HTTP (a Secure cookie would never be sent back and login would break)", () => {
    assert.equal(isHttpsRequest("http://192.168.1.20:3000/x", new Headers()), false);
    assert.equal(isHttpsRequest("http://192.168.1.20:3000/x", new Headers({ "x-forwarded-proto": "http" })), false);
    assert.equal(isHttpsRequest("garbage", new Headers()), false);
  });
});

describe("sessionCookieOptions", () => {
  it("is HttpOnly, SameSite=Lax, site-wide, and Secure only when asked", () => {
    const http = sessionCookieOptions(false, 100);
    assert.deepEqual(http, { httpOnly: true, sameSite: "lax", secure: false, path: "/", maxAge: 100 });
    assert.equal(sessionCookieOptions(true, 100).secure, true);
  });

  it("uses maxAge 0 to clear a cookie", () => {
    assert.equal(sessionCookieOptions(false, 0).maxAge, 0);
  });
});
