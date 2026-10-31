// Runs inside the page (chrome.scripting.executeScript), so it must stay self-contained.
// Returns every image the page shows or links to (largest known version per URL), and its videos.
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
  // Videos are tagged so the recorder can find the same element later.
  const videos = [];
  for (const v of document.querySelectorAll("video")) {
    if (!v.currentSrc && !v.src) continue;
    v.dataset.tehonVid ||= Math.random().toString(36).slice(2, 10);
    let thumb = v.poster ? abs(v.poster) : "";
    if (v.readyState >= 2 && v.videoWidth) {
      try {
        const c = document.createElement("canvas");
        const k = Math.min(1, 320 / v.videoWidth);
        c.width = Math.round(v.videoWidth * k);
        c.height = Math.round(v.videoHeight * k);
        c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
        thumb = c.toDataURL("image/jpeg", 0.7);
      } catch {} // cross-origin video: keep the poster
    }
    const src = v.currentSrc || v.src;
    videos.push({ vid: v.dataset.tehonVid, src: /^https?:/.test(src) ? src : "", thumb, w: v.videoWidth, h: v.videoHeight, duration: isFinite(v.duration) ? v.duration : 0 });
  }
  return { title: document.title, url: location.href, images: [...found.values()], videos };
}

// Plays a video from the start once and records it (video.captureStream + MediaRecorder).
// For streamed videos (blob: sources, e.g. Instagram) that can't be downloaded as a file.
export async function recordVideo(vid) {
  const v = document.querySelector(`video[data-tehon-vid="${vid}"]`);
  if (!v) return { error: "gone" };
  const type = ["video/mp4;codecs=avc1.640028,mp4a.40.2", "video/webm;codecs=vp9,opus", "video/webm"].find(t => MediaRecorder.isTypeSupported(t));
  const loop = v.loop, muted = v.muted;
  v.loop = false;
  v.playbackRate = 1;
  v.currentTime = 0;
  try {
    await v.play();
  } catch {
    // Autoplay with sound is blocked without a click on the page: record muted instead.
    v.muted = true;
    try {
      await v.play();
    } catch {
      v.loop = loop;
      return { error: "play" };
    }
  }
  let stream;
  try {
    stream = v.captureStream();
  } catch {
    v.loop = loop;
    return { error: "capture" };
  }
  for (let i = 0; i < 40 && !stream.getVideoTracks().length; i++) await new Promise(r => setTimeout(r, 50));
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8e6 });
  const chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const stopped = new Promise(r => (rec.onstop = r));
  rec.start(1000);
  await new Promise(done => {
    let last = 0;
    const end = () => {
      clearInterval(tick);
      clearTimeout(cap);
      v.removeEventListener("ended", end);
      done();
    };
    // The page's own player may restart (loop) or pause the video: stop on a jump back, resume on a pause.
    const tick = setInterval(() => {
      if (v.currentTime + 0.3 < last) return end();
      last = v.currentTime;
      if (v.paused && !v.ended) v.play().catch(() => {});
    }, 200);
    const cap = setTimeout(end, ((isFinite(v.duration) && v.duration) || 600) * 1000 + 5000);
    v.addEventListener("ended", end);
  });
  rec.stop();
  await stopped;
  v.loop = loop;
  v.muted = muted;
  const blob = new Blob(chunks, { type: type.split(";")[0] });
  if (!blob.size) return { error: "empty" };
  if (blob.size > 60e6) return { error: "size" };
  const data = await new Promise(res => {
    const f = new FileReader();
    f.onload = () => res(f.result);
    f.onerror = () => res(null);
    f.readAsDataURL(blob);
  });
  return data ? { data } : { error: "read" };
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
