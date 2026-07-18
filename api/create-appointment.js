// POST /api/create-appointment
//
// Public. Body: { serviceId, stylistId (optional), customerName,
// customerEmail, customerPhone, notes, AND EITHER startAt (UTC ISO from an
// /api/availability response) OR date ("YYYY-MM-DD") }
//
// The booking page currently only asks the customer for a day (not a
// specific time — see pages/booking.js's SHOW_TIME_SLOTS flag), so `date`
// is the normal path right now: this picks a placeholder time on that day
// (the salon's opening time, or 10:00 if no hours are set for that
// weekday) and creates the request there. The owner then drags it to the
// client's actual time on the dashboard's calendar (api/reschedule-
// appointment.js) — consistent with the existing "every request is
// reviewed personally" model, just review-by-dragging instead of a
// separate accept step for the exact time. The full startAt path is left
// intact and still works end-to-end (validated the same as before) in case
// exact-time picking is turned back on later.
//
// Every request — regardless of service, regardless of whether it overlaps
// another appointment — is created as 'pending_review' and left for the
// owner to accept or decline from the dashboard. Re-validates against
// business hours/blocked dates server-side (a stale or tampered startAt
// shouldn't slip past that), but does NOT reject on overlap — overlapping
// requests are allowed on purpose. See schema.sql for the full reasoning.

import { getSettings, getServiceById, listAvailabilityRules, listBlockedDates, createAppointment, findOverlapping } from "../lib/db.js";
import { generateSlotsWithOverlapInfo, zonedTimeToUtc, utcToZonedParts } from "../lib/availability.js";
import { sendBookingEmail, escapeHtml } from "../lib/email.js";
import { buildSingleEventIcs } from "../lib/ics.js";
import { getOrigin } from "../lib/http.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  let data;
  try {
    data = await request.json();
  } catch (err) {
    return json({ ok: false, error: "Invalid request body" }, 400);
  }

  const serviceId = Number(data.serviceId);
  const stylistId = data.stylistId ? Number(data.stylistId) : null;
  let startAt = String(data.startAt || "");
  const requestedDate = String(data.date || "");
  const customerName = String(data.customerName || "").trim().slice(0, 200);
  const customerEmail = String(data.customerEmail || "").trim().slice(0, 200);
  const customerPhone = String(data.customerPhone || "").trim().slice(0, 60);
  const notes = String(data.notes || "").trim().slice(0, 500);

  if (!serviceId || (!startAt && !requestedDate) || !customerName || !customerEmail) {
    return json({ ok: false, error: "Missing required fields" }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    return json({ ok: false, error: "That doesn't look like a valid email address." }, 400);
  }

  const settings = await getSettings(env);
  if (!settings) return json({ ok: false, error: "Salon not configured" }, 500);

  const service = await getServiceById(env, serviceId);
  if (!service || !service.active) return json({ ok: false, error: "Service not found" }, 404);

  let skipSlotRevalidation = false;

  if (!startAt && requestedDate) {
    // Day-only path: pick a placeholder time, the owner repositions it.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      return json({ ok: false, error: "That doesn't look like a valid date." }, 400);
    }
    const todayLocal = utcToZonedParts(new Date(), settings.timezone).date;
    if (requestedDate < todayLocal) {
      return json({ ok: false, error: "That date has already passed, please pick another." }, 400);
    }
    const weekday = new Date(`${requestedDate}T12:00:00Z`).getUTCDay();
    const dayRules = (await listAvailabilityRules(env)).filter((r) => r.weekday === weekday);
    const placeholderTime = dayRules.length
      ? dayRules.map((r) => r.start).sort()[0]
      : "10:00";
    startAt = zonedTimeToUtc(requestedDate, placeholderTime, settings.timezone).toISOString();
    skipSlotRevalidation = true;
  }

  const startDate = new Date(startAt);
  if (isNaN(startDate.getTime()) || startDate.getTime() < Date.now() - 60000) {
    return json({ ok: false, error: "That time is no longer valid, please pick another." }, 400);
  }
  const endDate = new Date(startDate.getTime() + service.duration_minutes * 60000);

  // Re-derive business hours for that local day and make sure the
  // requested time actually falls in one of the open windows — this is a
  // "is this a real bookable time" check, not a conflict check. Skipped
  // for the day-only path above since the placeholder time is derived
  // directly from those same hours (or a sensible default), and the owner
  // has full discretion to move it anywhere once it's in their calendar.
  if (!skipSlotRevalidation) {
    const localDateStr = startAt.slice(0, 10);
    const rules = await listAvailabilityRules(env);
    const blockedDates = await listBlockedDates(env, localDateStr, localDateStr);
    const recomputed = generateSlotsWithOverlapInfo({
      timezone: settings.timezone,
      durationMinutes: service.duration_minutes,
      rules,
      blockedDates,
      existingAppointments: [],
      fromDate: localDateStr,
      toDate: localDateStr,
    });
    const validSlots = new Set((recomputed[localDateStr] || []).map((s) => new Date(s.startAt).getTime()));
    if (!validSlots.has(startDate.getTime())) {
      return json({ ok: false, error: "That time is outside our booking hours, please pick another." }, 400);
    }
  }

  const appointment = await createAppointment(env, {
    serviceId: service.id,
    stylistId,
    customerName,
    customerEmail,
    customerPhone,
    notes,
    startAt: startDate.toISOString(),
    endAt: endDate.toISOString(),
  });

  const overlaps = await findOverlapping(env, appointment.id, appointment.start_at, appointment.end_at);
  const origin = getOrigin(request, env);

  await notifyOwnerOfRequest(env, { settings, service, appointment, overlaps, origin });
  await notifyCustomerOfRequest(env, { settings, service, appointment, origin });

  return json({
    ok: true,
    manageToken: appointment.manage_token,
    statusUrl: `${origin}/my-appointment/${appointment.manage_token}`,
  });
}

