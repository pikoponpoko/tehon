// Service worker: Dropbox connection, the save queue (keeps running after the popup closes),
// and the image context menu. Progress is published in chrome.storage.session.job.
import * as dbx from "./dbx.js";
import { fetchInPage, recordVideo } from "./collect.js";

const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/avif": "avif", "image/bmp": "bmp", "image/svg+xml": "svg", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };
const EXTS = new Set([...Object.values(TYPES), "jpeg"]);

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "save-image", title: "Tehonに保存", contexts: ["image"] });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "save-image" || !info.srcUrl) return;
  const { last = { folder: "", tags: [] } } = await chrome.storage.local.get("last");
  enqueue({ tabId: tab?.id, items: [{ url: info.srcUrl }], folder: last.folder, tags: last.tags });
});

chrome.runtime.onMessage.addListener((m, _sender, reply) => {
  handle(m).then(reply, e => reply({ error: e instanceof dbx.DropboxError && e.status === 401 ? "auth" : String(e?.message || e) }));
  return true;
});

async function handle(m) {
  switch (m.type) {
    case "state": {
      const { folders = [], last = { folder: "", tags: [] } } = await chrome.storage.local.get(["folders", "last"]);
      return { connected: await dbx.isConnected(), folders, last, redirect: dbx.redirectUri() };
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
      await chrome.storage.local.set({ last: { folder: m.folder, tags: m.tags } });
      enqueue(m);
      return {};
    case "saveUrl": {
      await chrome.storage.local.set({ last: { folder: m.folder, tags: m.tags } });
      const t = Date.now();
      const key = t.toString(36) + Math.random().toString(36).slice(2, 6);
      await dbx.updateDevice(d => {
        d.urls[key] = { name: m.title || new URL(m.url).hostname, url: m.url, folder: m.folder, tags: m.tags, favorite: false, trashed: false, addedAt: t, updatedAt: t };
      });
      return {};
    }
  }
}

async function refreshFolders() {
  const folders = await dbx.folders();
  await chrome.storage.local.set({ folders });
  return folders;
}

/* ---------- save queue ---------- */
let job = null; // { total, done, failed }
const queue = [];

async function publish() {
  await chrome.storage.session.set({ job });
  const left = job ? job.total - job.done - job.failed : 0;
  await chrome.action.setBadgeBackgroundColor({ color: job?.failed ? "#C0392B" : "#3772FF" });
  await chrome.action.setBadgeText({ text: left ? String(left) : job?.failed ? "!" : "" });
}

// items: { url } for an image, { vid, url? } for a video (url when it can be downloaded as a file).
function enqueue({ tabId, items, folder, tags }) {
  if (!job || job.done + job.failed === job.total) job = { total: 0, done: 0, failed: 0 };
  job.total += items.length;
  for (const it of items) queue.push({ tabId, ...it, folder, tags });
  publish();
  if (!running) run();
}

let running = false;
async function run() {
  running = true;
  // Extension API calls keep the service worker alive between uploads.
  const alive = setInterval(() => chrome.runtime.getPlatformInfo(), 20e3);
  const saved = [];
  // Recordings play in real time, one at a time; images download three at a time beside them.
  const take = video => {
    const i = queue.findIndex(t => !!t.vid === video);
    return i < 0 ? null : queue.splice(i, 1)[0];
  };
  const worker = async video => {
    for (let t; (t = take(video)); ) {
      try {
        if (t.vid) (job.recording = true), await publish();
        const { blob, name } = t.vid ? await getVideo(t) : await fetchImage(t.url, t.tabId).then(b => ({ blob: b, name: fileName(t.url, b.type) }));
        const meta = await dbx.upload(t.folder, name, blob);
        saved.push({ id: meta.id, tags: t.tags });
        job.done++;
      } catch {
        job.failed++;
      }
      if (t.vid) job.recording = false;
      await publish();
    }
  };
  try {
    await Promise.all([worker(false), worker(false), worker(false), worker(true)]);
    const tagged = saved.filter(s => s.tags.length);
    if (tagged.length) {
      const now = Date.now();
      await dbx.updateDevice(d => {
        for (const s of tagged) d.items[s.id] = { tags: s.tags, favorite: false, trashed: false, updatedAt: now };
      });
    }
  } catch {
  } finally {
    clearInterval(alive);
    running = false;
    if (queue.length) run();
    else setTimeout(() => job && job.done + job.failed === job.total && !job.failed && ((job = null), publish()), 4000);
  }
}

async function fetchImage(url, tabId) {
  if (!url.startsWith("blob:")) {
    try {
      const r = await fetch(url, { credentials: "include" });
      if (r.ok) {
        const b = await r.blob();
        if (isImage(b, url)) return b;
      }
    } catch {}
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
