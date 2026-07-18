// GET /api/dashboard-data?manageToken=
// Owner-only. One-shot bundle of everything the dashboard needs, including
// the pending-requests queue with conflict counts. The dashboard polls this
// every ~20s so new requests show up without a manual page refresh — as
// close to "real time" as a polling model gets without standing up
// WebSockets/Durable Objects for what's currently a single-owner dashboard.

import { requireOwner } from "../lib/auth.js";
import {
  listPendingWithConflicts,
  listUpcomingAppointments,
  listAvailabilityRules,
  listBlockedDates,
  listStylists,
  listServices,
  listServiceCategories,
  listTestimonials,
  listGalleryItems,
  listClients,
} from "../lib/db.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const manageToken = url.searchParams.get("manageToken");

  const settings = await requireOwner(env, manageToken);
  if (!settings) return json({ ok: false, error: "Unauthorized" }, 401);

  const [pending, upcoming, rules, blockedDates, stylists, services, categories, testimonials, galleryItems, clients] =
    await Promise.all([
      listPendingWithConflicts(env),
      listUpcomingAppointments(env),
      listAvailabilityRules(env),
      listBlockedDates(env, "0000-01-01", "9999-12-31"),
      listStylists(env),
      listServices(env),
      listServiceCategories(env),
      listTestimonials(env, { activeOnly: false }),
      listGalleryItems(env, { activeOnly: false }),
      listClients(env),
    ]);

  return json({
    ok: true,
    settings,
    pending,
    upcoming,
    rules,
    blockedDates,
    stylists,
    services,
    categories,
    testimonials,
    galleryItems,
    clients,
  });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
