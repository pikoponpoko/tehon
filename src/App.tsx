import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthError, dropboxSource, finishLogin, hasSession, startLogin } from "./lib/dropbox";
import { demoSource } from "./lib/demo";
import type { Item, Library, Source } from "./lib/types";
import { pref, useToast } from "./lib/ui";
import { Grid } from "./components/Grid";
import { Viewer } from "./components/Viewer";
import { Settings } from "./components/Settings";

const DEMO = import.meta.env.VITE_DEMO === "1";
// Module-level so StrictMode's double effect doesn't redeem the OAuth code twice.
let boot: Promise<string | null> | null = null;

type Sort = "added-desc" | "added-asc" | "name-asc" | "kind" | "random";

export function App() {
  const [source, setSource] = useState<Source | null>(DEMO ? demoSource : null);
  const [booting, setBooting] = useState(!DEMO);
  const [loginErr, setLoginErr] = useState<string | null>(null);

  useEffect(() => {
    if (DEMO) return;
    (boot ??= finishLogin())
      .then((err) => {
        setLoginErr(err);
        if (hasSession()) setSource(dropboxSource);
      })
      .catch(() => setLoginErr("ログインできませんでした"))
      .finally(() => setBooting(false));
  }, []);

  if (booting) return null;
  if (!source)
    return (
      <div className="login">
        <h1>Tehon</h1>
        <button className="btn pri lg" onClick={() => startLogin()}>
          Dropboxでログイン
        </button>
        {loginErr && <p className="err">{loginErr}</p>}
      </div>
    );
  return (
    <Browser
      source={source}
      onSignedOut={() => {
        setSource(null);
      }}
    />
  );
}

