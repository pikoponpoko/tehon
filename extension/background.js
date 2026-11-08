// Service worker: Dropbox connection, the save queue (keeps running after the popup closes),
// and the image context menu. Progress is published in chrome.storage.session.job.
import * as dbx from "./dbx.js";
import { fetchInPage, recordVideo } from "./collect.js";
import { RECORD } from "./features.js";

const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/avif": "avif", "image/bmp": "bmp", "image/svg+xml": "svg", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };
const EXTS = new Set([...Object.values(TYPES), "jpeg"]);

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "save-image", title: "Tehonに保存", contexts: ["image"] });
});

// The popup asks for access to all sites right after handing over a save. On some systems the
// permission prompt closes the popup before it can say "go", so a save also starts when access is
// granted, when the popup closes, or after a while.
chrome.permissions.onAdded.addListener(() => release());
chrome.runtime.onConnect.addListener(p => p.name === "popup" && p.onDisconnect.addListener(() => release()));

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "save-image" || !info.srcUrl) return;
  const { last = { folder: "", tags: [] } } = await chrome.storage.local.get("last");
  enqueue({ tabId: tab?.id, page: info.pageUrl || tab?.url, items: [{ url: info.srcUrl }], folder: last.folder, tags: last.tags });
});

chrome.runtime.onMessage.addListener((m, _sender, reply) => {
  handle(m).then(reply, e => reply({ error: e instanceof dbx.DropboxError && e.status === 401 ? "auth" : String(e?.message || e) }));
  return true;
});

async function handle(m) {
  switch (m.type) {
    case "state": {
      const { folders = [], last = { folder: "", tags: [] }, recent = [] } = await chrome.storage.local.get(["folders", "last", "recent"]);
      return { connected: await dbx.isConnected(), folders, last, recent, redirect: dbx.redirectUri() };
    }
    case "connect":
      await dbx.connect();
      return { folders: await refreshFolders() };
    case "disconnect":
      await dbx.disconnect();
      return {};
    case "ack":
      if (job && job.done + job.failed === job.total) (job = null), await publish();
      return {};
    case "folders":
      return { folders: await refreshFolders() };
    case "save":
      await remember(m);
      enqueue(m, !!m.hold);
      return {};
    case "go":
      release();
      return {};
    case "saveUrl": {
      await remember(m);
      if (await dbx.hasUrl(m.url)) return { dup: true };
      const t = Date.now();
      const key = t.toString(36) + Math.random().toString(36).slice(2, 6);
      await dbx.updateDevice(d => {
        d.urls[key] = { name: m.title || new URL(m.url).hostname, url: m.url, folder: m.folder, tags: m.tags, favorite: false, trashed: false, addedAt: t, updatedAt: t };
      });
      return {};
    }
  }
}

// Last folder and tags, plus the folders saved to most recently (listed first in the popup).
async function remember(m) {
  const { recent = [] } = await chrome.storage.local.get("recent");
  const next = m.folder ? [m.folder, ...recent.filter(f => f !== m.folder)].slice(0, 8) : recent;
  await chrome.storage.local.set({ last: { folder: m.folder, tags: m.tags }, recent: next });
}

async function refreshFolders() {
  const folders = await dbx.folders();
  await chrome.storage.local.set({ folders });
  return folders;
}

/* ---------- save queue ---------- */
let job = null; // { total, done, failed, error? }
const queue = [];
let held = null; // timer while a popup save waits for the permission prompt

function release() {
  if (!held) return;
  clearTimeout(held);
  held = null;
  if (!running) run();
}

async function publish() {
  await chrome.storage.session.set({ job });
  const left = job ? job.total - job.done - job.failed : 0;
  await chrome.action.setBadgeBackgroundColor({ color: job?.failed ? "#C0392B" : "#3772FF" });
  await chrome.action.setBadgeText({ text: left ? String(left) : job?.failed ? "!" : "" });
}

// items: { url } for an image, { vid, url? } for a video (url when it can be downloaded as a file).
// page: the tab's address, kept as the file's source.
function enqueue({ tabId, page, items, folder, tags }, hold = false) {
  if (!job || job.done + job.failed === job.total) job = { total: 0, done: 0, failed: 0 };
  job.total += items.length;
  if (!/^https?:/.test(page || "")) page = null;
  for (const it of items) queue.push({ tabId, page, ...it, folder, tags });
  publish();
  if (hold) {
    clearTimeout(held);
    held = setTimeout(release, 20e3);
  } else if (!held && !running) run();
}

