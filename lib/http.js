// Shared request/HTML-safety helpers — same reasoning as
// booking-system/lib/http.js, copied rather than imported so this folder
// stays self-contained (see that file for the full writeup of both issues
// below; kept brief here to avoid duplicating a wall of comments).

// getOrigin(): wrangler dev rewrites both request.url and the Host header to
// match the configured custom_domain route, so neither is reliable for
// building local-dev links. env.SITE_URL (set only in .dev.vars) overrides
// it for local dev; production gets a real Host header and needs no override.
export function getOrigin(request, env) {
  if (env && env.SITE_URL) return env.SITE_URL.replace(/\/+$/, "");
  const url = new URL(request.url);
  const host = request.headers.get("host");
  return host ? `${url.protocol}//${host}` : url.origin;
}

// toScriptJson(): JSON.stringify(...) embedded raw into an inline <script>
// tag is unsafe for user-controlled data — the HTML parser looks for
// "</script" as raw bytes, so a value containing that sequence closes the
// tag early regardless of JS string-escaping. Escaping "<" as < keeps
// the JS value identical while making that impossible.
export function toScriptJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
