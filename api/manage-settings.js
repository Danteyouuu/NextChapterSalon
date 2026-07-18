// POST /api/manage-settings
// Owner-only. Updates business info, hours, and blocked dates in one call —
// same shape as booking-system/api/manage-calendar.js, including the
// timezone-validation fix that had to be added there after live testing
// found an unvalidated timezone could 500 the whole public booking page.

import { requireOwner } from "../lib/auth.js";
import { updateSettings, replaceAvailabilityRules, listBlockedDates, addBlockedDate, removeBlockedDate } from "../lib/db.js";

function isValidTimeZone(tz) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch (err) {
    return false;
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let data;
  try {
    data = await request.json();
  } catch (err) {
    return json({ ok: false, error: "Invalid request body" }, 400);
  }

  const settings = await requireOwner(env, data.manageToken);
  if (!settings) return json({ ok: false, error: "Unauthorized" }, 401);

  const patch = data.settings || {};
  if (patch.timezone && !isValidTimeZone(String(patch.timezone))) {
    return json({ ok: false, error: "That timezone isn't recognized." }, 400);
  }

  await updateSettings(env, {
    business_name: patch.businessName ? String(patch.businessName).slice(0, 200) : undefined,
    tagline: patch.tagline ? String(patch.tagline).slice(0, 200) : undefined,
    notify_email: patch.notifyEmail ? String(patch.notifyEmail).slice(0, 200) : undefined,
    phone: patch.phone !== undefined ? String(patch.phone).slice(0, 60) : undefined,
    address_line1: patch.addressLine1 !== undefined ? String(patch.addressLine1).slice(0, 200) : undefined,
    address_line2: patch.addressLine2 !== undefined ? String(patch.addressLine2).slice(0, 200) : undefined,
    timezone: patch.timezone ? String(patch.timezone).slice(0, 60) : undefined,
  });

  if (Array.isArray(data.availabilityRules)) {
    const rules = data.availabilityRules
      .filter((r) => r && typeof r.weekday === "number" && r.start && r.end)
      .map((r) => ({ weekday: r.weekday, start: String(r.start).slice(0, 5), end: String(r.end).slice(0, 5) }));
    await replaceAvailabilityRules(env, rules);
  }

  if (Array.isArray(data.blockedDates)) {
    const existing = await listBlockedDates(env, "0000-01-01", "9999-12-31");
    const existingDates = new Set(existing.map((b) => b.date));
    const incomingDates = new Set(data.blockedDates.map((b) => b.date));

    for (const b of data.blockedDates) {
      if (!existingDates.has(b.date)) await addBlockedDate(env, b.date, b.reason || null);
    }
    for (const date of existingDates) {
      if (!incomingDates.has(date)) await removeBlockedDate(env, date);
    }
  }

  return json({ ok: true });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
