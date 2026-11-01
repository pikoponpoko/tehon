// Tehon desktop: serves the browser build from http://localhost:PORT/ and shows it in a window.
// The fixed origin keeps the Dropbox Redirect URI and localStorage/IndexedDB the same across launches and updates.
const { app, BrowserWindow, Menu, shell, ipcMain, net, dialog } = require("electron");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = 47615;
const ORIGIN = `http://localhost:${PORT}`;
const WEB = path.join(__dirname, "web");
const REPO = "pikoponpoko/tehon";
const AUTH = "https://www.dropbox.com/oauth2/authorize";

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon",
  ".wasm": "application/wasm", ".woff2": "font/woff2", ".ttf": "font/ttf",
};

// The site's own headers (CSP etc.) from public/_headers, "/*" block only.
function siteHeaders() {
  const out = {};
  try {
    let on = false;
    for (const line of fs.readFileSync(path.join(WEB, "_headers"), "utf8").split(/\r?\n/)) {
      if (/^\S/.test(line)) on = line.trim() === "/*";
      else if (on && line.includes(":")) {
        const i = line.indexOf(":");
        out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
      }
    }
  } catch {}
  return out;
}
const HEADERS = siteHeaders();

let win = null;
let authPending = false;

function serve(req, res) {
  const url = new URL(req.url, ORIGIN);
  // Dropbox sign-in runs in the system browser and comes back here; the code is handed to the app window.
  if (authPending && url.pathname === "/" && (url.searchParams.has("code") || url.searchParams.has("error"))) {
    authPending = false;
    const ja = /^ja\b/i.test(req.headers["accept-language"] || "");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(`<!doctype html><meta charset="utf-8"><title>Tehon</title><p>${ja ? "Tehon に戻ってください。" : "Return to Tehon."}</p>`);
    if (win) {
      win.loadURL(ORIGIN + url.pathname + url.search);
      if (win.isMinimized()) win.restore();
      win.focus();
    }
    return;
  }
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/") rel = "/index.html";
  const file = path.normalize(path.join(WEB, rel));
  if (!file.startsWith(WEB + path.sep) || rel === "/_headers") {
    res.writeHead(404);
    return res.end();
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, {
      ...HEADERS,
      "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(data);
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    title: "Tehon",
    icon: path.join(WEB, "icons", "icon-512.png"),
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, sandbox: true },
  });
  win.once("ready-to-show", () => win.show());
  // Pages other than the app open in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (url.startsWith(ORIGIN + "/")) return;
    e.preventDefault();
    if (url.startsWith(AUTH + "?")) authPending = true;
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  });
  win.on("closed", () => (win = null));
  win.loadURL(ORIGIN + "/");
}

// Download version only: compares this version with the latest GitHub Release.
ipcMain.handle("tehon:check-update", async () => {
  const current = app.getVersion();
  const page = `https://github.com/${REPO}/releases/latest`;
  try {
    const r = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
    if (!r.ok) return { current, latest: null, url: page };
    const j = await r.json();
    return { current, latest: String(j.tag_name || "").replace(/^v/, ""), url: j.html_url || page };
  } catch {
    return { current, latest: null, url: page };
  }
});

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(() => {
    if (process.platform !== "darwin") Menu.setApplicationMenu(null);
    const server = http.createServer(serve);
    server.on("error", e => {
      dialog.showErrorBox("Tehon", `${ORIGIN}\n${e.message}`);
      app.quit();
    });
    server.listen(PORT, "127.0.0.1", createWindow);
  });
  app.on("window-all-closed", () => app.quit());
}
