// End-to-end mock test harness for the standalone next-chapter-salon project.
// Uses node:sqlite (real SQLite engine) loaded with the actual schema.sql,
// wrapped in a D1-compatible shim, then drives the real router.js /
// pages/*.js / api/*.js against it — exercises real SQL + real business
// logic without needing a live Workers runtime.

// Run with: node tests/e2e.test.mjs  (or `npm test`)
// Requires Node 22+ for node:sqlite (still experimental as of Node 22 -- a
// harmless warning is expected). No network access, no wrangler dev server,
// no live Cloudflare resources needed -- this loads schema.sql into a real
// in-memory SQLite database via node:sqlite, wraps it in a D1-compatible
// shim, and drives the actual router.js / pages/*.js / api/*.js against it.
// Re-run this any time you touch routing, db.js, or any page/api file to
// catch regressions before deploying.

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { routeNextChapterSalon } from "../router.js";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// ---------------------------------------------------------------------
// D1 shim backed by node:sqlite

class D1Shim {
  constructor(db) { this.db = db; }
  prepare(sql) { return new Stmt(this.db, sql); }
}
class Stmt {
  constructor(db, sql) { this.db = db; this.sql = sql; this.params = []; }
  bind(...args) { this.params = args.map((a) => (a === undefined ? null : a)); return this; }
  async all() {
    const rows = this.db.prepare(this.sql).all(...this.params);
    return { results: rows, success: true, meta: {} };
  }
  async first() {
    const row = this.db.prepare(this.sql).get(...this.params);
    return row ?? null;
  }
  async run() {
    const info = this.db.prepare(this.sql).run(...this.params);
    return { success: true, meta: { last_row_id: Number(info.lastInsertRowid), changes: info.changes } };
  }
}

const sqlite = new DatabaseSync(":memory:");
const schema = readFileSync(`${ROOT}/schema.sql`, "utf8");
sqlite.exec(schema);
const DB = new D1Shim(sqlite);

// Minimal in-memory R2 shim -- enough to exercise api/upload-image.js and
// pages/image-serve.js (auth gating, content-type validation, round-trip
// put/get) without a live R2 bucket. Real crop/zoom happens client-side in
// the browser via <canvas>, so there's nothing to test there in Node.
class R2Shim {
  constructor() { this.store = new Map(); }
  async put(key, value, opts) {
    const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : value;
    this.store.set(key, { bytes, httpMetadata: (opts && opts.httpMetadata) || {} });
  }
  async get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    return {
      body: entry.bytes,
      httpEtag: `"${key}"`,
      writeHttpMetadata(headers) {
        if (entry.httpMetadata.contentType) headers.set("content-type", entry.httpMetadata.contentType);
        if (entry.httpMetadata.cacheControl) headers.set("cache-control", entry.httpMetadata.cacheControl);
      },
    };
  }
}

const env = {
  DB,
  IMAGES: new R2Shim(),
  SITE_URL: "http://localhost:8787",
};
const ctx = { waitUntil: (p) => p };

let pass = 0, fail = 0;
const failures = [];

