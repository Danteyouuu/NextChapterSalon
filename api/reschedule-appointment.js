// POST /api/reschedule-appointment
// Body: { manageToken (owner's), appointmentId, startAt, endAt, stylistId (nullable) }
//
// Owner-only. Backs the dashboard's drag-and-drop calendar: moving a block
// changes startAt/endAt (same duration) and/or stylistId; dragging its
// bottom edge to resize changes endAt only. Doesn't touch status — dragging
// a pending request around the calendar is not the same as accepting it;
// that still happens explicitly from the Requests tab.
//
// Overlaps are allowed here too, same reasoning as the public booking flow
// (see schema.sql) — the owner can see the overlap visually in the grid
// and is making the call themselves by dropping it there.

import { requireOwner } from "../lib/auth.js";
import { getAppointmentById, rescheduleAppointment } from "../lib/db.js";
import { utcToZonedParts, addDaysToDateStr } from "../lib/availability.js";

// See api/manual-appointment.js for why this isn't a strict same-instant
// comparison against the salon's timezone -- a 1-day grace period avoids
// falsely rejecting a drag onto "today" depending on exactly where the
// owner's device clock sits relative to the salon's configured timezone.
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

  const appointmentId = Number(data.appointmentId);
  const appointment = await getAppointmentById(env, appointmentId);
  if (!appointment) return json({ ok: false, error: "Not found" }, 404);
  if (appointment.status !== "confirmed" && appointment.status !== "pending_review") {
    return json({ ok: false, error: `Can't reschedule a ${appointment.status} appointment.` }, 409);
  }

  const startDate = new Date(String(data.startAt || ""));
  const endDate = new Date(String(data.endAt || ""));
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate.getTime() <= startDate.getTime()) {
    return json({ ok: false, error: "Invalid time range." }, 400);
  }
  if (endDate.getTime() - startDate.getTime() < 5 * 60000) {
    return json({ ok: false, error: "Appointments must be at least 5 minutes long." }, 400);
  }

  const todayLocal = utcToZonedParts(new Date(), settings.timezone).date;
  const requestedLocal = utcToZonedParts(startDate, settings.timezone).date;
  if (requestedLocal < addDaysToDateStr(todayLocal, -PAST_DATE_GRACE_DAYS)) {
    return json({ ok: false, error: "Can't move an appointment to a past date." }, 400);
  }

  const stylistId = data.stylistId ? Number(data.stylistId) : null;

  const updated = await rescheduleAppointment(env, appointmentId, {
    startAt: startDate.toISOString(),
    endAt: endDate.toISOString(),
    stylistId,
  });

  return json({ ok: true, appointment: updated });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
