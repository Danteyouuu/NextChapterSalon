// Worker entry point for the standalone Next Chapter Salon site.
//
// Thin by design — all actual routing lives in router.js (see that file for
// why). This just: (1) calls routeNextChapterSalon() for every request and
// falls through to static assets if nothing matched, and (2) runs the
// hourly appointment-reminder sweep + login-rate-limit table cleanup on a
// cron trigger (see wrangler.toml).

import { routeNextChapterSalon } from "../router.js";
import { sendAppointmentReminders } from "../lib/reminders.js";
import { pruneOldLoginAttempts } from "../lib/db.js";

// Baseline security headers applied to every response (pages, APIs, and
// static assets alike). CSP keeps 'unsafe-inline' for script/style because
// the site renders inline <script>/style="" throughout (see pages/*.js) —
// a nonce-based rewrite is a bigger job than this pass covers — but still
// meaningfully blocks framing (clickjacking), object/embed, base-tag
// injection, and loading of any *remote* script an XSS payload might try
// to pull in. Google Fonts is the only real cross-origin dependency.
function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  headers.set("Permissions-Policy", "geolocation=(), camera=(), microphone=()");
  headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; ")
  );
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    try {
      const response = await routeNextChapterSalon(request, env, ctx, path, method);
      if (response) return withSecurityHeaders(response);
    } catch (err) {
      return new Response(`Server error: ${err && err.message ? err.message : String(err)}`, { status: 500 });
    }

    // Everything else (theme.css, shared.js, logo/favicon images) is a
    // static file served straight from the [assets] binding.
    const asset = await env.ASSETS.fetch(request);
    return withSecurityHeaders(asset);
  },

  // Cron Trigger (see [triggers] in wrangler.toml) — fires the 23-25-hour-out
  // appointment reminder sweep once an hour. waitUntil keeps the invocation
  // alive past the point scheduled() itself returns, since the work is async.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendAppointmentReminders(env));
    ctx.waitUntil(pruneOldLoginAttempts(env));
  },
};
