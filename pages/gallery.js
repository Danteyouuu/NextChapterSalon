// GET /gallery
import { renderHead, renderNav, renderFooter, escapeHtml } from "../lib/layout.js";
import { listGalleryItems } from "../lib/db.js";
import { placeholderTile } from "./_partials.js";

export async function onRequestGet(context) {
  const { env } = context;
  const items = await listGalleryItems(env);
  const categories = ["All", ...new Set(items.map((i) => i.category))];

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
${renderHead({ title: "Gallery", description: "Color, cuts, and studio moments from Next Chapter Salon.", path: "/gallery" })}
</head>
<body>
${renderNav("/gallery")}

<header class="page-header">
  <div class="wrap">
    <span class="eyebrow">Gallery</span>
    <h1>A Look Inside</h1>
    <p class="lede center">Real transformations are added here as they happen &mdash; this gallery grows with every chapter. Tiles below marked &ldquo;coming soon&rdquo; are reserved for photography.</p>
  </div>
</header>

<section class="section">
  <div class="wrap">
    <div class="grid grid-4">
      ${items
        .map(
          (item) => `
      <div class="reveal">
        ${placeholderTile({ label: item.label, icon: "camera", imageUrl: item.image_url })}
        <p style="text-align:center;font-family:var(--font-label);letter-spacing:0.06em;font-size:0.85rem;color:var(--cream-dim);margin-top:10px;">${escapeHtml(item.label)}</p>
      </div>`
        )
        .join("")}
    </div>
  </div>
</section>

<section class="section section--panel" style="text-align:center;">
  <div class="wrap">
    <span class="eyebrow reveal">Follow Along</span>
    <h2 class="reveal">More on Instagram</h2>
    <p class="lede center reveal">The freshest work is posted daily &mdash; link your handle here once your account is ready.</p>
    <div class="hero__actions reveal">
      <a class="btn btn--gold" href="/booking">Book Your Look</a>
    </div>
  </div>
</section>

${renderFooter()}
</body>
</html>`;

  return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}
