import { ConflictError, decodeText, kindOf, type Item, type Library, type Media, type Source, type TextFile } from "./types";

// Public client id of the "Tehon" Dropbox app (App folder access, PKCE, no secret).
const APP_KEY = "x7ap0g0pau1irkc";
const API = "https://api.dropboxapi.com/2/";
const CONTENT = "https://content.dropboxapi.com/2/";
const TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";
const TOKEN_KEY = "tehon-dbx-token";
const PKCE_KEY = "tehon-dbx-pkce";

interface Token {
  access: string;
  refresh: string;
  exp: number;
}

const redirectUri = () => location.origin + "/";

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function loadToken(): Token | null {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY) || "null");
  } catch {
    return null;
  }
}
function saveToken(t: Token | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: session lasts until reload */
  }
}

export function hasSession() {
  return !!loadToken();
}

export async function startLogin() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state }));
  const q = new URLSearchParams({
    client_id: APP_KEY,
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    redirect_uri: redirectUri(),
    token_access_type: "offline",
    state,
  });
  location.assign("https://www.dropbox.com/oauth2/authorize?" + q);
}

/** Finishes the OAuth redirect if the URL carries one. Returns an error message, or null. */
export async function finishLogin(): Promise<string | null> {
  const p = new URLSearchParams(location.search);
  if (!p.has("code") && !p.has("error")) return null;
  history.replaceState(null, "", "/");
  if (p.has("error")) return p.get("error") === "access_denied" ? null : "ログインできませんでした";
  const saved = JSON.parse(sessionStorage.getItem(PKCE_KEY) || "null");
  sessionStorage.removeItem(PKCE_KEY);
  if (!saved || saved.state !== p.get("state")) return "ログインできませんでした";
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    body: new URLSearchParams({
      code: p.get("code")!,
      grant_type: "authorization_code",
      client_id: APP_KEY,
      redirect_uri: redirectUri(),
      code_verifier: saved.verifier,
    }),
  });
  if (!r.ok) return "ログインできませんでした";
  const j = await r.json();
  saveToken({ access: j.access_token, refresh: j.refresh_token, exp: Date.now() + j.expires_in * 1000 });
  return null;
}

let refreshing: Promise<Token> | null = null;
async function accessToken(force = false): Promise<string> {
  const t = loadToken();
  if (!t) throw new AuthError();
  if (!force && t.exp > Date.now() + 60_000) return t.access;
  refreshing ??= (async () => {
    const r = await fetch(TOKEN_URL, {
      method: "POST",
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: t.refresh, client_id: APP_KEY }),
    });
    if (!r.ok) {
      saveToken(null);
      throw new AuthError();
    }
    const j = await r.json();
    const n = { ...t, access: j.access_token, exp: Date.now() + j.expires_in * 1000 };
    saveToken(n);
    return n;
  })().finally(() => (refreshing = null));
  return (await refreshing).access;
}

export class AuthError extends Error {}

// Dropbox-API-Arg must be ASCII; escape everything else as \uXXXX.
const apiArg = (o: unknown) => JSON.stringify(o).replace(/[\u007f-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));

async function call(url: string, init: RequestInit & { headers?: Record<string, string> }): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { ...init, headers: { ...init.headers, Authorization: "Bearer " + (await accessToken()) } });
    if (r.status === 401 && attempt === 0) {
      await accessToken(true);
      continue;
    }
    if (r.status === 401) {
      saveToken(null);
      throw new AuthError();
    }
    if (r.status === 429 && attempt < 4) {
      await new Promise((ok) => setTimeout(ok, (Number(r.headers.get("Retry-After")) || 1 + attempt) * 1000));
      continue;
    }
    return r;
  }
}