function Browser({ source, onSignedOut }: { source: Source; onSignedOut: () => void }) {
  const [lib, setLib] = useState<Library | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [folder, setFolder] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("added-desc");
  const [rseed, setRseed] = useState(() => Date.now() | 0);
  const [layout, setLayoutState] = useState<"grid" | "fall">(() => (pref("layout") === "fall" ? "fall" : "grid"));
  const [cell, setCell] = useState(170);
  const [open, setOpen] = useState<number | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { toast, toastEl } = useToast();

  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof AuthError) onSignedOut();
    },
    [onSignedOut],
  );

  const reload = useCallback(() => {
    setLoadErr(false);
    source
      .load()
      .then(setLib)
      .catch((e) => {
        fail(e);
        setLoadErr(true);
      });
  }, [source, fail]);
  useEffect(reload, [reload]);

  const setLayout = (l: "grid" | "fall") => {
    setLayoutState(l);
    pref("layout", l);
  };

  const list = useMemo(() => {
    if (!lib) return [];
    const s = q.trim().toLowerCase();
    let l = lib.items;
    if (folder !== null) l = l.filter((it) => it.folder === folder || it.folder.startsWith(folder + "/"));
    if (s) l = l.filter((it) => (it.name + " " + it.folder).toLowerCase().includes(s));
    l = [...l];
    if (sort === "random") {
      const h = (x: Item) => {
        let v = rseed;
        for (const c of x.id) v = Math.imul(v ^ c.charCodeAt(0), 2654435761);
        return v >>> 0;
      };
      return l.sort((a, b) => h(a) - h(b));
    }
    const [k, d] = sort.split("-");
    return l.sort((x, y) =>
      k === "name"
        ? x.name.localeCompare(y.name, "ja")
        : k === "kind"
          ? x.kind.localeCompare(y.kind) || y.modified - x.modified
          : d === "asc"
            ? x.modified - y.modified
            : y.modified - x.modified,
    );
  }, [lib, folder, q, sort, rseed]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    lib?.items.forEach((it) => {
      const a = it.folder ? it.folder.split("/") : [];
      a.forEach((_, k) => {
        const p = a.slice(0, k + 1).join("/");
        m.set(p, (m.get(p) || 0) + 1);
      });
    });
    return m;
  }, [lib]);

  const tree = useMemo(() => {
    if (!lib) return [];
    const all = new Set<string>();
    lib.folders.forEach((f) => {
      const a = f.split("/");
      a.forEach((_, i) => all.add(a.slice(0, i + 1).join("/")));
    });
    // Sort path segments so children follow their parent.
    return [...all].sort((a, b) => {
      const x = a.split("/"), y = b.split("/");
      for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i].localeCompare(y[i], "ja");
      return x.length - y.length;
    });
  }, [lib]);

  const upload = async (files: File[]) => {
    const target = folder ?? "";
    let n = 0, skipped = 0;
    for (const f of files) {
      toast(`アップロード中 ${n + skipped + 1} / ${files.length}`, true);
      try {
        const it = await source.upload(f, target);
        if (it) {
          n++;
          setLib((l) => (l ? { ...l, items: [it, ...l.items.filter((x) => x.id !== it.id)] } : l));
        } else skipped++;
      } catch (e) {
        fail(e);
        skipped++;
      }
    }
    toast(skipped ? `${n} 件を追加しました（${skipped} 件は追加できませんでした）` : `${n} 件を追加しました`);
  };

  useEffect(() => {
    let dc = 0;
    const enter = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) {
        dc++;
        setDrag(true);
      }
    };
    const leave = () => {
      if (--dc <= 0) {
        dc = 0;
        setDrag(false);
      }
    };
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      dc = 0;
      setDrag(false);
      if (e.dataTransfer?.files.length) upload([...e.dataTransfer.files]);
    };
    addEventListener("dragenter", enter);
    addEventListener("dragleave", leave);
    addEventListener("dragover", over);
    addEventListener("drop", drop);
    return () => {
      removeEventListener("dragenter", enter);
      removeEventListener("dragleave", leave);
      removeEventListener("dragover", over);
      removeEventListener("drop", drop);
    };
  });

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (open !== null || settings) return;
      if ((e.target as HTMLElement).matches("input,select,textarea")) return;
      if (e.key === "/") {
        e.preventDefault();
        document.getElementById("q")?.focus();
      }
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [open, settings]);

  const pick = (f: string | null) => {
    setFolder(f);
    setNavOpen(false);
  };

  return (
    <>
      <div className={"app" + (navOpen ? " nav-open" : "")}>
        <aside className="sb" onScroll={scrollShow}>
          <div className="brand">
            Tehon
            {source.kind === "demo" && (
              <span className="sync">
                <i />
                デモデータ
              </span>
            )}
          </div>
          <div className="sec">
            <div className="nav">
              <NavBtn label="すべて" n={lib?.items.length ?? 0} on={folder === null} onClick={() => pick(null)} />
            </div>
          </div>
          {tree.length > 0 && (
            <div className="sec">
              <h3>フォルダ</h3>
              <div className="nav">
                {tree.map((p) => (
                  <NavBtn
                    key={p}
                    label={p.split("/").pop()!}
                    n={counts.get(p) || 0}
                    on={folder === p}
                    depth={p.split("/").length - 1}
                    onClick={() => pick(folder === p ? null : p)}
                  />
                ))}
              </div>
            </div>
          )}
          <div className="nav setbtn">
            <button
              onClick={() => {
                setNavOpen(false);
                setSettings(true);
              }}
            >
              <span>設定</span>
            </button>
          </div>
        </aside>
        <div className="scrim" onClick={() => setNavOpen(false)} />
        <main>
          <div className="bar">
            <button className="btn ic menu" aria-label="メニュー" onClick={() => setNavOpen(true)}>
              ☰
            </button>
            <label className="search">
              <span aria-hidden="true">⌕</span>
              <input id="q" type="search" placeholder="検索" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <select
              className="btn"
              aria-label="並べ替え"
              value={sort}
              onChange={(e) => {
                const v = e.target.value as Sort;
                setSort(v);
                if (v === "random") setRseed(Date.now() | 0);
                wrapRef.current?.scrollTo(0, 0);
              }}
            >
              <option value="added-desc">更新日（新しい順）</option>
              <option value="added-asc">更新日（古い順）</option>
              <option value="name-asc">名前</option>
              <option value="kind">種類</option>
              <option value="random">ランダム</option>
            </select>
            {sort === "random" && (
              <button
                className="btn"
                onClick={() => {
                  setRseed((Date.now() ^ (Math.random() * 1e9)) | 0);
                  wrapRef.current?.scrollTo(0, 0);
                }}
              >
                シャッフル
              </button>
            )}
            <span className="seg" role="group" aria-label="レイアウト">
              <button className={layout === "grid" ? "on" : ""} aria-label="グリッド" title="グリッド" onClick={() => setLayout("grid")}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="1" y="1" width="6" height="6" rx="1" />
                  <rect x="9" y="1" width="6" height="6" rx="1" />
                  <rect x="1" y="9" width="6" height="6" rx="1" />
                  <rect x="9" y="9" width="6" height="6" rx="1" />
                </svg>
              </button>
              <button className={layout === "fall" ? "on" : ""} aria-label="ウォーターフォール" title="ウォーターフォール" onClick={() => setLayout("fall")}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="1" y="1" width="6" height="8" rx="1" />
                  <rect x="9" y="1" width="6" height="5" rx="1" />
                  <rect x="1" y="11" width="6" height="4" rx="1" />
                  <rect x="9" y="8" width="6" height="7" rx="1" />
                </svg>
              </button>
            </span>
            <input className="size" type="range" min={110} max={300} value={cell} aria-label="サムネイルサイズ" onChange={(e) => setCell(+e.target.value)} />
            <button className="btn pri" onClick={() => fileRef.current?.click()} disabled={!lib}>
              ＋ 追加
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*,.txt,.md,text/plain"
              multiple
              hidden
              onChange={(e) => {
                const fs = [...(e.target.files ?? [])];
                e.target.value = "";
                if (fs.length) upload(fs);
              }}
            />
          </div>
          <div className="grid-wrap sb" ref={wrapRef} onScroll={scrollShow}>
            {loadErr ? (
              <div className="empty">
                <p>読み込めませんでした</p>
                <button className="btn" onClick={reload}>
                  再読み込み
                </button>
              </div>
            ) : !lib ? (
              <div className="empty">読み込み中</div>
            ) : (
              <Grid source={source} list={list} layout={layout} cell={cell} root={wrapRef} onOpen={setOpen} empty={folder === null && !q ? "ファイルがありません" : "該当するファイルはありません"} />
            )}
          </div>
        </main>
      </div>
      {open !== null && list[open] && (
        <Viewer
          source={source}
          list={list}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
          onSaved={(it) => setLib((l) => (l ? { ...l, items: l.items.map((x) => (x.id === it.id ? it : x)) } : l))}
          onError={fail}
          toast={toast}
        />
      )}
      {settings && (
        <Settings
          source={source}
          onClose={() => setSettings(false)}
          onLogout={async () => {
            await source.logout();
            onSignedOut();
          }}
        />
      )}
      {drag && <div className="drop" />}
      {toastEl}
    </>
  );
}

function NavBtn({ label, n, on, depth = 0, onClick }: { label: string; n: number; on: boolean; depth?: number; onClick: () => void }) {
  return (
    <button className={on ? "on" : ""} style={depth ? { paddingLeft: 8 + depth * 16 } : undefined} onClick={onClick}>
      <span>{label}</span>
      <span className="n">{n}</span>
    </button>
  );
}

// Scrollbars stay hidden until the area scrolls.
const hideTimers = new WeakMap<Element, number>();
function scrollShow(e: React.UIEvent<HTMLElement>) {
  const el = e.currentTarget;
  el.classList.add("show");
  clearTimeout(hideTimers.get(el));
  hideTimers.set(el, window.setTimeout(() => el.classList.remove("show"), 900));
}
