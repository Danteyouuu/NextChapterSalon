// GET /team
import { renderHead, renderNav, renderFooter, escapeHtml } from "../lib/layout.js";
import { listStylists } from "../lib/db.js";
import { placeholderTile } from "./_partials.js";

export async function onRequestGet(context) {
  const { env } = context;
  const stylists = await listStylists(env, { activeOnly: true });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
${renderHead({ title: "Our Team", description: "Meet the stylists and colorists behind Next Chapter Salon.", path: "/team" })}
</head>
<body>
${renderNav("/team")}

<header class="page-header">
  <div class="wrap">
    <span class="eyebrow">The Team</span>
    <h1>Meet the Stylists</h1>
    <p class="lede center">Every chair is held by someone who trained for it. Get to know who you'll be sitting with.</p>
  </div>
</header>

<section class="section">
  <div class="wrap">
    <div class="grid grid-3">
      ${stylists
        .map(
          (s) => `
      <div class="card card--framed reveal" style="text-align:center;">
        <div style="max-width:200px;margin:0 auto 20px;">
          ${placeholderTile({ label: s.name, icon: "user", imageUrl: s.photo_url })}
        </div>
        <h3 style="margin-bottom:2px;">${escapeHtml(s.name)}</h3>
        <span class="eyebrow" style="margin-bottom:14px;">${escapeHtml(s.title || "Stylist")}</span>
        <p class="text-dim" style="font-size:0.95rem;">${escapeHtml(s.bio || "")}</p>
        <a class="btn btn--ghost btn--sm" href="/booking" style="margin-top:10px;">Book with ${escapeHtml(s.name.split(" ")[0])}</a>
      </div>`
        )
        .join("")}
    </div>
  </div>
</section>

<section class="section section--panel" style="text-align:center;">
  <div class="wrap">
    <span class="eyebrow reveal">No Preference?</span>
    <h2 class="reveal">We'll Match You Perfectly</h2>
    <p class="lede center reveal">Not sure who to choose? Leave it to us &mdash; every stylist trains to the same standard.</p>
    <div class="hero__actions reveal">
      <a class="btn btn--gold" href="/booking">Reserve Your Chapter</a>
    </div>
  </div>
</section>

${renderFooter()}
</body>
</html>`;

  return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}