async function rpc<T>(endpoint: string, body: unknown, host = API): Promise<T> {
  const r = await call(host + endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw Object.assign(new Error(endpoint), { status: r.status, detail: await r.text() });
  return r.json();
}

interface Entry {
  ".tag": "file" | "folder" | "deleted";
  id: string;
  name: string;
  path_lower: string;
  path_display: string;
  rev?: string;
  size?: number;
  server_modified?: string;
  client_modified?: string;
}

function toItem(e: Entry): Item {
  const parts = e.path_display.split("/").slice(1, -1);
  return {
    id: e.id,
    name: e.name,
    folder: parts.join("/"),
    path: e.path_display,
    kind: kindOf(e.name),
    size: e.size ?? 0,
    modified: Date.parse(e.client_modified || e.server_modified || "") || 0,
    rev: e.rev,
  };
}

/* Thumbnails: collect requests for a few ms and fetch up to 25 per call, at most 3 calls at a time. */
const thumbCache = new Map<string, Promise<string | null>>();
let queue: { item: Item; done: (u: string | null) => void }[] = [];
let timer = 0;
let inflight = 0;
function pump() {
  while (inflight < 3 && queue.length) {
    const batch = queue.splice(0, 25);
    inflight++;
    rpc<{ entries: { ".tag": string; thumbnail?: string }[] }>(
      "files/get_thumbnail_batch",
      { entries: batch.map((q) => ({ path: q.item.id, format: "jpeg", size: "w640h480", mode: "bestfit" })) },
      CONTENT,
    )
      .then((r) =>
        r.entries.forEach((e, i) => {
          if (e[".tag"] !== "success" || !e.thumbnail) return batch[i].done(null);
          const bin = atob(e.thumbnail);
          const bytes = new Uint8Array(bin.length);
          for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
          batch[i].done(URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" })));
        }),
      )
      .catch(() => batch.forEach((q) => q.done(null)))
      .finally(() => {
        inflight--;
        pump();
      });
  }
}

const linkCache = new Map<string, { url: string; at: number }>();
async function tempLink(item: Item): Promise<string> {
  const c = linkCache.get(item.id);
  // Temporary links last 4 hours.
  if (c && Date.now() - c.at < 3.5 * 3600_000) return c.url;
  const r = await rpc<{ link: string }>("files/get_temporary_link", { path: item.id });
  linkCache.set(item.id, { url: r.link, at: Date.now() });
  return r.link;
}

export const dropboxSource: Source = {
  kind: "dropbox",
  async load(): Promise<Library> {
    const entries: Entry[] = [];
    let r = await rpc<{ entries: Entry[]; cursor: string; has_more: boolean }>("files/list_folder", { path: "", recursive: true, limit: 2000 });
    entries.push(...r.entries);
    while (r.has_more) {
      r = await rpc("files/list_folder/continue", { cursor: r.cursor });
      entries.push(...r.entries);
    }
    // Only the last component of path_display is reliably cased, so folder paths are rebuilt from folder entries.
    const dirs = new Map<string, string>([["", ""]]);
    const folderEntries = entries.filter((e) => e[".tag"] === "folder").sort((a, b) => a.path_lower.length - b.path_lower.length);
    for (const e of folderEntries) {
      const parent = e.path_lower.slice(0, e.path_lower.lastIndexOf("/"));
      const pd = dirs.get(parent) ?? parent.slice(1);
      dirs.set(e.path_lower, (pd ? pd + "/" : "") + e.name);
    }
    const folders = folderEntries.map((e) => dirs.get(e.path_lower)!);
    const items = entries
      .filter((e) => e[".tag"] === "file")
      .map((e) => ({ ...toItem(e), folder: dirs.get(e.path_lower.slice(0, e.path_lower.lastIndexOf("/"))) ?? toItem(e).folder }));
    return { folders, items };
  },
  thumb(item) {
    if (item.kind === "gif" || item.kind === "video") return tempLink(item).catch(() => null);
    if (item.kind === "text") return Promise.resolve(null);
    let p = thumbCache.get(item.id);
    if (!p) {
      p = new Promise((done) => {
        queue.push({ item, done });
        clearTimeout(timer);
        timer = window.setTimeout(pump, 30);
      });
      thumbCache.set(item.id, p);
    }
    return p;
  },
  async media(item): Promise<Media> {
    const url = await tempLink(item);
    return item.kind === "video" ? { type: "video", url } : { type: "img", url };
  },
  async readText(item, preview = false): Promise<TextFile> {
    const headers: Record<string, string> = { "Dropbox-API-Arg": apiArg({ path: item.id }) };
    if (preview) headers.Range = "bytes=0-2047";
    const r = await call(CONTENT + "files/download", { method: "POST", headers });
    if (!r.ok && r.status !== 206) throw new Error("download");
    const meta = JSON.parse(r.headers.get("Dropbox-API-Result") || "{}");
    const buf = await r.arrayBuffer();
    const big = item.size > 2_000_000;
    const { text, enc } = decodeText(big && !preview ? buf.slice(0, 2_000_000) : buf, preview || big);
    // TextEncoder only writes UTF-8, so Shift_JIS files stay read-only to keep their encoding.
    return { text, enc, rev: meta.rev ?? item.rev, readonly: big || enc === "Shift_JIS" };
  },
  async writeText(item, text) {
    const r = await call(CONTENT + "files/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": apiArg({ path: item.path, mode: { ".tag": "update", update: item.rev }, autorename: false, mute: true }),
      },
      body: new TextEncoder().encode(text),
    });
    if (r.status === 409) throw new ConflictError();
    if (!r.ok) throw new Error("upload");
    const e: Entry = await r.json();
    return e.rev;
  },
  async upload(file, folder) {
    if (file.size > 150 * 1024 * 1024) return null;
    const r = await call(CONTENT + "files/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": apiArg({ path: "/" + (folder ? folder + "/" : "") + file.name, mode: "add", autorename: true }),
      },
      body: file,
    });
    if (!r.ok) return null;
    return toItem({ ...(await r.json()), ".tag": "file" });
  },
  async account() {
    try {
      return (await rpc<{ email: string }>("users/get_current_account", null)).email;
    } catch {
      return null;
    }
  },
  async logout() {
    try {
      await rpc("auth/token/revoke", null);
    } catch {
      /* token may already be invalid */
    }
    saveToken(null);
  },
};
