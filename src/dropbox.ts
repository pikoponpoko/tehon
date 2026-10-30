// Dropbox client for the browser: OAuth 2 PKCE (App key only), encrypted refresh token in IndexedDB,
// and the handful of API calls Tehon needs. Originals are only read; Tehon's own data lives in /.tehon/.
import { DROPBOX_APP_KEY, DROPBOX_SCOPES, redirectUri } from "./config";

const AUTH_URL = "https://www.dropbox.com/oauth2/authorize";
const TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";
const RPC = "https://api.dropboxapi.com/2/";
const CONTENT = "https://content.dropboxapi.com/2/";
export const META_DIR = "/.tehon";

/* ---------- IndexedDB key/value ---------- */
const DB = "tehon";
const STORE = "auth";
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function kv<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await idb();
  return new Promise((res, rej) => {
    const r = fn(db.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => res(r.result as T);
    r.onerror = () => rej(r.error);
  });
}
const kvGet = <T>(k: string) => kv<T | undefined>("readonly", s => s.get(k));
const kvSet = (k: string, v: unknown) => kv("readwrite", s => s.put(v, k));
const kvDel = (k: string) => kv("readwrite", s => s.delete(k));

/* ---------- refresh token, encrypted with a non-extractable key ---------- */
async function cryptoKey(): Promise<CryptoKey> {
  let k = await kvGet<CryptoKey>("key");
  if (!k) {
    k = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await kvSet("key", k);
  }
  return k;
}
async function saveRefresh(token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cryptoKey(), new TextEncoder().encode(token));
  await kvSet("refresh", { iv, data });
}
async function loadRefresh(): Promise<string | null> {
  const v = await kvGet<{ iv: Uint8Array; data: ArrayBuffer }>("refresh");
  if (!v) return null;
  try {
    const buf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: v.iv }, await cryptoKey(), v.data);
    return new TextDecoder().decode(buf);
  } catch {
    return null;
  }
}

/* ---------- PKCE ---------- */
const b64url = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export const isConfigured = () => DROPBOX_APP_KEY !== "";

export async function startAuth() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  sessionStorage.setItem("tehon-pkce", JSON.stringify({ verifier, state }));
  const q = new URLSearchParams({
    client_id: DROPBOX_APP_KEY,
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    redirect_uri: redirectUri(),
    token_access_type: "offline",
    scope: DROPBOX_SCOPES.join(" "),
    state,
  });
  location.assign(`${AUTH_URL}?${q}`);
}

let access: { token: string; exp: number } | null = null;

