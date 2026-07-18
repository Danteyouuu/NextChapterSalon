// GET /services
import { renderHead, renderNav, renderFooter, escapeHtml } from "../lib/layout.js";
import { listServicesGroupedByCategory } from "../lib/db.js";
import { moneyFromCents } from "./_partials.js";

export async function onRequestGet(context) {
  const { env } = context;
  const categories = await listServicesGroupedByCategory(env);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
${renderHead({ title: "Services & Pricing", description: "The full Next Chapter Salon service menu — color, cuts, treatments, extensions, and bridal styling.", path: "/services" })}
</head>
<body>
${renderNav("/services")}

<header class="page-header">
  <div class="wrap">
    <span class="eyebrow">The Menu</span>
    <h1>Services &amp; Pricing</h1>
    <p class="lede center">Every service begins with a consultation. Pricing reflects hair length, density, and complexity, so think of these as a starting point rather than a final quote.</p>
  </div>
</header>

${categories
  .map(
    (cat, idx) => `
<section class="section${idx % 2 === 1 ? " section--panel" : ""}">
  <div class="wrap">
    <span class="eyebrow reveal">${String(idx + 1).padStart(2, "0")}</span>
    <h2 class="reveal" style="margin-bottom:36px;">${escapeHtml(cat.name)}</h2>
    <div class="grid grid-2">
      ${cat.services
        .map(
          (s) => `
      <div class="card reveal" style="display:flex;justify-content:space-between;gap:24px;align-items:flex-start;">
        <div>
          <h3 style="margin-bottom:6px;">${escapeHtml(s.name)}</h3>
          <p class="text-dim" style="font-size:0.95rem;margin-bottom:0;">${escapeHtml(s.description || "")}</p>
          <span class="text-dim" style="font-size:0.82rem;">${s.duration_minutes} min${s.has_downtime ? " &middot; includes processing time" : ""}</span>
        </div>
        <div class="text-gold" style="font-family:var(--font-label);font-size:1.15rem;white-space:nowrap;letter-spacing:0.03em;">${moneyFromCents(s.price_cents, s.price_is_from)}</div>
      </div>`
        )
        .join("")}
    </div>
  </div>
</section>`
  )
  .join("")}

<section class="section" style="text-align:center;">
  <div class="wrap">
    <span class="eyebrow reveal">Ready?</span>
    <h2 class="reveal">Reserve Your Chapter</h2>
    <p class="lede center reveal">Not sure which service fits? Reach out and we'll help you choose.</p>
    <div class="hero__actions reveal">
      <a class="btn btn--gold" href="/booking">Book Now</a>
      <a class="btn btn--ghost" href="/contact">Ask First</a>
    </div>
  </div>
</section>

${renderFooter()}
</body>
</html>`;

  return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}
