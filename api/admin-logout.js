// POST /api/admin-logout — clears the /admin session cookie.

import { ADMIN_COOKIE_NAME } from "../lib/auth.js";
import { buildSetCookie } from "../lib/http.js";

export async function onRequestPost(context) {
  const { request } = context;
  const secure = new URL(request.url).protocol === "https:";
  const cookie = buildSetCookie(ADMIN_COOKIE_NAME, "", { clear: true, secure });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Set-Cookie": cookie },
  });
}
