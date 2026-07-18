// Owner-dashboard auth — the API layer's trust model is still "the private
// link IS the credential" (booking-system's original approach). Every admin
// API call includes manageToken in its JSON body; this checks it against the
// single ncs_settings row and returns the settings row on success or null.

import { getSettingsByManageToken } from "./db.js";

export async function requireOwner(env, manageToken) {
  if (!manageToken) return null;
  return await getSettingsByManageToken(env, String(manageToken));
}

// ---------------------------------------------------------------------
// /admin password gate
//
// The API auth above is unchanged -- every request still ultimately proves
// itself with manage_token. This just adds a friendlier front door: instead
// of the owner having to remember/bookmark a long random URL, they visit the
// short /admin path and enter a password. On success we set an HttpOnly
// cookie whose value IS the real manage_token, so pages/admin.js can hand
// requests off to the exact same dashboard-rendering code that
// /dashboard/:manageToken has always used -- nothing about the API layer or
// the rest of the app needs to know this cookie exists.
//
// Password hashing here (salted SHA-256, iterated 1000x) is intentionally
// low-tech: Workers doesn't have a built-in bcrypt/scrypt/Argon2, and a
// single shared admin credential on a low-traffic boutique site doesn't
// warrant pulling in a WASM password-hashing library. This is meaningfully
// better than a bare hash, not a claim of best-practice KDF strength.

export const ADMIN_COOKIE_NAME = "ncs_admin";
export const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // 180 days

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return toHex(digest);
}

export function generateSalt() {
  return toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
}

export async function hashPassword(password, salt) {
  let value = `${salt}:${password}`;
  for (let i = 0; i < 1000; i++) {
    value = await sha256Hex(value);
  }
  return value;
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(password, salt, expectedHash) {
  if (!salt || !expectedHash) return false;
  const actual = await hashPassword(password, salt);
  return timingSafeEqual(actual, expectedHash);
}
