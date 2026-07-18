// POST /api/admin-login
// Body: { password }
//
// If no admin password has ever been set (settings.admin_password_hash is
// NULL), this is first-time setup: whatever password is submitted becomes
// the password. Otherwise it's verified against the stored hash. On
// success, sets an HttpOnly cookie holding the real manage_token — see
// lib/auth.js for why that's the right value to store.

import { getSettings, updateSettings } from "../lib/db.js";
import { generateSalt, hashPassword, verifyPassword, ADMIN_COOKIE_NAME, ADMIN_COOKIE_MAX_AGE } from "../lib/auth.js";
import { buildSetCookie } from "../lib/http.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  let data;
  try {
    data = await request.json();
  } catch (err) {
    return json({ ok: false, error: "Invalid request body" }, 400);
  }

  const password = String(data.password || "");
  if (password.length < 8) {
    return json({ ok: false, error: "Password must be at least 8 characters." }, 400);
  }

  const settings = await getSettings(env);
  if (!settings) return json({ ok: false, error: "Salon not configured" }, 500);

  if (!settings.admin_password_hash) {
    // First-time setup — whoever gets here first sets the password. This
    // window is only open until the first password is set, same as leaving
    // a brand-new admin panel unconfigured; set it immediately after deploy.
    const salt = generateSalt();
    const hash = await hashPassword(password, salt);
    await updateSettings(env, { admin_password_hash: hash, admin_password_salt: salt });
  } else {
    const valid = await verifyPassword(password, settings.admin_password_salt, settings.admin_password_hash);
    if (!valid) return json({ ok: false, error: "Incorrect password." }, 401);
  }

  const secure = new URL(request.url).protocol === "https:";
  const cookie = buildSetCookie(ADMIN_COOKIE_NAME, settings.manage_token, { maxAge: ADMIN_COOKIE_MAX_AGE, secure });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Set-Cookie": cookie },
  });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
