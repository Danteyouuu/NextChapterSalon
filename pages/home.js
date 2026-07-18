// GET /
import { renderHead, renderNav, renderFooter, escapeHtml } from "../lib/layout.js";
import { listServicesGroupedByCategory, listTestimonials, listGalleryItems, getSettings } from "../lib/db.js";
import { placeholderTile, starRating } from "./_partials.js";

export async function onRequestGet(context) {
  const { env } = context;
  const [settings, categories, testimonials, gallery] = await Promise.all([
    getSettings(env),
    listServicesGroupedByCategory(env),
    listTestimonials(env),
    listGalleryItems(env),
  ]);

  const featuredServices = categories.flatMap((c) => c.services).slice(0, 6);
  const featuredTestimonials = testimonials.slice(0, 3);
  const featuredGallery = gallery.slice(0, 4);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
${renderHead({ path: "/" })}
</head>
<body>
${renderNav("/")}

<header class="hero">
  <div class="wrap">
    <span class="eyebrow reveal">Boutique Hair Studio</span>
    <div class="hero__logo reveal">
      <img src="/assets/logo-hero.webp" alt="Next Chapter Salon">
    </div>
    <p class="lede reveal">${escapeHtml(settings?.tagline || "Every Ending Is a Beautiful Beginning")}. A private studio where color, cuts, and care are written one chapter at a time &mdash; for you.</p>
    <div class="hero__actions reveal">
      <a class="btn btn--gold" href="/booking">Reserve Your Chapter</a>
      <a class="btn btn--ghost" href="/services">View the Menu</a>
    </div>
  </div>
</header>

<section class="section">
  <div class="wrap">
    <div class="center" style="max-width:640px;">
      <span class="eyebrow reveal">The Experience</span>
      <h2 class="reveal">Three Chapters, One Visit</h2>
      <div class="flourish reveal"><span>&#10022;</span></div>
    </div>
    <div class="grid grid-3" style="margin-top:56px;">
      <div class="card card--framed reveal">
        <span class="eyebrow" style="margin-bottom:18px;">Chapter I</span>
        <h3>The Consultation</h3>
        <p class="text-dim">Every story starts with listening. We sit down together &mdash; no rush, no assumptions &mdash; to understand exactly where you are, and where you want to go.</p>
      </div>
      <div class="card card--framed reveal">
        <span class="eyebrow" style="margin-bottom:18px;">Chapter II</span>
        <h3>The Craft</h3>
        <p class="text-dim">Precision color, cutting, and technique from a team trained to treat your hair like the fine material it is. Slow, deliberate, exact.</p>
      </div>
      <div class="card card--framed reveal">
        <span class="eyebrow" style="margin-bottom:18px;">Chapter III</span>
        <h3>The Reveal</h3>
        <p class="text-dim">The finish is never rushed. You leave not just styled, but seen &mdash; ready for whatever the next chapter holds.</p>
      </div>
    </div>
  </div>
</section>

<section class="section section--panel">
  <div class="wrap">
    <div class="center" style="max-width:640px;">
      <span class="eyebrow reveal">Signature Services</span>
      <h2 class="reveal">A Menu Worth Savoring</h2>
      <div class="flourish reveal"><span>&#10022;</span></div>
    </div>
    <div class="grid grid-3" style="margin-top:48px;">
      ${featuredServices
        .map(
          (s) => `
      <div class="card reveal">
        <h3 style="margin-bottom:6px;">${escapeHtml(s.name)}</h3>
        <p class="text-dim" style="font-size:0.95rem;">${escapeHtml(s.description || "")}</p>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:18px;padding-top:14px;border-top:1px solid rgba(201,166,107,0.15);">
          <span class="text-gold" style="font-family:var(--font-label);letter-spacing:0.06em;">${s.price_is_from ? "From " : ""}$${(s.price_cents / 100).toFixed(0)}</span>
          <span class="text-dim" style="font-size:0.85rem;">${s.duration_minutes} min</span>
        </div>
      </div>`
        )
        .join("")}
    </div>
    <div class="center" style="margin-top:48px;">
      <a class="btn btn--ghost" href="/services">View Full Menu &amp; Pricing</a>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="grid grid-2" style="align-items:center;gap:64px;">
      <div class="reveal">
        <span class="eyebrow">Our Story</span>
        <h2>Every Ending Is a Beautiful Beginning</h2>
        <p class="text-dim">Next Chapter Salon was founded on a simple belief: a haircut is never just a haircut. It's a punctuation mark &mdash; the close of one chapter, the opening line of the next. Our studio is built like a well-loved library: warm, unhurried, and entirely yours for the hour.</p>
        <a class="btn btn--ghost btn--sm" href="/about" style="margin-top:8px;">Read Our Story</a>
      </div>
      <div class="reveal">
        ${placeholderTile({ label: "Studio Interior", icon: "book" })}
      </div>
    </div>
  </div>
</section>

<section class="section section--panel">
  <div class="wrap">
    <div class="center" style="max-width:640px;">
      <span class="eyebrow reveal">Gallery</span>
      <h2 class="reveal">Recent Chapters</h2>
      <div class="flourish reveal"><span>&#10022;</span></div>
    </div>
    <div class="grid grid-4" style="margin-top:48px;">
      ${featuredGallery.map((g) => `<div class="reveal">${placeholderTile({ label: g.label, icon: "camera" })}</div>`).join("")}
    </div>
    <div class="center" style="margin-top:48px;">
      <a class="btn btn--ghost" href="/gallery">View Full Gallery</a>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="center" style="max-width:640px;">
      <span class="eyebrow reveal">Client Stories</span>
      <h2 class="reveal">Their Next Chapters</h2>
      <div class="flourish reveal"><span>&#10022;</span></div>
    </div>
    <div class="grid grid-3" style="margin-top:48px;">
      ${featuredTestimonials
        .map(
          (t) => `
      <div class="card reveal">
        ${starRating(t.rating)}
        <p style="font-style:italic;color:var(--cream-dim);margin-top:14px;">&ldquo;${escapeHtml(t.quote)}&rdquo;</p>
        <p class="text-gold" style="font-family:var(--font-label);letter-spacing:0.06em;margin-top:16px;margin-bottom:0;">&mdash; ${escapeHtml(t.client_name)}${t.service_name ? `, <span class="text-dim">${escapeHtml(t.service_name)}</span>` : ""}</p>
      </div>`
        )
        .join("")}
    </div>
  </div>
</section>

<section class="section section--panel" style="text-align:center;">
  <div class="wrap">
    <span class="eyebrow reveal">Begin</span>
    <h2 class="reveal">Your Next Chapter Is One Appointment Away</h2>
    <p class="lede center reveal">Requests are reviewed personally &mdash; not auto-confirmed &mdash; so we can give every visit the attention it deserves.</p>
    <div class="hero__actions reveal">
      <a class="btn btn--gold" href="/booking">Reserve Your Chapter</a>
      <a class="btn btn--ghost" href="/contact">Ask a Question</a>
    </div>
  </div>
</section>

${renderFooter()}
</body>
</html>`;

  return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}
