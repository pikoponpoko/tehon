// Eagle → Tehon import, for Eagle libraries copied into the app folder at /.tehon/eagle/<name>.library.
// Originals are moved out of that copy to /<name>/<Eagle folder path>/; tags, stars and URL bookmarks go into
// this device's Tehon data. Files already in /<name>/ with the same content are reused, not duplicated.
import * as dbx from "./dropbox";

export const EAGLE_DIR = dbx.META_DIR + "/eagle";

interface EagleFolder { id: string; name: string; children?: EagleFolder[] }
interface EagleItem { id: string; name: string; ext: string; tags?: string[]; folders?: string[]; star?: number; url?: string; isDeleted?: boolean; btime?: number }

const clean = (s: string) => s.replace(/[\\/]/g, "／").trim().replace(/[. ]+$/, "") || "_";

async function pool<T>(xs: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < xs.length) await fn(xs[i++]); }));
}

export async function importAll(own: dbx.DeviceFile, progress: (msg: string) => void) {
  const tree = await dbx.listTree(EAGLE_DIR).catch(e => {
    if (e instanceof dbx.DropboxError && e.summary.startsWith("path/not_found")) return [];
    throw e;
  });
  const libs = tree.filter(e => e[".tag"] === "folder" && /^\/\.tehon\/eagle\/[^/]+\.library$/.test(e.path_lower)).map(e => e.name.replace(/\.library$/i, ""));
  const existing = (await dbx.listAll()).filter(e => e[".tag"] === "file");
  const total = { items: 0, urls: 0, failed: 0 };
  for (const lib of libs) {
    const r = await importLib(lib, tree, existing, own, (n, m) => progress(`${lib} ${n} / ${m}`));
    total.items += r.items; total.urls += r.urls; total.failed += r.failed;
  }
  return { libs, ...total };
}

async function importLib(lib: string, tree: dbx.FileMeta[], existing: dbx.FileMeta[], own: dbx.DeviceFile, progress: (n: number, m: number) => void) {
  const root = `${EAGLE_DIR}/${lib}.library`.toLowerCase();
  const libName = clean(lib);
  const meta = await dbx.readJson<{ folders?: EagleFolder[] }>(`${EAGLE_DIR}/${lib}.library/metadata.json`);
  const fpath = new Map<string, string>();
  (function walk(fs: EagleFolder[] = [], pre: string) {
    for (const f of fs) { const p = `${pre}/${clean(f.name)}`; fpath.set(f.id, p); walk(f.children, p); }
  })(meta.folders, "/" + libName);
  await dbx.createFolders([...new Set(["/" + libName, ...fpath.values()])]);

  const dirs = new Map<string, dbx.FileMeta[]>();
  for (const e of tree) {
    const m = e.path_lower.match(/^(.*\/images\/[^/]+\.info)\/[^/]+$/);
    if (e[".tag"] === "file" && m && m[1].startsWith(root + "/images/")) (dirs.get(m[1]) || dirs.set(m[1], []).get(m[1])!).push(e);
  }
  const byHash = new Map<string, dbx.FileMeta>();
  for (const e of existing) if (e.content_hash && e.path_lower.startsWith(`/${libName.toLowerCase()}/`)) byHash.set(e.content_hash, e);

  // One batch must not send two files to the same path.
  const used = new Set<string>();
  const unique = (p: string) => {
    const dot = p.lastIndexOf("."), base = dot > p.lastIndexOf("/") ? p.slice(0, dot) : p, ext = p.slice(base.length);
    for (let n = 2, q = p; ; q = `${base} (${n++})${ext}`) if (!used.has(q.toLowerCase())) { used.add(q.toLowerCase()); return q; }
  };
  const moves: { from_path: string; to_path: string }[] = [], moved: EagleItem[] = [];
  const t = Date.now();
  const res = { items: 0, urls: 0, failed: 0 };
  const setMeta = (id: string, m: EagleItem) => {
    own.items[id] = { tags: m.tags || [], favorite: (m.star || 0) > 0, trashed: !!m.isDeleted, updatedAt: t };
    res.items++;
  };
  let done = 0;
  await pool([...dirs.values()], 8, async files => {
    const mf = files.find(f => f.name === "metadata.json");
    progress(++done, dirs.size);
    if (!mf) return;
    let m: EagleItem;
    try { m = await dbx.readJson(mf.id); } catch { res.failed++; return; }
    const folder = fpath.get((m.folders || []).find(id => fpath.has(id)) || "") || "/" + libName;
    if ((m.ext || "").toLowerCase() === "url") {
      if (!m.url) return;
      own.urls["eagle-" + m.id] = { name: m.name, url: m.url, folder: folder.slice(1), tags: m.tags || [], favorite: (m.star || 0) > 0, trashed: !!m.isDeleted, addedAt: m.btime || t, updatedAt: t };
      res.urls++;
      return;
    }
    const want = `${m.name}.${m.ext}`.normalize("NFC").toLowerCase();
    const orig = files.find(f => f.name.normalize("NFC").toLowerCase() === want) || files.find(f => f !== mf && !f.name.endsWith("_thumbnail.png"));
    if (!orig) return;
    const to = unique(`${folder}/${clean(orig.name)}`);
    const dup = orig.content_hash && byHash.get(orig.content_hash);
    if (dup) {
      byHash.delete(orig.content_hash!);
      if (dup.path_lower === to.toLowerCase()) return setMeta(dup.id, m);
      moves.push({ from_path: dup.id, to_path: to });
    } else moves.push({ from_path: orig.id, to_path: to });
    moved.push(m);
  });

  const out = await dbx.moveBatch(moves);
  out.forEach((f, i) => (f ? setMeta(f.id, moved[i]) : res.failed++));
  await dbx.saveDevice(own);
  // What is left of the copy is Eagle's thumbnails and metadata.
  if (!res.failed) await dbx.remove(`${EAGLE_DIR}/${lib}.library`);
  return res;
}
