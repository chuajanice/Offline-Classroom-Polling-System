// End-to-end smoke test for Phase 2 (authentication) against the RUNNING app.
//
//   Terminal 1:  npm run dev
//   Terminal 2:  npm run smoke:auth          (or BASE_URL=http://192.168.1.20:3000 npm run smoke:auth)
//
// It talks to the real HTTP endpoints with Node's built-in fetch, so it covers
// what the service tests cannot: route handlers, request validation, CSRF
// rejection, cookie attributes, page redirects and server-side logout.
//
// It creates accounts with e-mails "phase2-smoke-*@example.test". There is no
// delete-account feature, so they stay until you run `npm test` (its set-up step
// removes every "phase2-" account) or the SQL in README-PHASE2.md.
//
// Exit code 0 = all checks passed, 1 = at least one failed, 2 = server unreachable.

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const ORIGIN = new URL(BASE).origin;
const COOKIE = "instructor_session";
const run = Math.random().toString(16).slice(2, 10);
const PASSWORD = "correct horse battery staple";
const emailA = `phase2-smoke-${run}-a@example.test`;
const emailB = `phase2-smoke-${run}-b@example.test`;

let passed = 0;
let failed = 0;

function report(ok, name, detail) {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  -  ${detail}` : ""}`);
}
const heading = (t) => console.log(`\n== ${t} ==`);

/** One HTTP call. Redirects are NOT followed so we can inspect them. */
async function call(path, { method = "GET", body, rawBody, contentType, cookie, origin = ORIGIN, headers = {} } = {}) {
  const h = { ...headers };
  if (origin !== null) h.Origin = origin;
  if (cookie) h.Cookie = `${COOKIE}=${cookie}`;
  let payload;
  if (rawBody !== undefined) {
    payload = rawBody;
    h["Content-Type"] = contentType ?? "application/json";
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    h["Content-Type"] = contentType ?? "application/json";
  }
  const res = await fetch(BASE + path, { method, headers: h, body: payload, redirect: "manual" });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* HTML page */
  }
  return { res, status: res.status, json, text, setCookie: res.headers.getSetCookie?.() ?? [] };
}

const sessionCookieHeader = (r) => r.setCookie.find((c) => c.startsWith(`${COOKIE}=`));
const tokenFrom = (r) => sessionCookieHeader(r)?.split(";")[0].slice(COOKIE.length + 1);

function redirectsTo(r, path) {
  const location = r.res.headers.get("location") ?? "";
  if (r.status >= 300 && r.status < 400 && location.includes(path)) return `HTTP ${r.status} -> ${location}`;
  // Next.js can answer a late redirect with a 200 page that redirects in the browser.
  if (r.status === 200 && /NEXT_REDIRECT|http-equiv="refresh"/.test(r.text) && r.text.includes(path)) {
    return "HTTP 200 with in-page redirect";
  }
  return null;
}

