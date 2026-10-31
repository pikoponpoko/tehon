import { collectImages } from "./collect.js";

const $ = id => document.getElementById(id);
const send = m => chrome.runtime.sendMessage(m);
const splitTags = s => [...new Set(s.split(/[,、\s]+/).map(t => t.trim()).filter(Boolean))];

let tab = null, page = null, images = [], sel = new Set(), lastClick = -1;

async function init() {
  const st = await send({ type: "state" });
  if (!st.connected) return showLogin();
  showApp(st);
}

function showLogin(err) {
  $("app").hidden = true;
  $("login").hidden = false;
  $("loginErr").hidden = !err;
  $("loginErr").textContent = err || "";
}

$("connect").onclick = async () => {
  $("connect").disabled = true;
  const r = await send({ type: "connect" });
  $("connect").disabled = false;
  if (r.error) return showLogin("接続できませんでした");
  init();
};

$("disconnect").onclick = async () => {
  await send({ type: "disconnect" });
  showLogin();
};

function fillFolders(list) {
  $("folders").replaceChildren(...list.map(f => Object.assign(document.createElement("option"), { value: f })));
}

async function showApp(st) {
  $("login").hidden = true;
  $("app").hidden = false;
  $("folder").value = st.last.folder || "";
  $("tags").value = (st.last.tags || []).join(" ");
  fillFolders(st.folders);
  send({ type: "folders" }).then(r => r.folders && fillFolders(r.folders));
  send({ type: "ack" });
  showJob((await chrome.storage.session.get("job")).job);

  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: collectImages });
    page = res.result;
    // Videos first: they are usually what the page is about (Instagram).
    images = [
      ...page.videos.map(v => ({ ...v, key: "v:" + v.vid, url: v.src })),
      ...page.images.map(i => ({ ...i, key: i.url })),
    ];
  } catch {
    page = { title: tab.title, url: tab.url };
    images = [];
  }
  $("saveUrl").disabled = !/^https?:/.test(page.url || "");
  render();
}

const minSize = () => Number($("min").value);
// Unknown sizes (CSS backgrounds, links) are measured once the thumbnail loads.
const visible = () => images.filter(i => (i.w === 0 && i.h === 0) || Math.max(i.w, i.h) >= minSize());

function render() {
  const list = visible();
  const shown = new Set(list.map(i => i.key));
  for (const u of sel) if (!shown.has(u)) sel.delete(u);
  $("grid").replaceChildren(
    ...list.map((im, k) => {
      const b = document.createElement("button");
      b.className = "cell" + (im.vid ? " vid" : "") + (sel.has(im.key) ? " on" : "");
      b.title = im.alt || im.url || "";
      const img = new Image();
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      if (im.vid ? im.thumb : im.url) img.src = im.vid ? im.thumb : im.url;
      img.onload = () => {
        if (im.vid) return;
        if (!im.w && !im.h) {
          im.w = img.naturalWidth;
          im.h = img.naturalHeight;
          if (Math.max(im.w, im.h) < minSize()) return later();
        }
        sz.textContent = `${im.w}×${im.h}`;
      };
      const ck = document.createElement("span");
      ck.className = "ck";
      const sz = document.createElement("span");
      sz.className = "sz";
      if (im.vid) sz.textContent = im.duration ? clock(im.duration) : "";
      else if (im.w) sz.textContent = `${im.w}×${im.h}`;
      b.append(img, ck, sz);
      b.onclick = e => toggle(list, k, e.shiftKey);
      return b;
    })
  );
  $("empty").hidden = list.length > 0;
  updateCount();
}

const clock = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

let pending = 0;
const later = () => (pending ||= requestAnimationFrame(() => ((pending = 0), render())));

function toggle(list, k, range) {
  const on = !sel.has(list[k].key);
  const [a, z] = range && lastClick >= 0 ? [Math.min(lastClick, k), Math.max(lastClick, k)] : [k, k];
  for (let i = a; i <= z; i++) on ? sel.add(list[i].key) : sel.delete(list[i].key);
  lastClick = k;
  [...$("grid").children].forEach((c, i) => c.classList.toggle("on", sel.has(list[i]?.key)));
  updateCount();
}

function updateCount() {
  const n = visible().length;
  $("count").textContent = `${sel.size} / ${n}`;
  $("all").textContent = sel.size && sel.size === n ? "選択を解除" : "すべて選択";
  $("save").textContent = sel.size ? `保存（${sel.size}）` : "保存";
  $("save").disabled = !sel.size;
}

function selectAll() {
  const list = visible();
  if (sel.size === list.length) sel.clear();
  else list.forEach(i => sel.add(i.key));
  [...$("grid").children].forEach((c, i) => c.classList.toggle("on", sel.has(list[i]?.key)));
  updateCount();
}

$("all").onclick = selectAll;
$("min").onchange = render;

const folderValue = () => $("folder").value.trim().replace(/^\/+|\/+$/g, "");

$("save").onclick = async () => {
  if (!sel.size) return;
  const items = visible()
    .filter(i => sel.has(i.key))
    .map(i => (i.vid ? { vid: i.vid, url: i.url } : { url: i.url }));
  await send({ type: "save", tabId: tab.id, items, folder: folderValue(), tags: splitTags($("tags").value) });
  sel.clear();
  [...$("grid").children].forEach(c => c.classList.remove("on"));
  updateCount();
};

$("saveUrl").onclick = async () => {
  $("saveUrl").disabled = true;
  const r = await send({ type: "saveUrl", url: page.url, title: page.title, folder: folderValue(), tags: splitTags($("tags").value) });
  $("status").textContent = r.error ? (r.error === "auth" ? "Dropboxに再接続してください" : "URLを保存できませんでした") : "URLを保存しました";
  if (r.error) $("saveUrl").disabled = false;
};

function showJob(job) {
  const running = job && job.done + job.failed < job.total;
  $("prog").hidden = !running;
  if (!job) return void ($("status").textContent = "");
  $("progBar").style.width = `${((job.done + job.failed) / job.total) * 100}%`;
  $("status").textContent = running
    ? `${job.recording ? "録画中" : "保存中"} ${job.done + job.failed} / ${job.total}`
    : job.failed
      ? `${job.failed}件保存できませんでした`
      : `${job.done}件保存しました`;
}

chrome.storage.session.onChanged.addListener(c => c.job && showJob(c.job.newValue));

document.addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT" && e.key !== "Enter") return;
  if ((e.metaKey || e.ctrlKey) && e.key === "a") {
    e.preventDefault();
    selectAll();
  } else if (e.key === "Enter" && !e.isComposing && sel.size) {
    e.preventDefault();
    $("save").click();
  }
});

init();
