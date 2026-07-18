// GET /my-appointment/:manageToken
// Customer-facing status page — shows pending/confirmed/declined/canceled
// state and lets the client cancel their own request or confirmed booking.

import { renderHead, renderNav, renderFooter, escapeHtml, toScriptJson } from "../lib/layout.js";
import { getAppointmentByManageToken, getSettings } from "../lib/db.js";
import { utcToZonedParts } from "../lib/availability.js";

const STATUS_LABEL = {
  pending_review: "Pending Review",
  confirmed: "Confirmed",
  declined: "Not Confirmed",
  canceled: "Canceled",
  completed: "Completed",
};

const STATUS_PILL_CLASS = {
  pending_review: "pill--pending",
  confirmed: "pill--confirmed",
  declined: "pill--declined",
  canceled: "pill--declined",
  completed: "pill--confirmed",
};

export async function onRequestGet(context) {
  const { params, env } = context;
  const token = params.manageToken;

  const appointment = await getAppointmentByManageToken(env, token);
  const settings = await getSettings(env);

  if (!appointment) {
    return new Response(renderShell(settings, `<div class="center" style="padding:80px 0;"><h1>Not Found</h1><p class="text-dim">We couldn't find that appointment request.</p></div>`), {
      status: 404,
      headers: { "Content-Type": "text/html;charset=UTF-8" },
    });
  }

  const parts = utcToZonedParts(new Date(appointment.start_at), settings?.timezone || "America/Chicago");
  const canCancel = appointment.status === "pending_review" || appointment.status === "confirmed";

  const body = `
<header class="page-header">
  <div class="wrap">
    <span class="eyebrow">Your Appointment</span>
    <h1>${escapeHtml(appointment.service_name)}</h1>
    <div class="center"><span class="pill ${STATUS_PILL_CLASS[appointment.status] || "pill--pending"}">${STATUS_LABEL[appointment.status] || appointment.status}</span></div>
  </div>
</header>

<section class="section">
  <div class="wrap" style="max-width:560px;">
    <div class="card card--framed reveal">
      <div class="grid" style="gap:14px;">
        <div style="display:flex;justify-content:space-between;border-bottom:1px solid rgba(201,166,107,0.15);padding-bottom:10px;">
          <span class="text-dim">Date</span><span>${escapeHtml(parts.date)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;border-bottom:1px solid rgba(201,166,107,0.15);padding-bottom:10px;">
          <span class="text-dim">Time</span><span>${escapeHtml(parts.time)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span class="text-dim">Status</span><span>${STATUS_LABEL[appointment.status] || appointment.status}</span>
        </div>
      </div>
      ${
        appointment.status === "pending_review"
          ? `<p class="text-dim" style="margin-top:20px;">We personally review every request. You'll get an email the moment we confirm it or need to adjust it.</p>`
          : ""
      }
      ${
        appointment.status === "declined"
          ? `<p class="text-dim" style="margin-top:20px;">${appointment.decline_reason ? escapeHtml(appointment.decline_reason) : "We weren't able to confirm this time."} <a href="/booking">Choose another time &rarr;</a></p>`
          : ""
      }
      ${
        canCancel
          ? `<button class="btn btn--ghost btn--block" id="cancelBtn" style="margin-top:24px;">Cancel This ${appointment.status === "pending_review" ? "Request" : "Appointment"}</button>
             <p id="cancelMsg" style="margin-top:12px;font-size:0.9rem;"></p>`
          : ""
      }
    </div>
  </div>
</section>`;

  const script = canCancel
    ? `
<script>
  var TOKEN = ${toScriptJson(token)};
  var cancelBtn = document.getElementById('cancelBtn');
  cancelBtn.onclick = function () {
    if (!confirm('Cancel this appointment?')) return;
    cancelBtn.disabled = true;
    fetch('/api/cancel-appointment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manageToken: TOKEN }),
    }).then(function (r) { return r.json(); }).then(function (res) {
      var msg = document.getElementById('cancelMsg');
      if (res.ok) {
        msg.style.color = '#9fd17a';
        msg.textContent = 'Canceled.';
        cancelBtn.style.display = 'none';
      } else {
        msg.style.color = '#e08aa0';
        msg.textContent = res.error || 'Could not cancel.';
        cancelBtn.disabled = false;
      }
    });
  };
</script>`
    : "";

  return new Response(renderShell(settings, body, script), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}

function renderShell(settings, body, script = "") {
  return `<!DOCTYPE html>
<html lang="en">
<head>
${renderHead({ title: "Your Appointment", path: "" })}
</head>
<body>
${renderNav("")}
${body}
${renderFooter()}
${script}
</body>
</html>`;
}
