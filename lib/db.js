// D1 access layer for Next Chapter Salon. See schema.sql for the full
// rationale on the booking model — short version: every appointment request
// (paid or free) lands as 'pending_review' and the owner accepts/declines by
// hand, so unlike booking-system/lib/db.js there is no atomic
// INSERT...WHERE NOT EXISTS conflict guard here. Overlaps are allowed to be
// requested on purpose; createAppointment() is a plain insert.

function randomToken(prefix, length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return `${prefix}-${code}`;
}

export function generateAppointmentToken() {
  return randomToken("NCA", 12);
}

// ---------------------------------------------------------------------
// Settings (single row)

export async function getSettings(env) {
  const row = await env.DB.prepare("SELECT * FROM ncs_settings WHERE id = 1").first();
  return row || null;
}

export async function getSettingsByManageToken(env, token) {
  const row = await env.DB.prepare("SELECT * FROM ncs_settings WHERE manage_token = ?").bind(token).first();
  return row || null;
}

export async function updateSettings(env, patch) {
  const fields = [];
  const values = [];
  for (const [col, val] of Object.entries(patch)) {
    if (val === undefined) continue;
    fields.push(`${col} = ?`);
    values.push(val);
  }
  if (!fields.length) return;
  fields.push("updated_at = datetime('now')");
  await env.DB.prepare(`UPDATE ncs_settings SET ${fields.join(", ")} WHERE id = 1`)
    .bind(...values)
    .run();
}

// ---------------------------------------------------------------------
// Hours / blocked dates

export async function listAvailabilityRules(env) {
  const res = await env.DB.prepare("SELECT * FROM ncs_availability_rules ORDER BY weekday, start").all();
  return res.results || [];
}

export async function replaceAvailabilityRules(env, rules) {
  await env.DB.prepare("DELETE FROM ncs_availability_rules").run();
  for (const r of rules) {
    await env.DB.prepare("INSERT INTO ncs_availability_rules (weekday, start, end) VALUES (?, ?, ?)")
      .bind(r.weekday, r.start, r.end)
      .run();
  }
}

export async function listBlockedDates(env, fromDate, toDate) {
  const res = await env.DB.prepare("SELECT * FROM ncs_blocked_dates WHERE date >= ? AND date <= ? ORDER BY date")
    .bind(fromDate, toDate)
    .all();
  return res.results || [];
}

export async function addBlockedDate(env, date, reason) {
  await env.DB.prepare("INSERT OR IGNORE INTO ncs_blocked_dates (date, reason) VALUES (?, ?)").bind(date, reason || null).run();
}

export async function removeBlockedDate(env, date) {
  await env.DB.prepare("DELETE FROM ncs_blocked_dates WHERE date = ?").bind(date).run();
}

// ---------------------------------------------------------------------
// Stylists

export async function listStylists(env, { activeOnly = false } = {}) {
  const sql = activeOnly
    ? "SELECT * FROM ncs_stylists WHERE active = 1 ORDER BY sort_order, id"
    : "SELECT * FROM ncs_stylists ORDER BY sort_order, id";
  const res = await env.DB.prepare(sql).all();
  return res.results || [];
}

export async function getStylistById(env, id) {
  return await env.DB.prepare("SELECT * FROM ncs_stylists WHERE id = ?").bind(id).first();
}

// Replace-all pattern (matches booking-system/api/manage-services.js's
// approach): simplest way to let the dashboard edit a whole list at once
// without diffing individual row changes client-side. Soft-deletes
// (active = 0) rather than hard-deleting rows dropped from the list, same
// reasoning booking-system uses for services — a stylist referenced by a
// past or pending appointment needs to keep existing, just hidden from new
// bookings.
export async function replaceStylists(env, stylists) {
  const existing = await env.DB.prepare("SELECT id FROM ncs_stylists").all();
  const existingIds = new Set((existing.results || []).map((r) => r.id));
  const keepIds = new Set();

  for (let i = 0; i < stylists.length; i++) {
    const s = stylists[i];
    if (s.id && existingIds.has(s.id)) {
      await env.DB.prepare(
        "UPDATE ncs_stylists SET name=?, title=?, bio=?, photo_url=?, sort_order=?, active=1 WHERE id=?"
      )
        .bind(s.name, s.title || null, s.bio || null, s.photo_url || null, i, s.id)
        .run();
      keepIds.add(s.id);
    } else {
      const inserted = await env.DB.prepare(
        "INSERT INTO ncs_stylists (name, title, bio, photo_url, sort_order, active) VALUES (?, ?, ?, ?, ?, 1)"
      )
        .bind(s.name, s.title || null, s.bio || null, s.photo_url || null, i)
        .run();
      keepIds.add(inserted.meta.last_row_id);
    }
  }
  for (const id of existingIds) {
    if (!keepIds.has(id)) await env.DB.prepare("UPDATE ncs_stylists SET active = 0 WHERE id = ?").bind(id).run();
  }
  return await listStylists(env);
}

