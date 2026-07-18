// POST /api/manage-content
// Owner-only. Replaces testimonials and/or gallery items in one call —
// separate from manage-services/manage-stylists since these are lower-risk
// "content" edits the dashboard can group together.

import { requireOwner } from "../lib/auth.js";
import { replaceTestimonials, replaceGalleryItems } from "../lib/db.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  let data;
  try {
    data = await request.json();
  } catch (err) {
    return json({ ok: false, error: "Invalid request body" }, 400);
  }

  const settings = await requireOwner(env, data.manageToken);
  if (!settings) return json({ ok: false, error: "Unauthorized" }, 401);

  const result = {};
  if (Array.isArray(data.testimonials)) {
    result.testimonials = await replaceTestimonials(env, data.testimonials);
  }
  if (Array.isArray(data.galleryItems)) {
    result.galleryItems = await replaceGalleryItems(env, data.galleryItems);
  }

  return json({ ok: true, ...result });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
