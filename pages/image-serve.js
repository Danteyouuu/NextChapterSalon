// GET /images/:key
// Streams an uploaded image back out of R2. Public/unauthenticated by
// design -- these are the same photos that render on the public marketing
// site (gallery, team headshots), so there's nothing to gate here. Keys are
// random UUIDs (see api/upload-image.js), so this isn't directory-listable
// or guessable; it just serves the one object it's asked for or 404s.

export async function onRequestGet(context) {
  const { env, params } = context;
  const key = params.key;

  if (!env.IMAGES || !key) return new Response("Not found", { status: 404 });

  const object = await env.IMAGES.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  if (!headers.has("cache-control")) headers.set("Cache-Control", "public, max-age=31536000, immutable");

  return new Response(object.body, { headers });
}