// ---------------------------------------------------------------------
// Service categories + services

export async function listServiceCategories(env) {
  const res = await env.DB.prepare("SELECT * FROM ncs_service_categories ORDER BY sort_order, id").all();
  return res.results || [];
}

export async function listServices(env, { activeOnly = false } = {}) {
  const sql = activeOnly
    ? "SELECT * FROM ncs_services WHERE active = 1 ORDER BY category_id, sort_order, id"
    : "SELECT * FROM ncs_services ORDER BY category_id, sort_order, id";
  const res = await env.DB.prepare(sql).all();
  return res.results || [];
}

export async function getServiceById(env, id) {
  return await env.DB.prepare("SELECT * FROM ncs_services WHERE id = ?").bind(id).first();
}

export async function listServicesGroupedByCategory(env, { activeOnly = true } = {}) {
  const [categories, services] = await Promise.all([listServiceCategories(env), listServices(env, { activeOnly })]);
  return categories
    .map((c) => ({ ...c, services: services.filter((s) => s.category_id === c.id) }))
    .filter((c) => c.services.length > 0);
}

// Same soft-delete replace-all pattern as replaceStylists() above, and for
// the same reason: a service referenced by a past/pending appointment must
// keep existing, just stop being offered for new bookings.
export async function replaceServices(env, services) {
  const existing = await env.DB.prepare("SELECT id FROM ncs_services").all();
  const existingIds = new Set((existing.results || []).map((r) => r.id));
  const keepIds = new Set();

  for (let i = 0; i < services.length; i++) {
    const s = services[i];
    const name = String(s.name || "").trim().slice(0, 200);
    if (!name) continue;
    const categoryId = Number(s.categoryId) || 1;
    const description = s.description ? String(s.description).slice(0, 500) : null;
    const durationMinutes = Math.max(5, Math.min(600, Number(s.durationMinutes) || 30));
    const priceCents = Math.max(0, Number(s.priceCents) || 0);
    const priceIsFrom = s.priceIsFrom ? 1 : 0;
    const hasDowntime = s.hasDowntime ? 1 : 0;

    if (s.id && existingIds.has(Number(s.id))) {
      await env.DB.prepare(
        `UPDATE ncs_services SET category_id=?, name=?, description=?, duration_minutes=?, price_cents=?, price_is_from=?, has_downtime=?, sort_order=?, active=1 WHERE id=?`
      )
        .bind(categoryId, name, description, durationMinutes, priceCents, priceIsFrom, hasDowntime, i, Number(s.id))
        .run();
      keepIds.add(Number(s.id));
    } else {
      const inserted = await env.DB.prepare(
        `INSERT INTO ncs_services (category_id, name, description, duration_minutes, price_cents, price_is_from, has_downtime, sort_order, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`
      )
        .bind(categoryId, name, description, durationMinutes, priceCents, priceIsFrom, hasDowntime, i)
        .run();
      keepIds.add(inserted.meta.last_row_id);
    }
  }
  for (const id of existingIds) {
    if (!keepIds.has(id)) await env.DB.prepare("UPDATE ncs_services SET active = 0 WHERE id = ?").bind(id).run();
  }
  return await listServices(env);
}

// ---------------------------------------------------------------------
// Appointments

// Plain insert — see the file header for why this doesn't need the
// atomic conflict-guard pattern booking-system uses.
export async function createAppointment(env, {
  serviceId,
  stylistId,
  customerName,
  customerEmail,
  customerPhone,
  notes,
  startAt,
  endAt,
}) {
  const manageToken = generateAppointmentToken();
  const result = await env.DB.prepare(
    `INSERT INTO ncs_appointments
      (service_id, stylist_id, manage_token, customer_name, customer_email, customer_phone, notes, start_at, end_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review')`
  )
    .bind(serviceId, stylistId || null, manageToken, customerName, customerEmail, customerPhone || null, notes || null, startAt, endAt)
    .run();

  return {
    id: result.meta.last_row_id,
    manage_token: manageToken,
    service_id: serviceId,
    stylist_id: stylistId || null,
    customer_name: customerName,
    customer_email: customerEmail,
    customer_phone: customerPhone || null,
    notes: notes || null,
    start_at: startAt,
    end_at: endAt,
    status: "pending_review",
  };
}

