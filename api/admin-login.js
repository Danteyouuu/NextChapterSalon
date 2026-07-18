// POST /api/admin-login
// Body: { password }
//
// If no admin password has ever been set (settings.admin_password_hash is
// NULL), this is first-time setup: whatever password is submitted becomes
// the password. Otherwise it's verified against the stored hash. On
// success, sets an HttpOnly cookie holding the real manage_token — see
// lib/auth.js for why that's the right value to store.
//
// Rate limited per-IP (8 failed attempts / 15 minutes) via
// ncs_login_attempts — password hashing here is intentionally low-tech
// (see lib/auth.js), so without this an attacker could brute-force online
// at whatever rate the network allows. First-time setup attempts count
// against the same limit so the bootstrap window can't be hammered either.

import { getSettings, updateSettings, countRecentFailedLogins, recordFailedLogin } from "../lib/db.js";
import { generateSalt, hashPassword, verifyPassword, ADMIN_COOKIE_NAME, ADMIN_COOKIE_MAX_AGE } from "../lib/auth.js";
import { buildSetCookie, getClientIp } from "../lib/http.js";

const MAX_FAILED_ATTEMPTS = 8;

export async function onRequestPost(context) {
  const { request, env } = context;
  let data;
  try {
    data = await request.json();
  } catch (err) {
    return json({ ok: false, error: "Invalid request body" }, 400);
  }

  const ip = getClientIp(request);
  const recentFailures = await countRecentFailedLogins(env, ip);
  if (recentFailures >= MAX_FAILED_ATTEMPTS) {
    return json({ ok: false, error: "Too many attempts. Please try again in 15 minutes." }, 429);
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
    if (!valid) {
      await recordFailedLogin(env, ip);
      return json({ ok: false, error: "Incorrect password." }, 401);
    }
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
