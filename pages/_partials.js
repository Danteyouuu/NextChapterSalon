// Small reusable HTML snippets shared across pages/*.js. Prefixed with an
// underscore so it's obviously not a route itself (router.js only imports
// actual page/api modules).

import { escapeHtml, escapeAttr } from "../lib/layout.js";

const ICONS = {
  camera: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M4 8h3l2-2h6l2 2h3v11H4V8Z"/><circle cx="12" cy="13" r="3.5"/></svg>`,
  book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M12 5c-2-1.5-5-2-8-1.5v14c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5v-14c-3-.5-6 0-8 1.5Z"/><path d="M12 5v14"/></svg>`,
  user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 5-6 8-6s6.5 2 8 6"/></svg>`,
};

// Elegant "no photo yet" tile — used across Home/Gallery/Team so the site
// looks intentional rather than broken before real photography exists.
// If item.image_url is set, render the real image instead.
export function placeholderTile({ label, icon = "camera", imageUrl = null }) {
  if (imageUrl) {
    return `<div class="placeholder-tile" style="padding:0;overflow:hidden;">
      <img src="${escapeAttr(imageUrl)}" alt="${escapeAttr(label)}" style="width:100%;height:100%;object-fit:cover;">
    </div>`;
  }
  return `<div class="placeholder-tile">
    ${ICONS[icon] || ICONS.camera}
    <span class="pt-label">${escapeHtml(label)}</span>
    <span style="font-size:0.7rem;color:var(--cream-faint);">Photo coming soon</span>
  </div>`;
}

export function starRating(rating) {
  const full = Math.max(0, Math.min(5, Number(rating) || 5));
  let stars = "";
  for (let i = 0; i < 5; i++) {
    stars += i < full
      ? `<span style="color:var(--gold);">&#9733;</span>`
      : `<span style="color:var(--gold-dim);opacity:0.4;">&#9733;</span>`;
  }
  return `<div style="font-size:0.9rem;letter-spacing:2px;">${stars}</div>`;
}

export function moneyFromCents(cents, isFrom) {
  return `${isFrom ? "From " : ""}$${(Number(cents) / 100).toFixed(0)}`;
}
