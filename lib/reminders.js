// Called hourly from worker/index.js's scheduled() handler, same cron as
// booking-system's reminder sweep. Finds confirmed appointments starting
// 23-25 hours out that haven't had a reminder sent, and emails the
// customer. reminder_sent_at makes this safe to run every hour without
// double-sending.

import { listAppointmentsNeedingReminder, markReminderSent } from "./db.js";
import { sendBookingEmail, escapeHtml } from "./email.js";
import { utcToZonedParts } from "./availability.js";

function formatLocal(startAtIso, timezone) {
  const parts = utcToZonedParts(new Date(startAtIso), timezone);
  return `${parts.date} at ${parts.time}`;
}

export async function sendAppointmentReminders(env) {
  let appointments;
  try {
    appointments = await listAppointmentsNeedingReminder(env);
  } catch (err) {
    return;
  }

  for (const appt of appointments) {
    const when = formatLocal(appt.start_at, appt.timezone || "America/Chicago");
    try {
      await sendBookingEmail(env, {
        to: appt.customer_email,
        subject: `Reminder: your appointment at ${appt.business_name} is tomorrow`,
        html: `<div style="font-family:Georgia,serif;color:#1a120d;">
          <h2 style="color:#5c1024;">See you tomorrow</h2>
          <p>This is a reminder about your upcoming appointment:</p>
          <table style="border-collapse:collapse;width:100%;max-width:480px;">
            <tr><td style="padding:8px 12px;border:1px solid #ddd;background:#f7f2ea;font-weight:600;">Service</td><td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml(appt.service_name)}</td></tr>
            <tr><td style="padding:8px 12px;border:1px solid #ddd;background:#f7f2ea;font-weight:600;">When</td><td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml(when)}</td></tr>
          </table>
        </div>`,
      });
      await markReminderSent(env, appt.id);
    } catch (err) {
      // Leave reminder_sent_at unset so the next hourly run retries.
    }
  }
}