export async function listAppointmentsInRange(env, fromIso, toIso) {
  const res = await env.DB.prepare(
    `SELECT * FROM ncs_appointments
     WHERE start_at < ? AND end_at > ?
       AND status IN ('pending_review', 'confirmed')
     ORDER BY start_at`
  )
    .bind(toIso, fromIso)
    .all();
  return res.results || [];
}

export async function listPendingAppointments(env) {
  const res = await env.DB.prepare(
    `SELECT a.*, s.name AS service_name, s.duration_minutes, st.name AS stylist_name
     FROM ncs_appointments a
     JOIN ncs_services s ON s.id = a.service_id
     LEFT JOIN ncs_stylists st ON st.id = a.stylist_id
     WHERE a.status = 'pending_review'
     ORDER BY a.start_at`
  ).all();
  return res.results || [];
}

export async function listUpcomingAppointments(env, { limit = 200 } = {}) {
  const res = await env.DB.prepare(
    `SELECT a.*, s.name AS service_name, s.duration_minutes, st.name AS stylist_name
     FROM ncs_appointments a
     JOIN ncs_services s ON s.id = a.service_id
     LEFT JOIN ncs_stylists st ON st.id = a.stylist_id
     WHERE a.status IN ('confirmed', 'pending_review') AND a.start_at > datetime('now', '-1 day')
     ORDER BY a.start_at
     LIMIT ?`
  )
    .bind(limit)
    .all();
  return res.results || [];
}

// Pending requests annotated with how many other pending/confirmed
// appointments they overlap — computed in JS from one bounded query rather
// than N+1 per-row lookups, which is plenty fast at boutique-salon scale
// (dozens, not thousands, of concurrent appointments).
export async function listPendingWithConflicts(env) {
  const res = await env.DB.prepare(
    `SELECT a.*, s.name AS service_name, s.duration_minutes, s.has_downtime, st.name AS stylist_name
     FROM ncs_appointments a
     JOIN ncs_services s ON s.id = a.service_id
     LEFT JOIN ncs_stylists st ON st.id = a.stylist_id
     WHERE a.status IN ('pending_review', 'confirmed') AND a.start_at > datetime('now', '-1 day')
     ORDER BY a.start_at`
  ).all();
  const all = res.results || [];
  const pending = all.filter((a) => a.status === "pending_review");

  return pending.map((p) => {
    const pStart = new Date(p.start_at).getTime();
    const pEnd = new Date(p.end_at).getTime();
    const conflicts = all.filter((o) => {
      if (o.id === p.id) return false;
      const oStart = new Date(o.start_at).getTime();
      const oEnd = new Date(o.end_at).getTime();
      return pStart < oEnd && pEnd > oStart;
    });
    return { ...p, conflictCount: conflicts.length, conflicts: conflicts.map((c) => ({ id: c.id, customer_name: c.customer_name, service_name: c.service_name, status: c.status })) };
  });
}

// Lightweight client directory — aggregated from appointment history rather
// than a separate table, since every booking already captures the info a
// small salon needs (name/email/phone, visit count, last visit).
export async function listClients(env) {
  const res = await env.DB.prepare(
    `SELECT customer_name, customer_email, customer_phone,
            COUNT(*) AS visit_count,
            MAX(start_at) AS last_visit,
            SUM(CASE WHEN status = 'confirmed' AND start_at < datetime('now') THEN 1 ELSE 0 END) AS completed_count
     FROM ncs_appointments
     WHERE status != 'canceled'
     GROUP BY customer_email
     ORDER BY last_visit DESC`
  ).all();
  return res.results || [];
}

// Manual entry for walk-ins / phone bookings — created directly as
// 'confirmed', skipping the pending_review queue entirely, since the owner
// is entering it themselves and doesn't need to approve their own entry.
export async function createManualAppointment(env, {
  serviceId,
  stylistId,
  customerName,
  customerEmail,
  customerPhone,
  notes,
  startAt,
  endAt,
}) {
  const manageToken = generateAppointmentToken();
  const result = await env.DB.prepare(
    `INSERT INTO ncs_appointments
      (service_id, stylist_id, manage_token, customer_name, customer_email, customer_phone, notes, start_at, end_at, status, decided_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', datetime('now'))`
  )
    .bind(serviceId, stylistId || null, manageToken, customerName, customerEmail || "walk-in@nextchaptersalon.com", customerPhone || null, notes || null, startAt, endAt)
    .run();
  return { id: result.meta.last_row_id, manage_token: manageToken };
}

