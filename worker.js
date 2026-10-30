// Serves the built app (./dist) and /api/ogp, which returns a page's preview image (og:image etc.).
// Browsers can't read other sites' HTML (CORS), so the Worker fetches it and proxies the image.

const UA = "Mozilla/5.0 (compatible; Tehon/1.0; +https://tehon.pikoponpoko.workers.dev/) facebookexternalhit/1.1";
const MAX_IMAGE = 8 << 20;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/bmp"];

export default {
  async fetch(req, env, ctx) {
    const u = new URL(req.url);
    if (u.pathname === "/api/ogp") return ogp(req, u, ctx);
    return env.ASSETS.fetch(req);
  },
};

async function ogp(req, u, ctx) {
  if (req.method !== "GET") return new Response(null, { status: 405 });
  let target;
  try {
    target = new URL(u.searchParams.get("url") || "");
  } catch {
    return miss(400);
  }
  if (!/^https?:$/.test(target.protocol)) return miss(400);

  const cache = caches.default;
  const key = new Request(u.toString());
  const hit = await cache.match(key);
  if (hit) return hit;

  let res;
  try {
    res = await image(target);
  } catch {
    res = null;
  }
  res ||= miss(404);
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

async function image(target) {
  const page = await fetch(target, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,image/*;q=0.8" }, redirect: "follow" });
  if (!page.ok) return null;
  const type = (page.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (type.startsWith("image/")) return proxied(page, type);
  if (!type.includes("html")) return null;
  const base = page.url || target.href;
  const src = findImage(await head(page), base);
  if (!src) return null;
  const img = await fetch(src, { headers: { "User-Agent": UA, Referer: base, Accept: "image/*" }, redirect: "follow" });
  if (!img.ok) return null;
  return proxied(img, (img.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase());
}

// Only the start of the document: meta tags live in <head>.
async function head(res) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let s = "";
  while (s.length < 400_000) {
    const { done, value } = await reader.read();
    if (done) break;
    s += dec.decode(value, { stream: true });
    if (/<\/head>/i.test(s)) break;
  }
  reader.cancel().catch(() => {});
  return s;
}

function findImage(html, base) {
  const found = {};
  for (const tag of html.match(/<(meta|link)\b[^>]*>/gi) || []) {
    const a = attrs(tag);
    const k = (a.property || a.name || a.itemprop || (a.rel ? "rel:" + a.rel : "")).toLowerCase();
    const v = a.content || a.href;
    if (k && v && !(k in found)) found[k] = v;
  }
  const v = ["og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src", "image", "rel:image_src", "thumbnailurl"].map(k => found[k]).find(Boolean);
  if (!v) return null;
  try {
    const url = new URL(decode(v.trim()), base);
    return /^https?:$/.test(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function attrs(tag) {
  const o = {};
  for (const m of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) o[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5];
  return o;
}

const decode = s => s.replace(/&(amp|quot|#39|lt|gt|#x2F|#47);/gi, (_, e) => ({ amp: "&", quot: '"', "#39": "'", lt: "<", gt: ">", "#x2f": "/", "#47": "/" })[e.toLowerCase()]);

// SVG is refused: served from this origin it could run scripts.
async function proxied(res, type) {
  if (!IMAGE_TYPES.includes(type)) return null;
  if (Number(res.headers.get("Content-Length")) > MAX_IMAGE) return null;
  const body = await res.arrayBuffer();
  if (body.byteLength > MAX_IMAGE || !body.byteLength) return null;
  return new Response(body, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=2592000",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

const miss = status => new Response(null, { status, headers: { "Cache-Control": "public, max-age=86400" } });
