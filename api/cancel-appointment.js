// POST /api/cancel-appointment
// Body: { manageToken (the customer's per-appointment token) }
// Public — the token itself is the credential, same model as booking-system.

import { cancelAppointmentByToken } from "../lib/db.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  let data;
  try {
    data = await request.json();
  } catch (err) {
    return json({ ok: false, error: "Invalid request body" }, 400);
  }

  const token = String(data.manageToken || "");
  const appt = await cancelAppointmentByToken(env, token);
  if (!appt) return json({ ok: false, error: "Not found" }, 404);

  return json({ ok: true });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