async function call(method, pathWithQuery, body) {
  const u = new URL(`http://localhost${pathWithQuery}`);
  const request = new Request(u.toString(), {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return routeNextChapterSalon(request, env, ctx, u.pathname, method);
}

// Same as call(), but lets a test attach a Cookie header (for /admin session
// tests), a CF-Connecting-IP header (for rate-limit tests), a raw binary
// body with its own Content-Type (for /api/upload-image), and inspect the
// raw Response (for reading Set-Cookie back out).
async function callRaw(method, pathWithQuery, { body, cookie, ip, rawBody, contentType } = {}) {
  const u = new URL(`http://localhost${pathWithQuery}`);
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (rawBody && contentType) headers["Content-Type"] = contentType;
  if (cookie) headers["Cookie"] = cookie;
  if (ip) headers["CF-Connecting-IP"] = ip;
  const request = new Request(u.toString(), {
    method,
    headers,
    body: rawBody !== undefined ? rawBody : (body ? JSON.stringify(body) : undefined),
  });
  return routeNextChapterSalon(request, env, ctx, u.pathname, method);
}

async function check(name, fn) {
  try {
    await fn();
    pass++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    fail++;
    failures.push({ name, err });
    console.log(`  FAIL  ${name} — ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

const MANAGE_TOKEN = "NCS-DCCDEA769DFD";

console.log("=== Marketing pages ===");
for (const path of ["/", "/about", "/services", "/gallery", "/team", "/testimonials", "/policies", "/contact", "/gift-cards", "/booking"]) {
  await check(`GET ${path} -> 200 HTML`, async () => {
    const res = await call("GET", path);
    assert(res, "router returned null (no route matched)");
    assert(res.status === 200, `expected 200, got ${res.status}`);
    const text = await res.text();
    assert(text.includes("<html") || text.includes("<!DOCTYPE"), "response doesn't look like HTML");
    assert(!/\/next-chapter-salon\//.test(text), "found leftover /next-chapter-salon/ path in HTML");
  });
}

console.log("=== Availability API ===");
let firstSlotStartAt = null;
await check("GET /api/availability for Signature Balayage (service 1)", async () => {
  const today = new Date();
  const from = today.toISOString().slice(0, 10);
  const toDate = new Date(today.getTime() + 13 * 86400000);
  const to = toDate.toISOString().slice(0, 10);
  const res = await call("GET", `/api/availability?serviceId=1&from=${from}&to=${to}`);
  assert(res.status === 200, `expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.ok, "response not ok: " + JSON.stringify(data));
  const dates = Object.keys(data.slotsByDate || {});
  assert(dates.length > 0, "no dates in slotsByDate");
  let found = null;
  for (const d of dates) {
    if (data.slotsByDate[d].length > 0) { found = data.slotsByDate[d][0]; break; }
  }
  assert(found, "no slots found in any date");
  firstSlotStartAt = found.startAt;
});

console.log("=== Booking flow (create -> dashboard -> accept) ===");
let customerManageToken = null;
let createdAppointmentId = null;

await check("POST /api/create-appointment", async () => {
  assert(firstSlotStartAt, "no slot available from previous test");
  const res = await call("POST", "/api/create-appointment", {
    serviceId: 1,
    customerName: "<script>alert(1)</script>Jane XSS",
    customerEmail: "jane@example.com",
    customerPhone: "555-1212",
    notes: "Testing overlap + XSS",
    startAt: firstSlotStartAt,
  });
  const data = await res.json();
  assert(res.status === 200, `expected 200, got ${res.status}: ${JSON.stringify(data)}`);
  assert(data.ok, "create-appointment not ok: " + JSON.stringify(data));
  assert(data.manageToken, "no manageToken returned");
  customerManageToken = data.manageToken;
});

await check("GET /my-appointment/:token renders (customer name intentionally not shown on this page)", async () => {
  const res = await call("GET", `/my-appointment/${customerManageToken}`);
  assert(res.status === 200, `expected 200, got ${res.status}`);
});

await check("GET /dashboard/:manageToken HTML escapes customer_name (XSS check)", async () => {
  const res = await call("GET", `/dashboard/${MANAGE_TOKEN}`);
  const text = await res.text();
  // The dashboard renders customer_name client-side via JS from /api/dashboard-data,
  // so the raw shell won't contain it -- the real check is that dashboard.js's
  // render functions call escapeHtml() on customer_name, verified separately below.
  assert(res.status === 200, `expected 200, got ${res.status}`);
});

await check("dashboard.js source escapes customer_name in every render path", async () => {
  const src = readFileSync(`${ROOT}/pages/dashboard.js`, "utf8");
  const customerNameLines = src.split("\n").filter((l) => l.includes("customer_name"));
  assert(customerNameLines.length > 0, "no customer_name usage found in dashboard.js");
  for (const line of customerNameLines) {
    assert(line.includes("escapeHtml(") && /escapeHtml\([^)]*customer_name/.test(line), `unescaped customer_name usage: ${line.trim()}`);
  }
});

await check("GET /dashboard/:manageToken renders", async () => {
  const res = await call("GET", `/dashboard/${MANAGE_TOKEN}`);
  assert(res.status === 200, `expected 200, got ${res.status}`);
  const text = await res.text();
  assert(text.includes("<html") || text.includes("<!DOCTYPE"), "dashboard doesn't look like HTML");
});

await check("GET /api/dashboard-data with correct token -> 200, appointment pending", async () => {
  const res = await call("GET", `/api/dashboard-data?manageToken=${MANAGE_TOKEN}`);
  assert(res.status === 200, `expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.ok, "dashboard-data not ok");
  assert(Array.isArray(data.pending) && data.pending.length >= 1, "pending queue empty");
  createdAppointmentId = data.pending[0].id;
  assert(data.clients.length >= 1, "client directory empty");
});

await check("GET /api/dashboard-data with WRONG token -> 401", async () => {
  const res = await call("GET", `/api/dashboard-data?manageToken=WRONG-TOKEN`);
  assert(res.status === 401, `expected 401, got ${res.status}`);
});

await check("POST /api/accept-appointment confirms it", async () => {
  const res = await call("POST", "/api/accept-appointment", {
    manageToken: MANAGE_TOKEN,
    appointmentId: createdAppointmentId,
  });
  const data = await res.json();
  assert(res.status === 200, `expected 200, got ${res.status}: ${JSON.stringify(data)}`);
  assert(data.ok, "accept-appointment not ok: " + JSON.stringify(data));
});

await check("Re-accepting an already-confirmed appointment -> 409", async () => {
  const res = await call("POST", "/api/accept-appointment", {
    manageToken: MANAGE_TOKEN,
    appointmentId: createdAppointmentId,
  });
  assert(res.status === 409, `expected 409, got ${res.status}`);
});

await check("POST /api/accept-appointment with wrong owner token -> 401", async () => {
  const res = await call("POST", "/api/accept-appointment", {
    manageToken: "WRONG",
    appointmentId: createdAppointmentId,
  });
  assert(res.status === 401, `expected 401, got ${res.status}`);
});

console.log("=== Overlap / downtime double-booking ===");
let secondApptId = null;
await check("POST second overlapping appointment (haircut into balayage downtime)", async () => {
  const res = await call("POST", "/api/create-appointment", {
    serviceId: 5,
    customerName: "Overlap Client",
    customerEmail: "overlap@example.com",
    startAt: firstSlotStartAt,
  });
  const data = await res.json();
  assert(res.status === 200, `expected 200, got ${res.status}: ${JSON.stringify(data)}`);
  assert(data.ok, "overlapping booking was rejected, should be ALLOWED: " + JSON.stringify(data));
});

await check("Dashboard flags the overlap via conflictCount", async () => {
  const res = await call("GET", `/api/dashboard-data?manageToken=${MANAGE_TOKEN}`);
  const data = await res.json();
  const overlapping = data.pending.find((p) => p.customer_name === "Overlap Client");
  assert(overlapping, "overlapping appointment not found in pending queue");
  assert(overlapping.conflictCount >= 1, `expected conflictCount >= 1, got ${overlapping.conflictCount}`);
  secondApptId = overlapping.id;
});

await check("Decline the overlapping one", async () => {
  const res = await call("POST", "/api/decline-appointment", {
    manageToken: MANAGE_TOKEN,
    appointmentId: secondApptId,
    reason: "Test decline",
  });
  const data = await res.json();
  assert(res.status === 200, `expected 200, got ${res.status}: ${JSON.stringify(data)}`);
  assert(data.ok, "decline-appointment not ok");
});

console.log("=== Manual (walk-in) appointment ===");
await check("POST /api/manual-appointment creates a confirmed appointment directly", async () => {
  const res = await call("POST", "/api/manual-appointment", {
    manageToken: MANAGE_TOKEN,
    serviceId: 6,
    customerName: "Walk-in Wendy",
    customerEmail: "wendy@example.com",
    startAt: new Date(Date.now() + 3 * 86400000).toISOString(),
  });
  const data = await res.json();
  assert(res.status === 200, `expected 200, got ${res.status}: ${JSON.stringify(data)}`);
  assert(data.ok, "manual-appointment not ok: " + JSON.stringify(data));
});

await check("POST /api/manual-appointment rejects a date in the past", async () => {
  const res = await call("POST", "/api/manual-appointment", {
    manageToken: MANAGE_TOKEN,
    serviceId: 6,
    customerName: "Yesterday Yolanda",
    customerEmail: "yolanda@example.com",
    startAt: new Date(Date.now() - 3 * 86400000).toISOString(),
  });
  const data = await res.json();
  assert(res.status === 400, `expected 400, got ${res.status}: ${JSON.stringify(data)}`);
  assert(/past date/i.test(data.error || ""), "expected a past-date error, got: " + JSON.stringify(data));
});

await check("POST /api/manual-appointment allows a time earlier today (logging a walk-in after the fact)", async () => {
  const res = await call("POST", "/api/manual-appointment", {
    manageToken: MANAGE_TOKEN,
    serviceId: 6,
    customerName: "Just Now Jamie",
    customerEmail: "jamie@example.com",
    startAt: new Date(Date.now() - 5 * 60000).toISOString(), // 5 minutes ago, still today
  });
  const data = await res.json();
  assert(res.status === 200 && data.ok, "expected an earlier-today walk-in to be allowed: " + JSON.stringify(data));
});

console.log("=== Cancellation ===");
await check("POST /api/cancel-appointment (customer self-service)", async () => {
  const res = await call("POST", "/api/cancel-appointment", { manageToken: customerManageToken });
  const data = await res.json();
  assert(res.status === 200, `expected 200, got ${res.status}: ${JSON.stringify(data)}`);
  assert(data.ok, "cancel-appointment not ok: " + JSON.stringify(data));
});

await check("Canceling again is idempotent (still ok, stays canceled)", async () => {
  const res = await call("POST", "/api/cancel-appointment", { manageToken: customerManageToken });
  const data = await res.json();
  assert(res.status === 200 && data.ok, "expected idempotent cancel to still return ok:true");
});

console.log("=== Calendar feed ===");
await check("GET /feed/:manageToken.ics returns valid ICS", async () => {
  const res = await call("GET", `/feed/${MANAGE_TOKEN}.ics`);
  assert(res.status === 200, `expected 200, got ${res.status}`);
  const text = await res.text();
  assert(text.includes("BEGIN:VCALENDAR"), "missing VCALENDAR header");
  assert(text.includes("PRODID:-//nextchaptersalon.com"), "PRODID not updated: " + (text.match(/PRODID:.*/) || [""])[0]);
});

await check("GET /feed/:badtoken.ics -> 404", async () => {
  const res = await call("GET", `/feed/BOGUS.ics`);
  assert(res.status === 404, `expected 404, got ${res.status}`);
});

console.log("=== Contact form ===");
await check("POST /api/contact saves an inquiry", async () => {
  const res = await call("POST", "/api/contact", {
    name: "Contact Tester",
    email: "contact@example.com",
    message: "Do you do bridal updos?",
  });
  const data = await res.json();
  assert(res.status === 200, `expected 200, got ${res.status}: ${JSON.stringify(data)}`);
  assert(data.ok, "contact not ok");
});

console.log("=== Settings / services / stylists / content management ===");
await check("POST /api/manage-settings updates business info", async () => {
  const res = await call("POST", "/api/manage-settings", {
    manageToken: MANAGE_TOKEN,
    settings: {
      businessName: "Next Chapter Salon",
      tagline: "Updated Tagline",
      notifyEmail: "dantheanonymous@gmail.com",
      timezone: "America/Chicago",
    },
  });
  const data = await res.json();
  assert(res.status === 200, `expected 200, got ${res.status}: ${JSON.stringify(data)}`);
  assert(data.ok, "manage-settings not ok: " + JSON.stringify(data));
});

await check("POST /api/manage-settings with invalid timezone -> rejected, not crashed", async () => {
  const res = await call("POST", "/api/manage-settings", {
    manageToken: MANAGE_TOKEN,
    settings: {
      businessName: "Next Chapter Salon",
      notifyEmail: "dantheanonymous@gmail.com",
      timezone: "Not/ARealZone",
    },
  });
  assert(res.status === 400, `expected 400 for invalid timezone, got ${res.status}`);
  const data = await res.json();
  assert(data.ok === false, "expected ok:false on 400");
});

await check("GET /api/dashboard-data reflects updated tagline", async () => {
  const res = await call("GET", `/api/dashboard-data?manageToken=${MANAGE_TOKEN}`);
  const data = await res.json();
  assert(data.settings.tagline === "Updated Tagline", `tagline not updated, got: ${data.settings.tagline}`);
});

console.log("=== /admin password gate ===");
let adminCookie = null;

await check("GET /admin with no password set yet -> first-time setup form", async () => {
  const res = await callRaw("GET", "/admin");
  assert(res.status === 200, `expected 200, got ${res.status}`);
  const text = await res.text();
  assert(/create your admin password/i.test(text), "expected first-time setup copy, got something else");
});

await check("POST /api/admin-login with short password -> rejected", async () => {
  const res = await callRaw("POST", "/api/admin-login", { body: { password: "short" } });
  assert(res.status === 400, `expected 400, got ${res.status}`);
});

await check("POST /api/admin-login sets the password on first use and returns a cookie", async () => {
  const res = await callRaw("POST", "/api/admin-login", { body: { password: "test-password-123" } });
  const data = await res.json();
  assert(res.status === 200 && data.ok, "first-time admin-login not ok: " + JSON.stringify(data));
  const setCookie = res.headers.get("Set-Cookie") || res.headers.get("set-cookie");
  assert(setCookie && setCookie.includes("ncs_admin="), "no ncs_admin cookie in Set-Cookie header");
  adminCookie = setCookie.split(";")[0]; // "ncs_admin=<value>"
});

await check("GET /admin again now shows a login form, not first-time setup", async () => {
  const res = await callRaw("GET", "/admin");
  const text = await res.text();
  assert(/admin login/i.test(text) && !/create your admin password/i.test(text), "still showing first-time setup after password was set");
});

await check("POST /api/admin-login with wrong password -> 401", async () => {
  const res = await callRaw("POST", "/api/admin-login", { body: { password: "totally-wrong-password" } });
  assert(res.status === 401, `expected 401, got ${res.status}`);
});

await check("POST /api/admin-login with correct password -> ok + cookie", async () => {
  const res = await callRaw("POST", "/api/admin-login", { body: { password: "test-password-123" } });
  const data = await res.json();
  assert(res.status === 200 && data.ok, "correct-password login not ok: " + JSON.stringify(data));
});

await check("GET /admin with valid cookie renders the actual dashboard", async () => {
  const res = await callRaw("GET", "/admin", { cookie: adminCookie });
  assert(res.status === 200, `expected 200, got ${res.status}`);
  const text = await res.text();
  assert(/Owner Dashboard/i.test(text) && /Pending Requests/i.test(text), "cookie-authenticated /admin didn't render the dashboard");
});

await check("Dashboard renders a webcal:// subscribe link and a downloadable .ics link", async () => {
  const res = await call("GET", `/dashboard/${MANAGE_TOKEN}`);
  const text = await res.text();
  assert(/href="webcal:\/\/[^"]+\/feed\/[^"]+\.ics"/.test(text), "no webcal:// subscribe link found");
  assert(/href="https?:\/\/[^"]+\/feed\/[^"]+\.ics"\s+download=/.test(text), "no downloadable .ics link found");
});

await check("GET /admin with garbage cookie -> still shows login, not dashboard", async () => {
  const res = await callRaw("GET", "/admin", { cookie: "ncs_admin=not-the-real-token" });
  const text = await res.text();
  assert(/admin login/i.test(text), "invalid cookie should not grant dashboard access");
});

console.log("=== /api/admin-login rate limiting ===");

await check("8 failed attempts from one IP, then a 9th is rate limited (429)", async () => {
  const ip = "203.0.113.50";
  for (let i = 0; i < 8; i++) {
    const res = await callRaw("POST", "/api/admin-login", { body: { password: "wrong-password-" + i }, ip });
    assert(res.status === 401, `attempt ${i + 1}: expected 401, got ${res.status}`);
  }
  const locked = await callRaw("POST", "/api/admin-login", { body: { password: "wrong-password-9" }, ip });
  assert(locked.status === 429, `9th attempt: expected 429, got ${locked.status}`);
});

await check("rate limit applies even to the correct password once locked out", async () => {
  const ip = "203.0.113.50"; // same IP as previous test, already at 8 failures
  const res = await callRaw("POST", "/api/admin-login", { body: { password: "test-password-123" }, ip });
  assert(res.status === 429, `expected 429 even with correct password, got ${res.status}`);
});

await check("a different IP is unaffected by another IP's lockout", async () => {
  const res = await callRaw("POST", "/api/admin-login", { body: { password: "test-password-123" }, ip: "198.51.100.7" });
  const data = await res.json();
  assert(res.status === 200 && data.ok, "fresh IP should not be rate limited: " + JSON.stringify(data));
});

await check("POST /api/admin-logout clears the cookie", async () => {
  const res = await callRaw("POST", "/api/admin-logout");
  const setCookie = res.headers.get("Set-Cookie") || res.headers.get("set-cookie");
  assert(setCookie && setCookie.includes("Max-Age=0"), "logout should clear the cookie with Max-Age=0");
});

console.log("=== /api/upload-image + /images/:key ===");

await check("POST /api/upload-image with no manageToken -> 401", async () => {
  const res = await callRaw("POST", "/api/upload-image", { rawBody: new Uint8Array([1, 2, 3]).buffer, contentType: "image/jpeg" });
  assert(res.status === 401, `expected 401, got ${res.status}`);
});

await check("POST /api/upload-image with wrong manageToken -> 401", async () => {
  const res = await callRaw("POST", "/api/upload-image?manageToken=not-real", { rawBody: new Uint8Array([1, 2, 3]).buffer, contentType: "image/jpeg" });
  assert(res.status === 401, `expected 401, got ${res.status}`);
});

await check("POST /api/upload-image with unsupported content-type -> 400", async () => {
  const res = await callRaw("POST", `/api/upload-image?manageToken=${MANAGE_TOKEN}`, { rawBody: new Uint8Array([1, 2, 3]).buffer, contentType: "text/plain" });
  assert(res.status === 400, `expected 400, got ${res.status}`);
});

await check("POST /api/upload-image with valid token + image bytes -> stores in R2, returns /images/:key", async () => {
  const fakeJpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3, 4]).buffer;
  const res = await callRaw("POST", `/api/upload-image?manageToken=${MANAGE_TOKEN}`, { rawBody: fakeJpegBytes, contentType: "image/jpeg" });
  assert(res.status === 200, `expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.ok && /^\/images\/[\w-]+\.jpg$/.test(data.url), "expected an /images/<uuid>.jpg url, got: " + JSON.stringify(data));

  const getRes = await call("GET", data.url);
  assert(getRes.status === 200, `GET the uploaded image: expected 200, got ${getRes.status}`);
  assert(getRes.headers.get("content-type") === "image/jpeg", "wrong content-type on retrieval: " + getRes.headers.get("content-type"));
  const bytesBack = new Uint8Array(await getRes.arrayBuffer());
  assert(bytesBack.length === 8 && bytesBack[0] === 0xff, "roundtripped bytes don't match what was uploaded");
});

await check("GET /images/:key for a key that doesn't exist -> 404", async () => {
  const res = await call("GET", "/images/does-not-exist.jpg");
  assert(res.status === 404, `expected 404, got ${res.status}`);
});

await check("/dashboard/:manageToken direct link still works unchanged", async () => {
  const res = await call("GET", `/dashboard/${MANAGE_TOKEN}`);
  assert(res.status === 200, `expected 200, got ${res.status}`);
});

console.log(`\n=== Results: ${pass} passed, ${fail} failed (${pass + fail} total) ===`);
if (failures.length) {
  console.log("\nFailure details:");
  for (const f of failures) {
    console.log(`- ${f.name}: ${f.err.stack || f.err.message}`);
  }
  process.exit(1);
}