let running = false;
async function run() {
  running = true;
  // Extension API calls keep the service worker alive between uploads.
  const alive = setInterval(() => chrome.runtime.getPlatformInfo(), 20e3);
  const saved = [];
  // Files already in the library (same content) are not saved again, nor twice in one batch.
  const knownP = dbx.libraryHashes().catch(() => new Set());
  // Recordings play in real time, one at a time; images download four at a time beside them.
  const take = video => {
    const i = queue.findIndex(t => !!t.vid === video);
    return i < 0 ? null : queue.splice(i, 1)[0];
  };
  const worker = async video => {
    for (let t; (t = take(video)); ) {
      try {
        if (t.vid) (job.recording = true), await publish();
        const { blob, name } = t.vid ? await getVideo(t) : await fetchImage(t.url, t.tabId).then(b => ({ blob: b, name: fileName(t.url, b.type) }));
        const [hash, known] = await Promise.all([dbx.contentHash(blob), knownP]);
        if (known.has(hash)) {
          job.dup = (job.dup || 0) + 1;
          job.done++;
        } else {
          known.add(hash);
          const meta = await dbx.upload(t.folder, name, blob);
          saved.push({ id: meta.id, tags: t.tags, page: t.page });
          job.done++;
        }
      } catch (e) {
        job.failed++;
        if (e instanceof dbx.DropboxError) job.error = e.status === 401 ? "auth" : e.status === 507 || /insufficient_space/.test(e.body) ? "space" : "dropbox";
      }
      if (t.vid) job.recording = false;
      await publish();
    }
  };
  try {
    await Promise.all([worker(false), worker(false), worker(false), worker(false), worker(true)]);
    const tagged = saved.filter(s => s.tags.length);
    const sourced = saved.filter(s => s.page);
    if (tagged.length || sourced.length) {
      const now = Date.now();
      await dbx.updateDevice(d => {
        for (const s of tagged) d.items[s.id] = { tags: s.tags, favorite: false, trashed: false, updatedAt: now };
        d.sources ||= {};
        for (const s of sourced) d.sources[s.id] = { url: s.page, updatedAt: now };
      });
    }
  } catch {
  } finally {
    clearInterval(alive);
    running = false;
    if (queue.length) return void run();
    if (saved.length) chime();
    setTimeout(() => job && job.done + job.failed === job.total && !job.failed && ((job = null), publish()), 4000);
  }
}

async function fetchImage(url, tabId) {
  if (!url.startsWith("blob:")) {
    // Without access to the site, only CORS-open images can be fetched here, and those
    // ("Access-Control-Allow-Origin: *", e.g. Google image results) refuse requests with cookies.
    const granted = await chrome.permissions.contains({ origins: [new URL(url).origin + "/*"] }).catch(() => false);
    for (const credentials of granted ? ["include", "omit"] : ["omit", "include"]) {
      try {
        const r = await fetch(url, { credentials });
        if (r.ok) {
          const b = await r.blob();
          if (isImage(b, url)) return b;
        }
      } catch {}
    }
  }
  if (tabId == null) throw new Error("fetch");
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: fetchInPage, args: [url] });
  if (!res?.result) throw new Error("fetch");
  const b = await (await fetch(res.result)).blob();
  if (!isImage(b, url)) throw new Error("type");
  return b;
}

async function getVideo(t) {
  if (t.url) {
    try {
      const r = await fetch(t.url, { credentials: "include" });
      const b = r.ok && (await r.blob());
      if (b && b.type.startsWith("video/")) return { blob: b, name: fileName(t.url, b.type) };
    } catch {}
  }
  if (!RECORD) throw new Error("record");
  const [res] = await chrome.scripting.executeScript({ target: { tabId: t.tabId }, func: recordVideo, args: [t.vid] });
  if (!res?.result?.data) throw new Error(res?.result?.error || "record");
  const blob = await (await fetch(res.result.data)).blob();
  const tab = await chrome.tabs.get(t.tabId).catch(() => null);
  return { blob, name: recordingName(tab?.url, blob.type) };
}

// e.g. instagram.com_20261031-124500.mp4
function recordingName(url, type) {
  let host = "video";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {}
  const d = new Date(), p = n => String(n).padStart(2, "0");
  return `${host}_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${TYPES[type] || "webm"}`;
}

const extOf = s => (s.match(/\.([a-z0-9]{2,5})$/i)?.[1] || "").toLowerCase();
const isImage = (b, url) => b.type.startsWith("image/") || (b.type === "application/octet-stream" && EXTS.has(extOf(new URL(url).pathname)));

function fileName(url, type) {
  let base = "image";
  try {
    const u = new URL(url);
    if (/^https?:$/.test(u.protocol)) base = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || u.hostname);
  } catch {}
  base = base.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^\.+/, "").slice(0, 120) || "image";
  const want = TYPES[type];
  const has = extOf(base);
  if (want && !(has === want || (want === "jpg" && has === "jpeg"))) base = (EXTS.has(has) ? base.slice(0, -has.length - 1) : base) + "." + want;
  return base;
}

/* ---------- sound when a save finishes ---------- */
async function chime() {
  try {
    if (!(await chrome.offscreen.hasDocument())) await chrome.offscreen.createDocument({ url: "sound.html", reasons: ["AUDIO_PLAYBACK"], justification: "保存完了の通知音" });
    await chrome.runtime.sendMessage({ type: "chime" });
  } catch {}
}
