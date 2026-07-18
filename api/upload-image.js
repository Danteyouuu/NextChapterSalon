// POST /api/upload-image?manageToken=...
// Owner-only. Body is the raw image bytes (Content-Type: image/jpeg,
// image/png, or image/webp) -- the dashboard's crop/zoom widget renders the
// final cropped image to a <canvas> client-side and uploads the resulting
// blob directly, so there's no multipart form parsing to deal with here.
//
// manageToken travels in the query string rather than a JSON body because
// this is a binary upload (same reasoning dashboard-data.js already uses
// for its GET requests -- see lib/http.js's getClientIp comment for the
// general pattern of "the token is the credential, it just has to travel
// somewhere other than a cookie").
//
// Stored in R2 under a random key (crypto.randomUUID(), never guessable,
// never reused) and served back by pages/image-serve.js at /images/:key.
// Cache-Control is immutable/1-year since keys are never overwritten --
// replacing a photo uploads a *new* key rather than mutating the old one,
// so there's never a stale-cache problem.

import { requireOwner } from "../lib/auth.js";

const ALLOWED_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_BYTES = 8 * 1024 * 1024; // 8MB -- generous for a client-side-cropped photo, small enough to not be a DoS vector

export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const manageToken = url.searchParams.get("manageToken");

  const settings = await requireOwner(env, manageToken);
  if (!settings) return json({ ok: false, error: "Unauthorized" }, 401);

  if (!env.IMAGES) {
    return json({ ok: false, error: "Image storage is not configured on this deployment." }, 500);
  }

  const contentType = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  const ext = ALLOWED_TYPES[contentType];
  if (!ext) {
    return json({ ok: false, error: "Unsupported image type. Use JPEG, PNG, or WebP." }, 400);
  }

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0) return json({ ok: false, error: "Empty upload." }, 400);
  if (bytes.byteLength > MAX_BYTES) return json({ ok: false, error: "Image is too large (max 8MB)." }, 413);

  const key = `${crypto.randomUUID()}.${ext}`;
  await env.IMAGES.put(key, bytes, {
    httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" },
  });

  return json({ ok: true, url: `/images/${key}` });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
