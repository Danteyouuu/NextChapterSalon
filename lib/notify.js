// Customer-facing emails sent when the owner accepts or declines a
// request — split out from api/accept-appointment.js and
// api/decline-appointment.js since both need it.

import { sendBookingEmail, escapeHtml } from "./email.js";
import { buildSingleEventIcs } from "./ics.js";

export async function notifyCustomerAccepted(env, { settings, service, appointment, origin }) {
  const ics = buildSingleEventIcs({
    uid: `${appointment.manage_token}@nextchaptersalon.com`,
    summary: `${service.name} — ${settings.business_name}`,
    description: appointment.notes || "",
    location: [settings.address_line1, settings.address_line2].filter(Boolean).join(", "),
    organizerEmail: settings.notify_email,
    startUtc: appointment.start_at,
    endUtc: appointment.end_at,
  });

  try {
    await sendBookingEmail(env, {
      to: appointment.customer_email,
      subject: `Confirmed: ${service.name} at ${settings.business_name}`,
      html: `<div style="font-family:Georgia,serif;color:#1a120d;">
        <h2 style="color:#5c1024;">You're confirmed</h2>
        <p>We're looking forward to seeing you — your next chapter starts soon.</p>
        <table style="border-collapse:collapse;width:100%;max-width:480px;">
          <tr><td style="padding:8px 12px;border:1px solid #ddd;background:#f7f2ea;font-weight:600;">Service</td><td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml(service.name)}</td></tr>
          <tr><td style="padding:8px 12px;border:1px solid #ddd;background:#f7f2ea;font-weight:600;">When</td><td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml(appointment.start_at)}</td></tr>
          <tr><td style="padding:8px 12px;border:1px solid #ddd;background:#f7f2ea;font-weight:600;">Where</td><td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml([settings.address_line1, settings.address_line2].filter(Boolean).join(", "))}</td></tr>
        </table>
        <p style="margin-top:16px;">A calendar invite is attached. <a href="${origin}/my-appointment/${appointment.manage_token}" style="color:#5c1024;">View or cancel this appointment</a>.</p>
      </div>`,
      icsText: ics,
      icsFilename: "appointment.ics",
    });
  } catch (err) {
    // Appointment status already updated either way.
  }
}

export async function notifyCustomerDeclined(env, { settings, service, appointment, origin, reason }) {
  try {
    await sendBookingEmail(env, {
      to: appointment.customer_email,
      subject: `About your request — ${settings.business_name}`,
      html: `<div style="font-family:Georgia,serif;color:#1a120d;">
        <h2 style="color:#5c1024;">We couldn't confirm that time</h2>
        <p>Unfortunately we're not able to fit your ${escapeHtml(service.name)} request at ${escapeHtml(appointment.start_at)}${reason ? `: ${escapeHtml(reason)}` : "."}</p>
        <p>We'd love to find a time that works — please choose another slot whenever you're ready.</p>
        <p style="margin-top:16px;"><a href="${origin}/booking" style="color:#5c1024;">Choose a new time &rarr;</a></p>
      </div>`,
    });
  } catch (err) {
    // Non-fatal.
  }
}
