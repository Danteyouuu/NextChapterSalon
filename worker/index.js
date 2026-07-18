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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    try {
      const response = await routeNextChapterSalon(request, env, ctx, path, method);
      if (response) return response;
    } catch (err) {
      return new Response(`Server error: ${err && err.message ? err.message : String(err)}`, { status: 500 });
    }

    // Everything else (theme.css, shared.js, logo/favicon images) is a
    // static file served straight from the [assets] binding.
    return env.ASSETS.fetch(request);
  },

  // Cron Trigger (see [triggers] in wrangler.toml) — fires the 23-25-hour-out
  // appointment reminder sweep once an hour. waitUntil keeps the invocation
  // alive past the point scheduled() itself returns, since the work is async.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendAppointmentReminders(env));
    ctx.waitUntil(pruneOldLoginAttempts(env));
  },
};
