// POST /api/accept-appointment
// Body: { manageToken (owner's), appointmentId }
// Owner-only. Confirms the appointment and emails the client a calendar invite.

import { requireOwner } from "../lib/auth.js";
import { getAppointmentById, setAppointmentStatus } from "../lib/db.js";
import { notifyCustomerAccepted } from "../lib/notify.js";
import { getOrigin } from "../lib/http.js";

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
  if (appointment.status !== "pending_review") {
    return json({ ok: false, error: `Already ${appointment.status}` }, 409);
  }

  await setAppointmentStatus(env, appointmentId, "confirmed");

  const origin = getOrigin(request, env);
  await notifyCustomerAccepted(env, {
    settings,
    service: { name: appointment.service_name },
    appointment,
    origin,
  });

  return json({ ok: true });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
