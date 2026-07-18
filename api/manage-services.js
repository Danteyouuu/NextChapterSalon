// POST /api/manage-services
// Owner-only. Replaces the full service list in one call (see lib/db.js#replaceServices).

import { requireOwner } from "../lib/auth.js";
import { replaceServices } from "../lib/db.js";

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

  const services = Array.isArray(data.services) ? data.services : [];
  const current = await replaceServices(env, services);
  return json({ ok: true, services: current });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