async function notifyOwnerOfRequest(env, { settings, service, appointment, overlaps, origin }) {
  const conflictNote = overlaps.length
    ? `<p style="color:#c99;"><strong>Heads up:</strong> this overlaps ${overlaps.length} existing appointment${overlaps.length > 1 ? "s" : ""} at that time. Review before accepting.</p>`
    : "";
  try {
    await sendBookingEmail(env, {
      to: settings.notify_email,
      subject: `New booking request: ${appointment.customer_name} — ${service.name}`,
      html: `<div style="font-family:Georgia,serif;color:#1a120d;">
        <h2 style="color:#5c1024;">New appointment request</h2>
        ${conflictNote}
        <table style="border-collapse:collapse;width:100%;max-width:480px;">
          <tr><td style="padding:8px 12px;border:1px solid #ddd;background:#f7f2ea;font-weight:600;">Service</td><td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml(service.name)}</td></tr>
          <tr><td style="padding:8px 12px;border:1px solid #ddd;background:#f7f2ea;font-weight:600;">Client</td><td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml(appointment.customer_name)}</td></tr>
          <tr><td style="padding:8px 12px;border:1px solid #ddd;background:#f7f2ea;font-weight:600;">Email</td><td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml(appointment.customer_email)}</td></tr>
          <tr><td style="padding:8px 12px;border:1px solid #ddd;background:#f7f2ea;font-weight:600;">Phone</td><td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml(appointment.customer_phone || "(not given)")}</td></tr>
          <tr><td style="padding:8px 12px;border:1px solid #ddd;background:#f7f2ea;font-weight:600;">Requested time</td><td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml(appointment.start_at)}</td></tr>
          <tr><td style="padding:8px 12px;border:1px solid #ddd;background:#f7f2ea;font-weight:600;">Notes</td><td style="padding:8px 12px;border:1px solid #ddd;white-space:pre-wrap;">${escapeHtml(appointment.notes || "(none)")}</td></tr>
        </table>
        <p style="margin-top:16px;"><a href="${origin}/dashboard/${settings.manage_token}" style="color:#5c1024;">Review and respond in your dashboard &rarr;</a></p>
      </div>`,
      replyTo: appointment.customer_email,
    });
  } catch (err) {
    // Non-fatal — the request is already saved either way.
  }
}

async function notifyCustomerOfRequest(env, { settings, service, appointment, origin }) {
  try {
    await sendBookingEmail(env, {
      to: appointment.customer_email,
      subject: `We've received your request — ${settings.business_name}`,
      html: `<div style="font-family:Georgia,serif;color:#1a120d;">
        <h2 style="color:#5c1024;">Your request is in</h2>
        <p>Thank you for requesting an appointment with ${escapeHtml(settings.business_name)}. We personally review every booking, so nothing is confirmed just yet — you'll hear from us shortly.</p>
        <table style="border-collapse:collapse;width:100%;max-width:480px;">
          <tr><td style="padding:8px 12px;border:1px solid #ddd;background:#f7f2ea;font-weight:600;">Service</td><td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml(service.name)}</td></tr>
          <tr><td style="padding:8px 12px;border:1px solid #ddd;background:#f7f2ea;font-weight:600;">Requested time</td><td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml(appointment.start_at)}</td></tr>
        </table>
        <p style="margin-top:16px;"><a href="${origin}/my-appointment/${appointment.manage_token}" style="color:#5c1024;">View or cancel this request &rarr;</a></p>
      </div>`,
    });
  } catch (err) {
    // Non-fatal.
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