async function check(name, fn) {
  try {
    const detail = await fn();
    report(true, name, detail || undefined);
  } catch (error) {
    report(false, name, String(error instanceof Error ? error.message : error).slice(0, 300));
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log(`Phase 2 authentication smoke test against ${BASE}  (run ${run})`);

  try {
    await call("/api/auth/me");
  } catch (error) {
    console.error(`\nCannot reach ${BASE}: ${error instanceof Error ? error.message : error}`);
    console.error("Start the app first with `npm run dev` (or `npm run build && npm start`).");
    process.exit(2);
  }

  heading("1. Unauthorized access");
  await check("GET /api/auth/me without a cookie -> 401 UNAUTHENTICATED", async () => {
    const r = await call("/api/auth/me");
    assert(r.status === 401, `status ${r.status}`);
    assert(r.json?.error?.code === "UNAUTHENTICATED", `code ${r.json?.error?.code}`);
    assert(r.res.headers.get("cache-control")?.includes("no-store"), "auth responses must be no-store");
  });
  await check("GET /api/auth/me with a forged cookie -> 401", async () => {
    const r = await call("/api/auth/me", { cookie: "forged-token-value" });
    assert(r.status === 401, `status ${r.status}`);
  });
  await check("GET /dashboard without a session redirects to /login", async () => {
    const r = await call("/dashboard");
    return redirectsTo(r, "/login") ?? assert(false, `status ${r.status}, no redirect to /login`);
  });
  await check("the login and register pages are public", async () => {
    const login = await call("/login");
    const register = await call("/register");
    assert(login.status === 200 && login.text.includes("Instructor login"), `/login status ${login.status}`);
    assert(register.status === 200 && register.text.includes("Create instructor account"), `/register status ${register.status}`);
  });

  heading("2. Request hardening (CSRF, content type, body)");
  await check("POST without Origin/Referer is blocked (403 BAD_ORIGIN)", async () => {
    const r = await call("/api/auth/register", { method: "POST", origin: null, body: {} });
    assert(r.status === 403 && r.json?.error?.code === "BAD_ORIGIN", `status ${r.status} code ${r.json?.error?.code}`);
  });
  await check("POST from a foreign Origin is blocked (403 BAD_ORIGIN)", async () => {
    const r = await call("/api/auth/login", { method: "POST", origin: "http://evil.example", body: { email: emailA, password: PASSWORD } });
    assert(r.status === 403 && r.json?.error?.code === "BAD_ORIGIN", `status ${r.status}`);
  });
  await check("non-JSON content type -> 415", async () => {
    const r = await call("/api/auth/login", { method: "POST", rawBody: "email=a&password=b", contentType: "application/x-www-form-urlencoded" });
    assert(r.status === 415, `status ${r.status}`);
  });
  await check("malformed JSON -> 400 INVALID_JSON", async () => {
    const r = await call("/api/auth/login", { method: "POST", rawBody: "{not json" });
    assert(r.status === 400 && r.json?.error?.code === "INVALID_JSON", `status ${r.status} code ${r.json?.error?.code}`);
  });
  await check("oversized body -> 413", async () => {
    const r = await call("/api/auth/login", { method: "POST", rawBody: JSON.stringify({ email: "a@b.co", password: "x".repeat(20_000) }) });
    assert(r.status === 413, `status ${r.status}`);
  });
  await check("invalid registration -> 400 with a message per bad field", async () => {
    const r = await call("/api/auth/register", { method: "POST", body: { fullName: "", email: "nope", password: "short", confirmPassword: "different" } });
    assert(r.status === 400 && r.json?.error?.code === "VALIDATION_ERROR", `status ${r.status}`);
    const f = r.json.error.fields ?? {};
    for (const k of ["fullName", "email", "password"]) assert(f[k], `no message for ${k}`);
  });
  await check("password confirmation mismatch is reported on confirmPassword", async () => {
    const r = await call("/api/auth/register", { method: "POST", body: { fullName: "X", email: emailA, password: PASSWORD, confirmPassword: PASSWORD + "!" } });
    assert(r.status === 400 && r.json?.error?.fields?.confirmPassword, `status ${r.status}`);
  });

  heading("3. Registration");
  let tokenA;
  await check("valid registration -> 201, public fields only, session cookie set", async () => {
    const r = await call("/api/auth/register", { method: "POST", body: { fullName: "  Smoke   Teacher ", email: emailA.toUpperCase(), password: PASSWORD, confirmPassword: PASSWORD } });
    assert(r.status === 201, `status ${r.status}: ${r.text.slice(0, 200)}`);
    const i = r.json?.instructor;
    assert(i && i.email === emailA && i.fullName === "Smoke Teacher" && Number.isInteger(i.id), "unexpected instructor payload");
    assert(!JSON.stringify(r.json).toLowerCase().includes("password"), "response mentions a password field");
    tokenA = tokenFrom(r);
    assert(tokenA && tokenA.length === 43, `unexpected token ${tokenA}`);
  });
  await check("session cookie is HttpOnly, SameSite=Lax, Path=/, ~8h, and NOT Secure over plain HTTP", async () => {
    const r = await call("/api/auth/login", { method: "POST", body: { email: emailA, password: PASSWORD } });
    const c = sessionCookieHeader(r);
    assert(c, "no Set-Cookie");
    assert(/;\s*HttpOnly/i.test(c), `no HttpOnly: ${c}`);
    assert(/;\s*SameSite=Lax/i.test(c), `no SameSite=Lax: ${c}`);
    assert(/;\s*Path=\//i.test(c), `no Path=/: ${c}`);
    const maxAge = Number(/Max-Age=(\d+)/i.exec(c)?.[1]);
    assert(maxAge > 8 * 3600 - 120 && maxAge <= 8 * 3600, `Max-Age ${maxAge}`);
    if (new URL(BASE).protocol === "http:") assert(!/;\s*Secure/i.test(c), `Secure over http would break login: ${c}`);
  });
  await check("duplicate registration (different letter case) -> 409 EMAIL_TAKEN", async () => {
    const r = await call("/api/auth/register", { method: "POST", body: { fullName: "Dup", email: emailA.toUpperCase(), password: PASSWORD, confirmPassword: PASSWORD } });
    assert(r.status === 409 && r.json?.error?.code === "EMAIL_TAKEN", `status ${r.status}`);
    assert(r.json.error.fields?.email, "no field message");
    assert(!sessionCookieHeader(r), "a failed registration must not set a session");
  });

  heading("4. Authenticated access");
  await check("GET /api/auth/me with the cookie -> 200 and the right instructor", async () => {
    const r = await call("/api/auth/me", { cookie: tokenA });
    assert(r.status === 200 && r.json?.instructor?.email === emailA, `status ${r.status}`);
  });
  await check("GET /dashboard with the cookie -> 200 and greets the instructor", async () => {
    const r = await call("/dashboard", { cookie: tokenA });
    assert(r.status === 200, `status ${r.status}`);
    assert(r.text.includes("Smoke Teacher"), "name not on the page");
    assert(!r.text.includes("passwordHash"), "hash leaked into the page");
  });
  await check("a signed-in instructor visiting /login is sent to /dashboard", async () => {
    const r = await call("/login", { cookie: tokenA });
    return redirectsTo(r, "/dashboard") ?? assert(false, `status ${r.status}, no redirect to /dashboard`);
  });

  heading("5. Logout");
  await check("logout without Origin is blocked and does NOT end the session", async () => {
    const r = await call("/api/auth/logout", { method: "POST", origin: null, cookie: tokenA });
    assert(r.status === 403, `status ${r.status}`);
    const me = await call("/api/auth/me", { cookie: tokenA });
    assert(me.status === 200, "session was ended by a forged logout");
  });
  await check("logout -> 200 and the cookie is cleared", async () => {
    const r = await call("/api/auth/logout", { method: "POST", cookie: tokenA, body: {} });
    assert(r.status === 200 && r.json?.ok === true, `status ${r.status}`);
    const c = sessionCookieHeader(r);
    assert(c && /Max-Age=0/i.test(c) && c.startsWith(`${COOKIE}=;`), `cookie not cleared: ${c}`);
  });
  await check("the OLD cookie no longer works (session destroyed on the server) -> 401", async () => {
    const r = await call("/api/auth/me", { cookie: tokenA });
    assert(r.status === 401, `status ${r.status}: a stolen/old cookie still works after logout`);
  });
  await check("the OLD cookie no longer opens /dashboard", async () => {
    const r = await call("/dashboard", { cookie: tokenA });
    return redirectsTo(r, "/login") ?? assert(false, `status ${r.status}`);
  });
  await check("logging out again with no session is harmless (200)", async () => {
    const r = await call("/api/auth/logout", { method: "POST", body: {} });
    assert(r.status === 200, `status ${r.status}`);
  });

  heading("6. Login");
  await check("wrong password -> 401 INVALID_CREDENTIALS, no cookie", async () => {
    const r = await call("/api/auth/login", { method: "POST", body: { email: emailA, password: "wrong password!" } });
    assert(r.status === 401 && r.json?.error?.code === "INVALID_CREDENTIALS", `status ${r.status}`);
    assert(!sessionCookieHeader(r), "cookie set on failure");
  });
  await check("unknown e-mail gives the identical response (no account enumeration)", async () => {
    const wrong = await call("/api/auth/login", { method: "POST", body: { email: emailA, password: "wrong password!" } });
    const unknown = await call("/api/auth/login", { method: "POST", body: { email: `phase2-smoke-${run}-ghost@example.test`, password: "wrong password!" } });
    assert(unknown.status === wrong.status, `status ${unknown.status} vs ${wrong.status}`);
    assert(unknown.json?.error?.message === wrong.json?.error?.message, "messages differ");
  });
  let tokenA2;
  await check("correct login (e-mail in capitals) -> 200 and a working session", async () => {
    const r = await call("/api/auth/login", { method: "POST", body: { email: emailA.toUpperCase(), password: PASSWORD } });
    assert(r.status === 200 && r.json?.instructor?.email === emailA, `status ${r.status}`);
    tokenA2 = tokenFrom(r);
    assert(tokenA2 && tokenA2 !== tokenA, "expected a fresh token");
    const me = await call("/api/auth/me", { cookie: tokenA2 });
    assert(me.status === 200, `me status ${me.status}`);
  });
  await check("behind HTTPS (X-Forwarded-Proto: https) the cookie becomes Secure", async () => {
    const r = await call("/api/auth/login", { method: "POST", headers: { "x-forwarded-proto": "https" }, body: { email: emailA, password: PASSWORD } });
    const c = sessionCookieHeader(r);
    assert(c && /;\s*Secure/i.test(c), `no Secure flag: ${c}`);
  });

  heading("7. Brute-force throttle");
  await check("5 wrong passwords, then even the right one is refused with 429 + Retry-After", async () => {
    const reg = await call("/api/auth/register", { method: "POST", body: { fullName: "Throttle", email: emailB, password: PASSWORD, confirmPassword: PASSWORD } });
    assert(reg.status === 201, `setup registration failed: ${reg.status}`);
    for (let i = 1; i <= 5; i++) {
      const r = await call("/api/auth/login", { method: "POST", body: { email: emailB, password: `wrong ${i}` } });
      assert(r.status === 401, `attempt ${i}: status ${r.status}`);
    }
    const blocked = await call("/api/auth/login", { method: "POST", body: { email: emailB, password: PASSWORD } });
    assert(blocked.status === 429 && blocked.json?.error?.code === "TOO_MANY_ATTEMPTS", `status ${blocked.status}`);
    assert(Number(blocked.res.headers.get("retry-after")) > 0, "no Retry-After header");
    assert(!sessionCookieHeader(blocked), "cookie issued while blocked");
  });
  await check("the throttle is per e-mail: another account can still log in", async () => {
    const r = await call("/api/auth/login", { method: "POST", body: { email: emailA, password: PASSWORD } });
    assert(r.status === 200, `status ${r.status}`);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(`(test accounts ${emailA} and ${emailB} remain until \`npm test\` or the cleanup SQL is run)`);
  if (failed > 0) {
    console.log("AUTH SMOKE TEST FAILED");
    process.exit(1);
  }
  console.log("AUTH SMOKE TEST PASSED");
}

main().catch((error) => {
  console.error("smoke test crashed:", error);
  process.exit(1);
});
