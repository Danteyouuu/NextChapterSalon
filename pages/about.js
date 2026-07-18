// GET /about
import { renderHead, renderNav, renderFooter, escapeHtml } from "../lib/layout.js";
import { getSettings } from "../lib/db.js";
import { placeholderTile } from "./_partials.js";

export async function onRequestGet(context) {
  const { env } = context;
  const settings = await getSettings(env);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
${renderHead({ title: "About", description: "The story, philosophy, and studio behind Next Chapter Salon.", path: "/about" })}
</head>
<body>
${renderNav("/about")}

<header class="page-header">
  <div class="wrap">
    <span class="eyebrow">Our Story</span>
    <h1>About Next Chapter</h1>
    <p class="lede center">${escapeHtml(settings?.tagline || "Every Ending Is a Beautiful Beginning")}</p>
  </div>
</header>

<section class="section">
  <div class="wrap">
    <div class="grid grid-2" style="align-items:center;gap:64px;">
      <div class="reveal">
        ${placeholderTile({ label: "Founder Portrait", icon: "user" })}
      </div>
      <div class="reveal">
        <span class="eyebrow">How It Began</span>
        <h2>A Studio Built Like a Favorite Book</h2>
        <p class="text-dim">Next Chapter Salon started with one idea: a great haircut shouldn't be rushed, any more than a good story should rush its opening. We wanted a studio that felt less like a storefront and more like a favorite reading room, with warm light, quiet corners, and the sense that something good is about to happen in that chair.</p>
        <p class="text-dim">Every detail, from consultation to final polish, is paced on purpose. We're not trying to rush anyone out the door to make room for the next appointment.</p>
      </div>
    </div>
  </div>
</section>

<section class="section section--panel">
  <div class="wrap">
    <div class="center" style="max-width:680px;">
      <span class="eyebrow reveal">Our Philosophy</span>
      <h2 class="reveal">Three Principles We Don't Compromise On</h2>
      <div class="flourish reveal"><span>&#10022;</span></div>
    </div>
    <div class="grid grid-3" style="margin-top:48px;">
      <div class="card card--framed reveal">
        <h3>Unhurried Craft</h3>
        <p class="text-dim">We book fewer clients per day than most studios do, on purpose. Rushed color leads to mistakes, and we'd rather take the time to get it right.</p>
      </div>
      <div class="card card--framed reveal">
        <h3>Personal Review</h3>
        <p class="text-dim">A real person reviews every appointment request before it's confirmed, not an algorithm. We want to know who's coming in, and why.</p>
      </div>
      <div class="card card--framed reveal">
        <h3>Honest Consultation</h3>
        <p class="text-dim">If a color, cut, or treatment isn't right for your hair, we'll say so before we start, not after. Your hair has to live with the result long after you leave the chair.</p>
      </div>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="center" style="max-width:640px;">
      <span class="eyebrow reveal">The Space</span>
      <h2 class="reveal">Step Inside</h2>
      <div class="flourish reveal"><span>&#10022;</span></div>
    </div>
    <div class="grid grid-3" style="margin-top:48px;">
      <div class="reveal">${placeholderTile({ label: "Reception & Reading Nook", icon: "book" })}</div>
      <div class="reveal">${placeholderTile({ label: "Color Bar", icon: "camera" })}</div>
      <div class="reveal">${placeholderTile({ label: "Private Styling Suite", icon: "camera" })}</div>
    </div>
  </div>
</section>

<section class="section section--panel" style="text-align:center;">
  <div class="wrap">
    <span class="eyebrow reveal">Meet the Team</span>
    <h2 class="reveal">The People Behind Every Chapter</h2>
    <div class="hero__actions reveal">
      <a class="btn btn--gold" href="/team">Meet the Stylists</a>
      <a class="btn btn--ghost" href="/booking">Reserve Your Chapter</a>
    </div>
  </div>
</section>

${renderFooter()}
</body>
</html>`;

  return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}
