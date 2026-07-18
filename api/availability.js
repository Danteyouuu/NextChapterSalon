// GET /api/availability?serviceId=&from=&to=
//
// Public. Returns every slot inside business hours for the requested
// service and date range, each annotated with overlapCount — how many
// existing (pending or confirmed) appointments it overlaps. Nothing is
// excluded: see lib/availability.js and schema.sql for why this salon
// intentionally allows requesting overlapping times (owner reviews and
// decides by hand, e.g. a haircut booked into a color's processing time).

import { getSettings, listAvailabilityRules, listBlockedDates, listAppointmentsInRange, getServiceById } from "../lib/db.js";
import { generateSlotsWithOverlapInfo, addDaysToDateStr } from "../lib/availability.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const serviceId = Number(url.searchParams.get("serviceId"));
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to") || from;

  if (!serviceId || !from) {
    return json({ ok: false, error: "Missing serviceId or from date" }, 400);
  }

  const settings = await getSettings(env);
  if (!settings) return json({ ok: false, error: "Salon not configured" }, 500);

  const service = await getServiceById(env, serviceId);
  if (!service || !service.active) return json({ ok: false, error: "Service not found" }, 404);

  const rangeStart = `${from}T00:00:00.000Z`;
  const rangeEnd = `${addDaysToDateStr(to, 1)}T00:00:00.000Z`;

  const [rules, blockedDates, existingAppointments] = await Promise.all([
    listAvailabilityRules(env),
    listBlockedDates(env, from, to),
    listAppointmentsInRange(env, rangeStart, rangeEnd),
  ]);

  let slotsByDate;
  try {
    slotsByDate = generateSlotsWithOverlapInfo({
      timezone: settings.timezone,
      durationMinutes: service.duration_minutes,
      rules,
      blockedDates,
      existingAppointments,
      fromDate: from,
      toDate: to,
    });
  } catch (err) {
    return json({ ok: false, error: `Server error: ${err.message}` }, 500);
  }

  return json({ ok: true, slotsByDate, timezone: settings.timezone, hasDowntime: !!service.has_downtime });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
