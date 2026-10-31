// Runs inside the page (chrome.scripting.executeScript), so it must stay self-contained.
// Returns every image the page shows or links to, largest known version first per URL.
export function collectImages() {
  const IMG_EXT = /\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?|#|$)/i;
  const found = new Map();
  const abs = u => {
    try {
      return new URL(u, location.href).href;
    } catch {
      return null;
    }
  };
  // Ask image hosts for the original instead of the resized copy shown on the page.
  const upgrade = u => {
    try {
      const x = new URL(u);
      if (x.hostname.endsWith("pinimg.com")) x.pathname = x.pathname.replace(/^\/\d+x(\d+)?\//, "/originals/");
      if (x.hostname === "pbs.twimg.com" && x.pathname.startsWith("/media/") && x.searchParams.has("name")) x.searchParams.set("name", "orig");
      return x.href;
    } catch {
      return u;
    }
  };
  const add = (u, w = 0, h = 0, alt = "") => {
    u = u && abs(u);
    if (!u || !/^(https?|data|blob):/.test(u)) return;
    if (u.startsWith("data:") && u.length < 200) return; // spacer pixels
    u = upgrade(u);
    const o = found.get(u);
    if (!o) found.set(u, { url: u, w, h, alt });
    else if (w * h > o.w * o.h) Object.assign(o, { w, h });
  };
  // The largest candidate of a srcset, by width or density descriptor.
  const largest = set => {
    let best = null, bestN = -1;
    for (const part of set.split(/,\s+/)) {
      const [u, d = "1x"] = part.trim().split(/\s+/);
      const n = parseFloat(d) * (d.endsWith("w") ? 1 : 10000);
      if (u && n > bestN) (best = u), (bestN = n);
    }
    return best;
  };

  for (const img of document.images) {
    const big = img.srcset && largest(img.srcset);
    // With srcset the natural size is scaled by the descriptor, so the popup measures it instead.
    if (img.srcset) add(big || img.currentSrc, 0, 0, img.alt);
    else add(img.currentSrc || img.src, img.naturalWidth, img.naturalHeight, img.alt);
  }
  for (const s of document.querySelectorAll("picture source[srcset]")) add(largest(s.srcset));
  for (const v of document.querySelectorAll("video[poster]")) add(v.poster);
  for (const a of document.querySelectorAll("a[href]")) if (IMG_EXT.test(a.href)) add(a.href);
  let n = 0;
  for (const el of document.querySelectorAll("body *")) {
    if (++n > 6000) break;
    const bg = getComputedStyle(el).backgroundImage;
    if (bg && bg !== "none") for (const m of bg.matchAll(/url\(["']?(.*?)["']?\)/g)) add(m[1], 0, 0);
  }
  return { title: document.title, url: location.href, images: [...found.values()] };
}

// Fallback fetch from inside the page, for blob: URLs and images that need the page's cookies.
export async function fetchInPage(url) {
  try {
    const r = await fetch(url, { credentials: "include" });
    if (!r.ok) return null;
    const b = await r.blob();
    return await new Promise(res => {
      const f = new FileReader();
      f.onload = () => res(f.result);
      f.onerror = () => res(null);
      f.readAsDataURL(b);
    });
  } catch {
    return null;
  }
}
