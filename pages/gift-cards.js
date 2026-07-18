// GET /gift-cards
// Placeholder page — no online gift-card purchase flow in this version (see
// next-chapter-salon/README.md for what a real integration would need).
// Captures interest via the contact form in the meantime.
import { renderHead, renderNav, renderFooter } from "../lib/layout.js";

export async function onRequestGet(context) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
${renderHead({ title: "Gift Cards", description: "Gift a chapter — Next Chapter Salon gift cards.", path: "/gift-cards" })}
</head>
<body>
${renderNav("/gift-cards")}

<header class="page-header">
  <div class="wrap">
    <span class="eyebrow">Gift a Chapter</span>
    <h1>Gift Cards</h1>
    <p class="lede center">The gift of a fresh start, for someone else's next chapter.</p>
  </div>
</header>

<section class="section">
  <div class="wrap center" style="max-width:620px;">
    <div class="card card--framed reveal" style="text-align:center;">
      <span class="eyebrow">Coming Soon</span>
      <h3>Online Gift Cards</h3>
      <p class="text-dim">We're putting the finishing touches on digital gift cards. In the meantime, physical gift cards are available in-studio, or reach out and we'll arrange one for you.</p>
      <a class="btn btn--gold" href="/contact" style="margin-top:12px;">Request a Gift Card</a>
    </div>
  </div>
</section>

${renderFooter()}
</body>
</html>`;

  return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}