export async function getAppointmentById(env, id) {
  return await env.DB.prepare(
    `SELECT a.*, s.name AS service_name, s.duration_minutes, s.price_cents
     FROM ncs_appointments a JOIN ncs_services s ON s.id = a.service_id WHERE a.id = ?`
  )
    .bind(id)
    .first();
}

export async function getAppointmentByManageToken(env, token) {
  return await env.DB.prepare(
    `SELECT a.*, s.name AS service_name, s.duration_minutes, s.price_cents
     FROM ncs_appointments a JOIN ncs_services s ON s.id = a.service_id WHERE a.manage_token = ?`
  )
    .bind(token)
    .first();
}

// Finds appointments (other than the one given) that overlap its time
// window — used to flag real conflicts on the owner's review queue.
export async function findOverlapping(env, appointmentId, startAt, endAt) {
  const res = await env.DB.prepare(
    `SELECT a.*, s.name AS service_name FROM ncs_appointments a
     JOIN ncs_services s ON s.id = a.service_id
     WHERE a.id != ? AND a.status IN ('pending_review', 'confirmed')
       AND a.start_at < ? AND a.end_at > ?`
  )
    .bind(appointmentId, endAt, startAt)
    .all();
  return res.results || [];
}

export async function setAppointmentStatus(env, id, status, { declineReason } = {}) {
  await env.DB.prepare(
    `UPDATE ncs_appointments SET status = ?, decline_reason = ?, decided_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
  )
    .bind(status, declineReason || null, id)
    .run();
}

// Used by the dashboard's drag-and-drop calendar (see
// api/reschedule-appointment.js) to move an appointment to a new
// time/stylist or resize its duration. Doesn't touch status -- a pending
// request dragged around the calendar stays pending until the owner
// explicitly accepts/declines it from the Requests tab.
export async function rescheduleAppointment(env, id, { startAt, endAt, stylistId }) {
  await env.DB.prepare(
    `UPDATE ncs_appointments SET start_at = ?, end_at = ?, stylist_id = ?, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(startAt, endAt, stylistId ?? null, id)
    .run();
  return await getAppointmentById(env, id);
}

export async function cancelAppointmentByToken(env, token) {
  const appt = await env.DB.prepare("SELECT * FROM ncs_appointments WHERE manage_token = ?").bind(token).first();
  if (!appt) return null;
  await env.DB.prepare(
    "UPDATE ncs_appointments SET status = 'canceled', updated_at = datetime('now') WHERE id = ?"
  )
    .bind(appt.id)
    .run();
  return appt;
}

// ---------------------------------------------------------------------
// Testimonials / gallery / contact inquiries

export async function listTestimonials(env, { activeOnly = true } = {}) {
  const sql = activeOnly
    ? "SELECT * FROM ncs_testimonials WHERE active = 1 ORDER BY sort_order, id"
    : "SELECT * FROM ncs_testimonials ORDER BY sort_order, id";
  const res = await env.DB.prepare(sql).all();
  return res.results || [];
}

export async function listGalleryItems(env, { activeOnly = true } = {}) {
  const sql = activeOnly
    ? "SELECT * FROM ncs_gallery_items WHERE active = 1 ORDER BY sort_order, id"
    : "SELECT * FROM ncs_gallery_items ORDER BY sort_order, id";
  const res = await env.DB.prepare(sql).all();
  return res.results || [];
}

// Confirmed appointments starting 23-25 hours from now that haven't had a
// reminder sent yet — same 2-hour window as booking-system/lib/db.js, sized
// to match the hourly cron cadence so nothing slips between runs.
export async function listAppointmentsNeedingReminder(env) {
  const settings = await getSettings(env);
  const res = await env.DB.prepare(
    `SELECT a.*, s.name AS service_name
     FROM ncs_appointments a
     JOIN ncs_services s ON s.id = a.service_id
     WHERE a.status = 'confirmed'
       AND a.reminder_sent_at IS NULL
       AND a.start_at BETWEEN datetime('now', '+23 hours') AND datetime('now', '+25 hours')`
  ).all();
  return (res.results || []).map((a) => ({ ...a, business_name: settings?.business_name, timezone: settings?.timezone }));
}

export async function markReminderSent(env, id) {
  await env.DB.prepare("UPDATE ncs_appointments SET reminder_sent_at = datetime('now') WHERE id = ?").bind(id).run();
}

export async function replaceTestimonials(env, testimonials) {
  const existing = await env.DB.prepare("SELECT id FROM ncs_testimonials").all();
  const existingIds = new Set((existing.results || []).map((r) => r.id));
  const keepIds = new Set();

  for (let i = 0; i < testimonials.length; i++) {
    const t = testimonials[i];
    const clientName = String(t.clientName || "").trim().slice(0, 120);
    const quote = String(t.quote || "").trim().slice(0, 600);
    if (!clientName || !quote) continue;
    const rating = Math.max(1, Math.min(5, Number(t.rating) || 5));
    const serviceName = t.serviceName ? String(t.serviceName).slice(0, 120) : null;

    if (t.id && existingIds.has(Number(t.id))) {
      await env.DB.prepare(
        "UPDATE ncs_testimonials SET client_name=?, quote=?, rating=?, service_name=?, sort_order=?, active=1 WHERE id=?"
      )
        .bind(clientName, quote, rating, serviceName, i, Number(t.id))
        .run();
      keepIds.add(Number(t.id));
    } else {
      const inserted = await env.DB.prepare(
        "INSERT INTO ncs_testimonials (client_name, quote, rating, service_name, sort_order, active) VALUES (?, ?, ?, ?, ?, 1)"
      )
        .bind(clientName, quote, rating, serviceName, i)
        .run();
      keepIds.add(inserted.meta.last_row_id);
    }
  }
  for (const id of existingIds) {
    if (!keepIds.has(id)) await env.DB.prepare("UPDATE ncs_testimonials SET active = 0 WHERE id = ?").bind(id).run();
  }
  return await listTestimonials(env, { activeOnly: false });
}

export async function replaceGalleryItems(env, items) {
  const existing = await env.DB.prepare("SELECT id FROM ncs_gallery_items").all();
  const existingIds = new Set((existing.results || []).map((r) => r.id));
  const keepIds = new Set();

  for (let i = 0; i < items.length; i++) {
    const g = items[i];
    const label = String(g.label || "").trim().slice(0, 120);
    if (!label) continue;
    const category = String(g.category || "General").slice(0, 60);
    const imageUrl = g.imageUrl ? String(g.imageUrl).slice(0, 500) : null;

    if (g.id && existingIds.has(Number(g.id))) {
      await env.DB.prepare(
        "UPDATE ncs_gallery_items SET label=?, category=?, image_url=?, sort_order=?, active=1 WHERE id=?"
      )
        .bind(label, category, imageUrl, i, Number(g.id))
        .run();
      keepIds.add(Number(g.id));
    } else {
      const inserted = await env.DB.prepare(
        "INSERT INTO ncs_gallery_items (label, category, image_url, sort_order, active) VALUES (?, ?, ?, ?, 1)"
      )
        .bind(label, category, imageUrl, i)
        .run();
      keepIds.add(inserted.meta.last_row_id);
    }
  }
  for (const id of existingIds) {
    if (!keepIds.has(id)) await env.DB.prepare("UPDATE ncs_gallery_items SET active = 0 WHERE id = ?").bind(id).run();
  }
  return await listGalleryItems(env, { activeOnly: false });
}

export async function createContactInquiry(env, { name, email, phone, message }) {
  await env.DB.prepare(
    "INSERT INTO ncs_contact_inquiries (name, email, phone, message) VALUES (?, ?, ?, ?)"
  )
    .bind(name, email, phone || null, message)
    .run();
}

// ---------------------------------------------------------------------
// /admin login rate limiting (see api/admin-login.js)

export async function countRecentFailedLogins(env, ip) {
  const res = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM ncs_login_attempts WHERE ip = ? AND attempted_at > datetime('now', '-15 minutes')"
  )
    .bind(ip)
    .first();
  return res ? Number(res.count) : 0;
}

export async function recordFailedLogin(env, ip) {
  await env.DB.prepare("INSERT INTO ncs_login_attempts (ip) VALUES (?)").bind(ip).run();
}

// Called from the hourly cron (lib/reminders.js) -- keeps this table from
// growing forever. A day of history is more than enough for a 15-minute
// lockout window.
export async function pruneOldLoginAttempts(env) {
  await env.DB.prepare("DELETE FROM ncs_login_attempts WHERE attempted_at < datetime('now', '-1 day')").run();
}