async function tokenRequest(body: Record<string, string>) {
  const r = await fetch(TOKEN_URL, { method: "POST", body: new URLSearchParams({ client_id: DROPBOX_APP_KEY, ...body }) });
  if (!r.ok) throw new DropboxError(r.status, await r.text());
  const j = await r.json();
  access = { token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
  if (j.refresh_token) await saveRefresh(j.refresh_token);
}

/** Completes the redirect back from Dropbox. Returns an error message, or null when nothing failed. */
export async function handleRedirect(): Promise<string | null> {
  const u = new URL(location.href);
  const code = u.searchParams.get("code");
  const err = u.searchParams.get("error");
  if (!code && !err) return null;
  history.replaceState(null, "", u.pathname);
  const saved = JSON.parse(sessionStorage.getItem("tehon-pkce") || "null");
  sessionStorage.removeItem("tehon-pkce");
  if (err) return err === "access_denied" ? null : "Dropboxに接続できませんでした";
  if (!saved || saved.state !== u.searchParams.get("state")) return "Dropboxに接続できませんでした";
  try {
    await tokenRequest({ code: code!, grant_type: "authorization_code", code_verifier: saved.verifier, redirect_uri: redirectUri() });
    return null;
  } catch {
    return "Dropboxに接続できませんでした";
  }
}

export async function isConnected() {
  return isConfigured() && (access !== null || (await loadRefresh()) !== null);
}

let refreshing: Promise<string> | null = null;
async function token(): Promise<string> {
  if (access && Date.now() < access.exp) return access.token;
  return (refreshing ??= refresh().finally(() => (refreshing = null)));
}
async function refresh(): Promise<string> {
  const rt = await loadRefresh();
  if (!rt) throw new DropboxError(401, "not connected");
  try {
    await tokenRequest({ grant_type: "refresh_token", refresh_token: rt });
  } catch (e) {
    // Revoked or expired refresh token: forget it so the user can connect again.
    if (e instanceof DropboxError && e.status === 400) {
      await kvDel("refresh");
      throw new DropboxError(401, e.body);
    }
    throw e;
  }
  return access!.token;
}

export async function disconnect() {
  try {
    await rpc("auth/token/revoke", null);
  } catch {}
  access = null;
  await kvDel("refresh");
}

/* ---------- API ---------- */
export class DropboxError extends Error {
  constructor(public status: number, public body: string) {
    super(`Dropbox ${status}: ${body.slice(0, 200)}`);
  }
  get summary(): string {
    try {
      return JSON.parse(this.body).error_summary || "";
    } catch {
      return "";
    }
  }
}

// Dropbox-API-Arg must be ASCII: escape everything outside it (Japanese file names).
const argHeader = (o: unknown) => JSON.stringify(o).replace(/[\u007f-￿]/g, c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function call(url: string, init: RequestInit, tries = 0): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", "Bearer " + (await token()));
  const r = await fetch(url, { ...init, headers });
  if (r.status === 401 && tries === 0) {
    access = null;
    return call(url, init, 1);
  }
  if ((r.status === 429 || r.status >= 500) && tries < 4) {
    const wait = Number(r.headers.get("Retry-After")) * 1000 || 500 * 2 ** tries;
    await sleep(wait);
    return call(url, init, tries + 1);
  }
  if (!r.ok) throw new DropboxError(r.status, await r.text());
  return r;
}

async function rpc<T = any>(path: string, arg: unknown): Promise<T> {
  const init: RequestInit = arg === null ? { method: "POST" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(arg) };
  const r = await call(RPC + path, init);
  const t = await r.text();
  return t ? JSON.parse(t) : (null as T);
}

async function download(path: string): Promise<{ blob: Blob; meta: FileMeta }> {
  const r = await call(CONTENT + "files/download", { method: "POST", headers: { "Dropbox-API-Arg": argHeader({ path }) } });
  return { blob: await r.blob(), meta: JSON.parse(r.headers.get("Dropbox-API-Result") || "{}") };
}

export interface FileMeta {
  ".tag": "file" | "folder" | "deleted";
  id: string;
  name: string;
  path_lower: string;
  path_display: string;
  rev?: string;
  size?: number;
  client_modified?: string;
  server_modified?: string;
  content_hash?: string;
  media_info?: { metadata?: { dimensions?: { width: number; height: number } } };
}

/** Every file and folder under the app folder, paginated. Tehon's own /.tehon is left out. */
export async function listAll(onPage?: (n: number) => void): Promise<FileMeta[]> {
  const out: FileMeta[] = [];
  let r = await rpc("files/list_folder", { path: "", recursive: true, include_media_info: true, limit: 2000 });
  for (;;) {
    out.push(...r.entries);
    onPage?.(out.length);
    if (!r.has_more) break;
    r = await rpc("files/list_folder/continue", { cursor: r.cursor });
  }
  return out.filter(e => e.path_lower !== META_DIR && !e.path_lower.startsWith(META_DIR + "/"));
}

export const THUMB_EXT = ["jpg", "jpeg", "png", "tiff", "tif", "gif", "webp", "ppm", "bmp"];

/** Up to 25 per request. Returns id → data URL; ids Dropbox can't thumbnail are absent. */
export async function thumbnails(ids: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 25) {
    const part = ids.slice(i, i + 25);
    const r = await call(CONTENT + "files/get_thumbnail_batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: part.map(path => ({ path, format: "jpeg", size: "w480h320", mode: "fitone_bestfit" })) }),
    });
    const j = await r.json();
    j.entries.forEach((e: any, k: number) => {
      if (e[".tag"] === "success") m.set(part[k], "data:image/jpeg;base64," + e.thumbnail);
    });
  }
  return m;
}

export async function tempLink(id: string): Promise<string> {
  return (await rpc("files/get_temporary_link", { path: id })).link;
}

export async function readText(id: string, max = 2e6): Promise<{ text: string; enc: string; truncated: boolean; rev?: string }> {
  const { blob, meta } = await download(id);
  const truncated = blob.size > max;
  const buf = await blob.slice(0, max).arrayBuffer();
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(buf), enc: "UTF-8", truncated, rev: meta.rev };
  } catch {
    return { text: new TextDecoder("shift_jis").decode(buf), enc: "Shift_JIS", truncated, rev: meta.rev };
  }
}

export class ConflictError extends Error {}

/** Overwrites a UTF-8 text file only if it is still at `rev`; otherwise throws ConflictError and leaves Dropbox untouched. */
export async function writeText(path: string, text: string, rev: string): Promise<FileMeta> {
  try {
    const r = await call(CONTENT + "files/upload", {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", "Dropbox-API-Arg": argHeader({ path, mode: { ".tag": "update", update: rev }, autorename: false, mute: true }) },
      body: new TextEncoder().encode(text),
    });
    return r.json();
  } catch (e) {
    if (e instanceof DropboxError && e.status === 409 && e.summary.startsWith("path/conflict")) throw new ConflictError();
    throw e;
  }
}

/** Adds a new file; never overwrites (autorename on name clash). Files over 150MB need upload sessions (not yet). */
export async function upload(folder: string, file: File): Promise<FileMeta> {
  const path = (folder ? "/" + folder : "") + "/" + file.name;
  const r = await call(CONTENT + "files/upload", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream", "Dropbox-API-Arg": argHeader({ path, mode: "add", autorename: true, mute: true }) },
    body: file,
  });
  return r.json();
}

