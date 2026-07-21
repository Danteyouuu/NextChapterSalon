// GET /contact
import { renderHead, renderNav, renderFooter, escapeHtml, toScriptJson } from "../lib/layout.js";
import { getSettings } from "../lib/db.js";

export async function onRequestGet(context) {
  const { env } = context;
  const settings = await getSettings(env);
  const address = [settings?.address_line1, settings?.address_line2].filter(Boolean).join(", ");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
${renderHead({ title: "Contact", description: "Get in touch with Next Chapter Salon — hours, location, and inquiries.", path: "/contact" })}
</head>
<body>
${renderNav("/contact")}

<header class="page-header">
  <div class="wrap">
    <span class="eyebrow">Get in Touch</span>
    <h1>Contact Us</h1>
    <p class="lede center">Questions before you book? We're glad to help.</p>
  </div>
</header>

<section class="section">
  <div class="wrap">
    <div class="grid grid-2" style="gap:64px;align-items:flex-start;">
      <div class="reveal">
        <h3>Visit</h3>
        <p class="text-dim">${escapeHtml(address || "Address on request")}</p>
        ${
          address
            ? `<div style="aspect-ratio:16/10;margin:20px 0;border-radius:var(--radius, 8px);overflow:hidden;">
          <iframe
            src="https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed"
            width="100%" height="100%" style="border:0;display:block;"
            loading="lazy" referrerpolicy="no-referrer-when-downgrade"
            title="Map to ${escapeHtml(settings?.business_name || "Next Chapter Salon")}"></iframe>
        </div>`
            : `<div class="placeholder-tile" style="aspect-ratio:16/10;margin:20px 0;">
          <span class="pt-label">Map</span>
          <span style="font-size:0.7rem;color:var(--cream-faint);">Embed coming soon</span>
        </div>`
        }
        <h3>Hours</h3>
        <p class="text-dim">Tue &ndash; Fri: 10am &ndash; 7pm<br>Saturday: 9am &ndash; 5pm<br>Sun &ndash; Mon: Closed</p>
        <h3>Reach Us Directly</h3>
        <p class="text-dim">
          ${settings?.phone ? `<a href="tel:${escapeHtml(settings.phone.replace(/[^\d+]/g, ""))}">${escapeHtml(settings.phone)}</a><br>` : ""}
          <a href="mailto:${escapeHtml(settings?.notify_email || "hello@nextchaptersalon.com")}">${escapeHtml(settings?.notify_email || "hello@nextchaptersalon.com")}</a>
        </p>
      </div>

      <div class="card card--framed reveal">
        <h3 style="margin-bottom:20px;">Send an Inquiry</h3>
        <form id="contactForm">
          <label for="name">Name</label>
          <input id="name" name="name" required maxlength="120" placeholder="Your name">
          <div class="field-row">
            <div>
              <label for="email">Email</label>
              <input id="email" name="email" type="email" required maxlength="200" placeholder="you@email.com">
            </div>
            <div>
              <label for="phone">Phone (optional)</label>
              <input id="phone" name="phone" maxlength="60" placeholder="(555) 555-0100">
            </div>
          </div>
          <label for="message">Message</label>
          <textarea id="message" name="message" required maxlength="2000" placeholder="How can we help?"></textarea>
          <button type="submit" class="btn btn--gold btn--block" id="submitBtn">Send Inquiry</button>
          <p id="formMsg" style="margin-top:14px;font-size:0.9rem;"></p>
        </form>
      </div>
    </div>
  </div>
</section>

${renderFooter()}
<script>
  var SETTINGS = ${toScriptJson({ hasPhone: !!settings?.phone })};
  var form = document.getElementById('contactForm');
  var submitBtn = document.getElementById('submitBtn');
  var formMsg = document.getElementById('formMsg');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';
    formMsg.textContent = '';
    fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: document.getElementById('name').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        message: document.getElementById('message').value,
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.ok) {
          formMsg.style.color = '#9fd17a';
          formMsg.textContent = 'Thank you — we will be in touch soon.';
          form.reset();
        } else {
          formMsg.style.color = '#e08aa0';
          formMsg.textContent = res.error || 'Something went wrong, please try again.';
          submitBtn.disabled = false;
        }
        submitBtn.textContent = 'Send Inquiry';
      })
      .catch(function () {
        formMsg.style.color = '#e08aa0';
        formMsg.textContent = 'Something went wrong, please try again.';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Inquiry';
      });
  });
</script>
</body>
</html>`;

  return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}
