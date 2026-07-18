// Self-contained Resend sender for Next Chapter Salon — deliberately not
// importing functions/_lib/email.js so this folder has no dependency on the
// rest of the site. Reuses the same RESEND_API_KEY env var since it's the
// same Resend account, but that's a config choice, not a code dependency.

export function bytesToBase64(bytes) {
  const chunkSize = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

function textToBase64(str) {
  return bytesToBase64(new TextEncoder().encode(str));
}

// attachments: [{ filename, content }] — content is a base64-encoded string,
// or pass icsText to attach a .ics file directly.
export async function sendBookingEmail(env, { to, subject, html, replyTo, icsText, icsFilename }) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const attachments = icsText
    ? [{ filename: icsFilename || "appointment.ics", content: textToBase64(icsText) }]
    : undefined;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.BOOKING_EMAIL_FROM || env.RESEND_FROM || "Next Chapter Salon <bookings@nextchaptersalon.com>",
      to,
      reply_to: replyTo || undefined,
      subject,
      html,
      attachments,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Resend API error ${res.status}: ${text}`);
  }

  return res.json();
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export { escapeHtml };
