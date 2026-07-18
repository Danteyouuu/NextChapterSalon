// GET /testimonials
import { renderHead, renderNav, renderFooter, escapeHtml } from "../lib/layout.js";
import { listTestimonials } from "../lib/db.js";
import { starRating } from "./_partials.js";

export async function onRequestGet(context) {
  const { env } = context;
  const testimonials = await listTestimonials(env);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
${renderHead({ title: "Client Stories", description: "What clients say after their visit to Next Chapter Salon.", path: "/testimonials" })}
</head>
<body>
${renderNav("/testimonials")}

<header class="page-header">
  <div class="wrap">
    <span class="eyebrow">Client Stories</span>
    <h1>Their Next Chapters</h1>
    <p class="lede center">A few words from clients who trusted us with theirs.</p>
  </div>
</header>

<section class="section">
  <div class="wrap">
    <div class="grid grid-3">
      ${testimonials
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
    <span class="eyebrow reveal">Write Yours</span>
    <h2 class="reveal">Start Your Next Chapter</h2>
    <div class="hero__actions reveal">
      <a class="btn btn--gold" href="/booking">Book Now</a>
    </div>
  </div>
</section>

${renderFooter()}
</body>
</html>`;

  return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}
