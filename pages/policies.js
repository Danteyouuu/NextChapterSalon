// GET /policies
import { renderHead, renderNav, renderFooter } from "../lib/layout.js";

export async function onRequestGet(context) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
${renderHead({ title: "Salon Policies", description: "Cancellation, late arrival, and deposit policies for Next Chapter Salon.", path: "/policies" })}
</head>
<body>
${renderNav("/policies")}

<header class="page-header">
  <div class="wrap">
    <span class="eyebrow">Good to Know</span>
    <h1>Salon Policies</h1>
    <p class="lede center">A few house rules that keep every client's time &mdash; including yours &mdash; respected.</p>
  </div>
</header>

<section class="section">
  <div class="wrap" style="max-width:800px;">
    <div class="card card--framed reveal" style="margin-bottom:28px;">
      <h3>Booking &amp; Confirmation</h3>
      <p class="text-dim">Every appointment request is reviewed personally before it's confirmed &mdash; you'll receive an email the moment we accept or need to adjust your request. Please wait for confirmation before making other plans around your appointment.</p>
    </div>
    <div class="card card--framed reveal" style="margin-bottom:28px;">
      <h3>Cancellations &amp; Rescheduling</h3>
      <p class="text-dim">We ask for at least 24 hours' notice to cancel or reschedule. Late cancellations and no-shows affect every stylist's day and the clients who couldn't get that slot &mdash; we appreciate the courtesy.</p>
    </div>
    <div class="card card--framed reveal" style="margin-bottom:28px;">
      <h3>Late Arrivals</h3>
      <p class="text-dim">We hold your reserved time, but arriving more than 15 minutes late may mean adjusting your service to fit the remaining window, or rescheduling entirely for more involved services like color or extensions.</p>
    </div>
    <div class="card card--framed reveal" style="margin-bottom:28px;">
      <h3>Deposits</h3>
      <p class="text-dim">Select services (color correction, extensions, bridal) may require a deposit to confirm. If applicable, this will be communicated when your request is reviewed.</p>
    </div>
    <div class="card card--framed reveal">
      <h3>Children &amp; Guests</h3>
      <p class="text-dim">Our studio is an intentionally quiet space. We love your littles, but ask that visits without a scheduled service be kept brief so every client can enjoy an unhurried appointment.</p>
    </div>
  </div>
</section>

<section class="section section--panel" style="text-align:center;">
  <div class="wrap">
    <span class="eyebrow reveal">Questions?</span>
    <h2 class="reveal">We're Happy to Help</h2>
    <div class="hero__actions reveal">
      <a class="btn btn--gold" href="/contact">Contact Us</a>
      <a class="btn btn--ghost" href="/booking">Book Now</a>
    </div>
  </div>
</section>

${renderFooter()}
</body>
</html>`;

  return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}