/* ---------- Tehon data in /.tehon/devices/<device>.json ----------
   Each device writes only its own file, so two devices never conflict.
   Readers merge all device files, newest updatedAt per entry wins. */
export interface ItemMeta { tags: string[]; favorite: boolean; trashed: boolean; updatedAt: number }
export interface UrlMeta { name: string; url: string; folder: string; tags: string[]; favorite: boolean; trashed: boolean; deleted?: boolean; addedAt: number; updatedAt: number }
export interface DeviceFile { version: 1; device: string; items: Record<string, ItemMeta>; urls: Record<string, UrlMeta> }

export function deviceId(): string {
  let d = localStorage.getItem("tehon-device");
  if (!d) {
    d = b64url(crypto.getRandomValues(new Uint8Array(9)));
    localStorage.setItem("tehon-device", d);
  }
  return d;
}

export async function loadMeta(): Promise<{ items: Record<string, ItemMeta>; urls: Record<string, UrlMeta>; own: DeviceFile }> {
  const me = deviceId();
  const own: DeviceFile = { version: 1, device: me, items: {}, urls: {} };
  const items: Record<string, ItemMeta> = {};
  const urls: Record<string, UrlMeta> = {};
  let files: FileMeta[] = [];
  try {
    files = (await rpc("files/list_folder", { path: META_DIR + "/devices" })).entries;
  } catch (e) {
    if (!(e instanceof DropboxError && e.summary.startsWith("path/not_found"))) throw e;
  }
  for (const f of files.filter(f => f[".tag"] === "file" && f.name.endsWith(".json"))) {
    let d: DeviceFile;
    try {
      d = JSON.parse(await (await download(f.id)).blob.text());
    } catch {
      continue;
    }
    if (d.device === me) Object.assign(own, d);
    for (const [k, v] of Object.entries(d.items || {})) if (!items[k] || items[k].updatedAt < v.updatedAt) items[k] = v;
    for (const [k, v] of Object.entries(d.urls || {})) if (!urls[k] || urls[k].updatedAt < v.updatedAt) urls[k] = v;
  }
  return { items, urls, own };
}

export async function saveDevice(d: DeviceFile) {
  await call(CONTENT + "files/upload", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream", "Dropbox-API-Arg": argHeader({ path: `${META_DIR}/devices/${d.device}.json`, mode: "overwrite", mute: true }) },
    body: JSON.stringify(d),
  });
}

/* ---------- used by the Eagle importer ---------- */
/** Every entry under `path` (recursive), including Tehon's own folders. */
export async function listTree(path: string): Promise<FileMeta[]> {
  const out: FileMeta[] = [];
  let r = await rpc("files/list_folder", { path, recursive: true, limit: 2000 });
  for (;;) {
    out.push(...r.entries);
    if (!r.has_more) return out;
    r = await rpc("files/list_folder/continue", { cursor: r.cursor });
  }
}

export async function readJson<T = any>(path: string): Promise<T> {
  return JSON.parse(await (await download(path)).blob.text());
}

// Batch calls may answer with a job id; poll `check` until the job finishes.
async function batch(path: string, check: string, arg: unknown): Promise<any> {
  let r = await rpc(path, arg);
  const job = r.async_job_id;
  while (r[".tag"] === "async_job_id" || r[".tag"] === "in_progress") {
    await sleep(1500);
    r = await rpc(check, { async_job_id: job });
  }
  if (r[".tag"] !== "complete") throw new DropboxError(409, JSON.stringify(r));
  return r;
}

/** Moves (autorename on clash). Returns one result per entry, in order: the moved file, or null on failure. */
export async function moveBatch(entries: { from_path: string; to_path: string }[]): Promise<(FileMeta | null)[]> {
  const out: (FileMeta | null)[] = [];
  for (let i = 0; i < entries.length; i += 1000) {
    const r = await batch("files/move_batch_v2", "files/move_batch/check_v2", { entries: entries.slice(i, i + 1000), autorename: true });
    out.push(...r.entries.map((e: any) => (e[".tag"] === "success" ? e.success : null)));
  }
  return out;
}

/** Creates folders; ones that already exist are left as they are. */
export async function createFolders(paths: string[]) {
  for (let i = 0; i < paths.length; i += 1000)
    await batch("files/create_folder_batch", "files/create_folder_batch/check", { paths: paths.slice(i, i + 1000), autorename: false, force_async: false });
}

/** Moves a path to Dropbox's deleted files (restorable there). */
export async function remove(path: string) {
  await rpc("files/delete_v2", { path });
}

/** Tags etc. carried over from Eagle, keyed by file path (/.tehon/eagle-manifest.json). Device data overrides it. */
export interface EagleManifest { files: Record<string, { tags: string[]; favorite: boolean; trashed: boolean; addedAt?: number }>; urls: Omit<UrlMeta, "updatedAt">[] }
export async function loadEagleManifest(): Promise<EagleManifest | null> {
  try {
    return await readJson(META_DIR + "/eagle-manifest.json");
  } catch {
    return null;
  }
}
