// Shared page chrome (head/nav/footer) for every next-chapter-salon page —
// kept in one place so 10+ hand-written HTML pages stay visually consistent
// without a templating engine or build step, matching this repo's existing
// no-framework convention (see booking-system/pages/*.js for the same idea).

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/services", label: "Services" },
  { href: "/gallery", label: "Gallery" },
  { href: "/team", label: "Team" },
  { href: "/contact", label: "Contact" },
];

const FOOTER_EXPLORE = [
  { href: "/about", label: "Our Story" },
  { href: "/services", label: "Services & Pricing" },
  { href: "/team", label: "Meet the Stylists" },
  { href: "/gallery", label: "Gallery" },
  { href: "/testimonials", label: "Client Stories" },
];

const FOOTER_VISIT = [
  { href: "/booking", label: "Book an Appointment" },
  { href: "/gift-cards", label: "Gift Cards" },
  { href: "/policies", label: "Salon Policies" },
  { href: "/contact", label: "Directions & Hours" },
];

export function renderHead({ title, description, path = "" }) {
  const fullTitle = title
    ? `${title} — Next Chapter Salon`
    : "Next Chapter Salon — Every Ending Is a Beautiful Beginning";
  const desc = description ||
    "Next Chapter Salon is a boutique hair studio where every visit begins a new story — color, cuts, and treatments crafted with old-world care.";
  return `
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(fullTitle)}</title>
<meta name="description" content="${escapeAttr(desc)}">
<meta property="og:title" content="${escapeAttr(fullTitle)}">
<meta property="og:description" content="${escapeAttr(desc)}">
<meta property="og:type" content="website">
<meta property="og:image" content="/assets/logo-hero.png">
<meta name="theme-color" content="#0A0705">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">
<link rel="icon" type="image/png" sizes="192x192" href="/assets/favicon-192.png">
<link rel="apple-touch-icon" href="/assets/favicon-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;0,900;1,600&family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=Cormorant+Garamond:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/theme.css">`;
}

export function renderNav(activePath = "") {
  const links = NAV_LINKS.map(
    (l) => `<a href="${l.href}"${l.href === activePath ? ' class="is-active"' : ""}>${l.label}</a>`
  ).join("\n        ");
  const drawerLinks = NAV_LINKS.concat([
    { href: "/gift-cards", label: "Gift Cards" },
    { href: "/policies", label: "Policies" },
  ])
    .map((l) => `<a href="${l.href}">${l.label}</a>`)
    .join("\n      ");

  return `
<nav class="nav">
  <div class="nav__inner">
    <a class="nav__brand" href="/">
      <img src="/assets/logo-nav.webp" alt="Next Chapter Salon">
    </a>
    <ul class="nav__links">
      <li>${links.replace(/\n\s+/g, "</li>\n        <li>")}</li>
    </ul>
    <div class="nav__cta">
      <a class="btn btn--gold btn--sm" href="/booking"><span class="btn-full-label">Book&nbsp;</span>Now</a>
    </div>
    <button class="nav__toggle" aria-label="Toggle menu" aria-expanded="false">&#9776;</button>
  </div>
  <div class="nav__drawer">
      ${drawerLinks}
  </div>
</nav>`;
}

export function renderFooter() {
  const explore = FOOTER_EXPLORE.map((l) => `<li><a href="${l.href}">${l.label}</a></li>`).join("\n          ");
  const visit = FOOTER_VISIT.map((l) => `<li><a href="${l.href}">${l.label}</a></li>`).join("\n          ");

  return `
<footer class="footer">
  <div class="wrap">
    <div class="footer__grid">
      <div>
        <img src="/assets/logo-nav.webp" alt="Next Chapter Salon" style="height:52px;width:auto;margin-bottom:16px;">
        <p style="font-style:italic;color:var(--cream-faint);max-width:280px;">Every ending is a beautiful beginning. A boutique salon for the next chapter of you.</p>
        <div class="footer__social" style="margin-top:20px;">
          <a href="#" aria-label="Instagram">IG</a>
          <a href="#" aria-label="Facebook">FB</a>
          <a href="#" aria-label="Pinterest">PT</a>
        </div>
      </div>
      <div>
        <h4>Explore</h4>
        <ul>
          ${explore}
        </ul>
      </div>
      <div>
        <h4>Visit</h4>
        <ul>
          ${visit}
        </ul>
      </div>
      <div>
        <h4>Hours</h4>
        <ul style="color:var(--cream-dim);">
          <li>Tue &ndash; Fri: 10am &ndash; 7pm</li>
          <li>Saturday: 9am &ndash; 5pm</li>
          <li>Sun &ndash; Mon: Closed</li>
        </ul>
        <h4 style="margin-top:24px;">Contact</h4>
        <ul>
          <li><a href="tel:+15555550142">(555) 555-0142</a></li>
          <li><a href="mailto:hello@nextchaptersalon.com">hello@nextchaptersalon.com</a></li>
        </ul>
      </div>
    </div>
    <div class="footer__bottom">
      <span>&copy; ${new Date().getFullYear()} Next Chapter Salon. All rights reserved.</span>
      <span>Crafted with old-world care, one chapter at a time.</span>
    </div>
  </div>
</footer>
<script src="/assets/shared.js"></script>`;
}

export function escapeHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, "&quot;");
}

export { toScriptJson } from "./http.js";
