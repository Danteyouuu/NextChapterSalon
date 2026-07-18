// POST /api/delete-appointment
// Body: { manageToken (owner's), appointmentId }
//
// Owner-only. Backs the dashboard calendar's drag-right-to-delete gesture
// (client confirms with the browser's native confirm() before this is ever
// called). Soft-delete: marks the appointment 'canceled' rather than
// removing the row, same status the customer-facing self-cancel flow
// already uses (api/cancel-appointment.js) -- keeps history intact for the
// client directory / stats, and every query that builds the calendar or
// the requests queue already excludes canceled appointments.

import { requireOwner } from "../lib/auth.js";
import { getAppointmentById, setAppointmentStatus } from "../lib/db.js";

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

  if (appointment.status === "canceled" || appointment.status === "declined") {
    return json({ ok: true, appointment }); // already gone -- idempotent
  }

  await setAppointmentStatus(env, appointmentId, "canceled");
  const updated = await getAppointmentById(env, appointmentId);
  return json({ ok: true, appointment: updated });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
