// POST /api/manage-stylists
// Owner-only. Replaces the full stylist/team list in one call.

import { requireOwner } from "../lib/auth.js";
import { replaceStylists } from "../lib/db.js";

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

  const stylists = Array.isArray(data.stylists) ? data.stylists : [];
  const current = await replaceStylists(env, stylists);
  return json({ ok: true, stylists: current });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
