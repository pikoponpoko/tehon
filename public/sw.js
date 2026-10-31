// Keeps the app itself (index.html and the hashed /assets/ files) on the device so it opens without waiting on the network.
// index.html is served from the cache and refreshed in the background: a new version shows from the next launch.
const CACHE = "tehon-app-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e =>
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())),
);

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.mode === "navigate") return e.respondWith(page(e));
  if (url.pathname.startsWith("/assets/")) return e.respondWith(asset(req));
});

async function page(e) {
  const cache = await caches.open(CACHE);
  const fresh = fetch("/", { cache: "no-cache" }).then(async r => {
    if (r.ok) {
      await cache.put("/", r.clone());
      prune(cache, await r.clone().text());
    }
    return r;
  });
  const hit = await cache.match("/");
  if (hit) {
    e.waitUntil(fresh.catch(() => {}));
    return hit;
  }
  return fresh;
}

// Hashed file names never change content, so a cached copy is always right.
async function asset(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok) cache.put(req, r.clone());
  return r;
}

// Drops assets the current index.html no longer uses.
async function prune(cache, html) {
  const used = new Set(html.match(/\/assets\/[^"'\s)]+/g) || []);
  for (const req of await cache.keys()) {
    const p = new URL(req.url).pathname;
    if (p.startsWith("/assets/") && !used.has(p)) cache.delete(req);
  }
}
