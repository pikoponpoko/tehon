// Dropbox client for the extension: PKCE through chrome.identity, refresh token in chrome.storage.local,
// and the few calls the extension needs. Same App folder and /.tehon/devices format as the web app.
const APP_KEY = "x7ap0g0pau1irkc";
const SCOPES = "files.metadata.read files.content.read files.content.write";
const RPC = "https://api.dropboxapi.com/2/";
const CONTENT = "https://content.dropboxapi.com/2/";
const META_DIR = "/.tehon";

export class DropboxError extends Error {
  constructor(status, body) {
    super(`Dropbox ${status}: ${String(body).slice(0, 200)}`);
    this.status = status;
    this.body = body;
  }
  get summary() {
    try {
      return JSON.parse(this.body).error_summary || "";
    } catch {
      return "";
    }
  }
}

const b64url = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Dropbox-API-Arg must be ASCII: escape everything outside it (Japanese file names).
const argHeader = o => JSON.stringify(o).replace(/[\u007f-￿]/g, c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));

export const redirectUri = () => chrome.identity.getRedirectURL();

let access = null;

async function tokenRequest(body) {
  const r = await fetch("https://api.dropboxapi.com/oauth2/token", { method: "POST", body: new URLSearchParams({ client_id: APP_KEY, ...body }) });
  if (!r.ok) throw new DropboxError(r.status, await r.text());
  const j = await r.json();
  access = { token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
  if (j.refresh_token) await chrome.storage.local.set({ refresh: j.refresh_token });
}

export async function connect() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const q = new URLSearchParams({
    client_id: APP_KEY,
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    redirect_uri: redirectUri(),
    token_access_type: "offline",
    scope: SCOPES,
    state,
  });
  const back = new URL(await chrome.identity.launchWebAuthFlow({ url: "https://www.dropbox.com/oauth2/authorize?" + q, interactive: true }));
  const code = back.searchParams.get("code");
  if (!code || back.searchParams.get("state") !== state) throw new Error("auth");
  await tokenRequest({ code, grant_type: "authorization_code", code_verifier: verifier, redirect_uri: redirectUri() });
}

export async function isConnected() {
  return !!(await chrome.storage.local.get("refresh")).refresh;
}

let refreshing = null;
async function token() {
  if (access && Date.now() < access.exp) return access.token;
  return (refreshing ??= refresh().finally(() => (refreshing = null)));
}
async function refresh() {
  const { refresh: rt } = await chrome.storage.local.get("refresh");
  if (!rt) throw new DropboxError(401, "not connected");
  try {
    await tokenRequest({ grant_type: "refresh_token", refresh_token: rt });
  } catch (e) {
    // Revoked or expired refresh token: forget it so the user can connect again.
    if (e instanceof DropboxError && e.status === 400) {
      await chrome.storage.local.remove("refresh");
      throw new DropboxError(401, e.body);
    }
    throw e;
  }
  return access.token;
}

export async function disconnect() {
  try {
    await rpc("auth/token/revoke", null);
  } catch {}
  access = null;
  await chrome.storage.local.remove(["refresh", "folders"]);
}

async function call(url, init, tries = 0) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", "Bearer " + (await token()));
  const r = await fetch(url, { ...init, headers });
  if (r.status === 401 && tries === 0) {
    access = null;
    return call(url, init, 1);
  }
  if ((r.status === 429 || r.status >= 500) && tries < 4) {
    await sleep(Number(r.headers.get("Retry-After")) * 1000 || 500 * 2 ** tries);
    return call(url, init, tries + 1);
  }
  if (!r.ok) throw new DropboxError(r.status, await r.text());
  return r;
}

async function rpc(path, arg) {
  const init = arg === null ? { method: "POST" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(arg) };
  const t = await (await call(RPC + path, init)).text();
  return t ? JSON.parse(t) : null;
}

/** Folder paths in the app folder (without the leading slash), Tehon's own /.tehon left out. */
export async function folders() {
  const out = [];
  let r = await rpc("files/list_folder", { path: "", recursive: true, limit: 2000 });
  for (;;) {
    for (const e of r.entries) if (e[".tag"] === "folder" && e.path_lower !== META_DIR && !e.path_lower.startsWith(META_DIR + "/")) out.push(e.path_display.slice(1));
    if (!r.has_more) break;
    r = await rpc("files/list_folder/continue", { cursor: r.cursor });
  }
  return out.sort((a, b) => a.localeCompare(b, "ja"));
}

/** Adds a new file; never overwrites (autorename on name clash). */
export async function upload(folder, name, blob) {
  const path = (folder ? "/" + folder : "") + "/" + name;
  const r = await call(CONTENT + "files/upload", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream", "Dropbox-API-Arg": argHeader({ path, mode: "add", autorename: true, mute: true }) },
    body: blob,
  });
  return r.json();
}

/* ---------- the extension's own /.tehon/devices/<device>.json ---------- */
export async function deviceId() {
  let { device } = await chrome.storage.local.get("device");
  if (!device) {
    device = "ext-" + b64url(crypto.getRandomValues(new Uint8Array(9)));
    await chrome.storage.local.set({ device });
  }
  return device;
}

const devicePath = d => `${META_DIR}/devices/${d}.json`;

// Only this extension writes its device file, so read-modify-write is safe once writes are serialized.
let chain = Promise.resolve();
/** Applies `fn` to the device file and writes it back. */
export function updateDevice(fn) {
  const run = chain.then(async () => {
    const device = await deviceId();
    let d = { version: 1, device, items: {}, urls: {} };
    try {
      const r = await call(CONTENT + "files/download", { method: "POST", headers: { "Dropbox-API-Arg": argHeader({ path: devicePath(device) }) } });
      d = { ...d, ...JSON.parse(await r.text()) };
    } catch (e) {
      if (!(e instanceof DropboxError && e.summary.startsWith("path/not_found"))) throw e;
    }
    fn(d);
    await call(CONTENT + "files/upload", {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", "Dropbox-API-Arg": argHeader({ path: devicePath(device), mode: "overwrite", mute: true }) },
      body: JSON.stringify(d),
    });
  });
  chain = run.catch(() => {});
  return run;
}
