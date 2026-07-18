// POST /api/manual-appointment
// Owner-only. Adds a walk-in or phone-booked appointment directly as
// 'confirmed' — bypasses the public request/approval queue since the owner
// is entering it themselves.
//
// Blocks past *dates* but not past *times* on today -- a walk-in that
// started 10 minutes ago and is being logged right now is a legitimate,
// common case, not a bug. The date check allows a 1-day grace period (see
// PAST_DATE_GRACE_DAYS below) rather than comparing strictly against the
// salon's configured timezone -- a strict same-instant comparison was
// occasionally rejecting "today" itself depending on exactly where the
// owner's device clock sat relative to the salon's configured timezone at
// the moment of submission. One day of slack on an owner-only tool is a
// non-issue; a hard rejection of a legitimate walk-in someone is standing
// in front of you trying to log is a real one.

import { requireOwner } from "../lib/auth.js";
import { getServiceById, createManualAppointment } from "../lib/db.js";
import { utcToZonedParts, addDaysToDateStr } from "../lib/availability.js";

const PAST_DATE_GRACE_DAYS = 1;

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

  const serviceId = Number(data.serviceId);
  const stylistId = data.stylistId ? Number(data.stylistId) : null;
  const startAt = String(data.startAt || "");
  const customerName = String(data.customerName || "").trim().slice(0, 200) || "Walk-in";
  const customerEmail = String(data.customerEmail || "").trim().slice(0, 200);
  const customerPhone = String(data.customerPhone || "").trim().slice(0, 60);
  const notes = String(data.notes || "").trim().slice(0, 500);

  if (!serviceId || !startAt) return json({ ok: false, error: "Missing service or time" }, 400);

  const service = await getServiceById(env, serviceId);
  if (!service) return json({ ok: false, error: "Service not found" }, 404);

  const startDate = new Date(startAt);
  if (isNaN(startDate.getTime())) return json({ ok: false, error: "Invalid time" }, 400);

  const todayLocal = utcToZonedParts(new Date(), settings.timezone).date;
  const requestedLocal = utcToZonedParts(startDate, settings.timezone).date;
  if (requestedLocal < addDaysToDateStr(todayLocal, -PAST_DATE_GRACE_DAYS)) {
    return json({ ok: false, error: "Can't add an appointment on a past date." }, 400);
  }

  const endDate = new Date(startDate.getTime() + service.duration_minutes * 60000);

  const appt = await createManualAppointment(env, {
    serviceId,
    stylistId,
    customerName,
    customerEmail,
    customerPhone,
    notes,
    startAt: startDate.toISOString(),
    endAt: endDate.toISOString(),
  });

  return json({ ok: true, appointment: appt });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
