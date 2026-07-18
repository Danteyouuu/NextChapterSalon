// POST /api/contact
// Public contact-form submission. Stores the inquiry and emails the owner.

import { getSettings, createContactInquiry } from "../lib/db.js";
import { sendBookingEmail, escapeHtml } from "../lib/email.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  let data;
  try {
    data = await request.json();
  } catch (err) {
    return json({ ok: false, error: "Invalid request body" }, 400);
  }

  const name = String(data.name || "").trim().slice(0, 200);
  const email = String(data.email || "").trim().slice(0, 200);
  const phone = String(data.phone || "").trim().slice(0, 60);
  const message = String(data.message || "").trim().slice(0, 2000);

  if (!name || !email || !message) {
    return json({ ok: false, error: "Please fill in your name, email, and message." }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, error: "That doesn't look like a valid email address." }, 400);
  }

  await createContactInquiry(env, { name, email, phone, message });

  const settings = await getSettings(env);
  if (settings) {
    try {
      await sendBookingEmail(env, {
        to: settings.notify_email,
        subject: `New inquiry from ${name}`,
        html: `<div style="font-family:Georgia,serif;color:#1a120d;">
          <h2 style="color:#5c1024;">New contact inquiry</h2>
          <table style="border-collapse:collapse;width:100%;max-width:480px;">
            <tr><td style="padding:8px 12px;border:1px solid #ddd;background:#f7f2ea;font-weight:600;">Name</td><td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml(name)}</td></tr>
            <tr><td style="padding:8px 12px;border:1px solid #ddd;background:#f7f2ea;font-weight:600;">Email</td><td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml(email)}</td></tr>
            <tr><td style="padding:8px 12px;border:1px solid #ddd;background:#f7f2ea;font-weight:600;">Phone</td><td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml(phone || "(not given)")}</td></tr>
            <tr><td style="padding:8px 12px;border:1px solid #ddd;background:#f7f2ea;font-weight:600;">Message</td><td style="padding:8px 12px;border:1px solid #ddd;white-space:pre-wrap;">${escapeHtml(message)}</td></tr>
          </table>
        </div>`,
        replyTo: email,
      });
    } catch (err) {
      // Inquiry is already saved either way.
    }
  }

  return json({ ok: true });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
