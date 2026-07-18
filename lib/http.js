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

// ---------------------------------------------------------------------
// Cookies (used by the /admin password gate — see lib/auth.js)

// Cloudflare sets this to the real client IP on every request (the Worker
// runtime, not something a client can spoof by sending its own header of
// the same name -- Cloudflare overwrites it at the edge). Used for the
// /admin login rate limiter.
export function getClientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

export function getCookie(request, name) {
  const header = request.headers.get("Cookie") || request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

// `secure` defaults to true (required for SameSite cookies to be reliable
// and correct in production over HTTPS); pass secure:false only for local
// http://localhost dev, where a Secure cookie would silently be refused by
// the browser.
export function buildSetCookie(name, value, { maxAge, clear = false, secure = true } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (secure) parts.push("Secure");
  parts.push(clear ? "Max-Age=0" : `Max-Age=${maxAge}`);
  return parts.join("; ");
}
