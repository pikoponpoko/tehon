import { useEffect, useRef, useState } from "react";
import { ConflictError, type Item, type Media, type Source } from "../lib/types";
import { pref, VIEWER_BGS } from "../lib/ui";

interface Props {
  source: Source;
  list: Item[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  onSaved: (it: Item) => void;
  onError: (e: unknown) => void;
  toast: (m: string) => void;
}

type El = HTMLCanvasElement | HTMLImageElement | HTMLVideoElement;

export function Viewer({ source, list, index, onIndex, onClose, onSaved, onError, toast }: Props) {
  const item = list[index];
  const [media, setMedia] = useState<Media | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [playing, setPlaying] = useState(true);
  const [bg, setBgState] = useState(() => pref("vbg") || "dark");
  const [text, setText] = useState<string | null>(null);
  const [vstate, setVstate] = useState("");
  const [readonly, setReadonly] = useState(false);
  const [size, setSize] = useState<[number, number] | null>(null);

  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const V = useRef({ z: 1, x: 0, y: 0, fit: 1, w: 0, h: 0, el: null as El | null });
  const playRef = useRef(true);
  const rev = useRef<string | undefined>(undefined);
  const saveTimer = useRef(0);
  const conflict = useRef(false);

  const setBg = (b: string) => {
    setBgState(b);
    pref("vbg", b);
  };

  /* zoom / pan */
  const apply = () => {
    const v = V.current;
    if (!v.el) return;
    v.el.style.width = v.w + "px";
    v.el.style.height = v.h + "px";
    v.el.style.transform = `translate(${v.x - (v.w * v.z) / 2}px,${v.y - (v.h * v.z) / 2}px) scale(${v.z})`;
    setZoom(Math.round(v.z * 100));
  };
  const fit = () => {
    const v = V.current;
    if (!v.el || !stage.current) return;
    const r = stage.current.getBoundingClientRect();
    v.fit = Math.min(r.width / v.w, r.height / v.h, 1) * 0.96;
    v.z = v.fit;
    v.x = 0;
    v.y = 0;
    apply();
  };
  const zoomAt = (f: number, cx = 0, cy = 0) => {
    const v = V.current;
    if (!v.el) return;
    const nz = Math.max(0.05, Math.min(16, v.z * f));
    const k = nz / v.z;
    v.x = cx - (cx - v.x) * k;
    v.y = cy - (cy - v.y) * k;
    v.z = nz;
    apply();
  };
  const use = (el: El | null, w: number, h: number) => {
    V.current.el = el;
    V.current.w = w;
    V.current.h = h;
    setSize(w && h ? [w, h] : null);
    fit();
  };

  /* load item */
  useEffect(() => {
    let live = true;
    setMedia(null);
    setFallback(null);
    setText(null);
    setVstate("");
    setSize(null);
    setPlaying(true);
    playRef.current = true;
    conflict.current = false;
    V.current.el = null;
    rev.current = item.rev;
    if (item.kind === "text") {
      source
        .readText(item)
        .then((t) => {
          if (!live) return;
          rev.current = t.rev;
          setText(t.text);
          setReadonly(t.readonly);
          setVstate(t.readonly ? (t.enc === "Shift_JIS" ? "Shift_JIS・閲覧のみ" : "2MBを超えるため閲覧のみ") : "");
        })
        .catch((e) => {
          onError(e);
          if (live) setVstate("読み込めませんでした");
        });
    } else {
      source
        .media(item)
        .then((m) => live && setMedia(m))
        .catch((e) => {
          onError(e);
          if (live) showFallback();
        });
    }
    return () => {
      live = false;
      clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const showFallback = () => {
    source.thumb(item).then((u) => {
      if (u && !u.startsWith("blob:") && item.kind === "video") u = null;
      if (u) {
        setFallback(u);
        toast("サムネイルを表示しています");
      } else toast("プレビューできない形式です");
    });
  };

  /* canvas media (demo) */
  useEffect(() => {
    if (media?.type !== "canvas" || !canvas.current) return;
    const cv = canvas.current;
    cv.width = media.w;
    cv.height = media.h;
    const ctx = cv.getContext("2d")!;
    media.draw(ctx, 0);
    use(cv, media.w, media.h);
    if (!media.animated) return;
    let raf = 0, t0 = performance.now(), acc = 0;
    const f = (n: number) => {
      if (playRef.current) acc += (n - t0) / 1000;
      t0 = n;
      media.draw(ctx, acc);
      raf = requestAnimationFrame(f);
    };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media]);

  const save = (value: string) => {
    if (conflict.current || readonly) return;
    clearTimeout(saveTimer.current);
    setVstate("編集中");
    saveTimer.current = window.setTimeout(async () => {
      try {
        const r = await source.writeText({ ...item, rev: rev.current }, value);
        rev.current = r;
        onSaved({ ...item, rev: r, size: new TextEncoder().encode(value).length });
        setVstate(source.kind === "demo" ? "保存しました（このデモ内のみ）" : "保存しました");
      } catch (e) {
        onError(e);
        if (e instanceof ConflictError) {
          conflict.current = true;
          setVstate("他の端末で更新されたため保存していません");
        } else setVstate("保存できませんでした");
      }
    }, 600);
  };

  const reloadText = () => {
    conflict.current = false;
    setVstate("");
    source.readText(item).then((t) => {
      rev.current = t.rev;
      setText(t.text);
    }, onError);
  };

  const animated = item.kind === "gif" ? media?.type === "canvas" : item.kind === "video";
  const togglePlay = () => {
    const p = !playRef.current;
    playRef.current = p;
    setPlaying(p);
    if (video.current) p ? video.current.play() : video.current.pause();
  };
  const prev = () => index > 0 && onIndex(index - 1);
  const next = () => index < list.length - 1 && onIndex(index + 1);

  /* keyboard */
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e) => {
    const t = e.target as HTMLElement;
    if (t.tagName === "TEXTAREA") {
      if (e.key === "Escape") t.blur();
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        clearTimeout(saveTimer.current);
        if (text !== null) save(text);
      }
      return;
    }
    const a: Record<string, () => void> = {
      Escape: onClose,
      ArrowLeft: prev,
      ArrowRight: next,
      "+": () => zoomAt(1.25),
      "=": () => zoomAt(1.25),
      "-": () => zoomAt(0.8),
      "0": fit,
      " ": () => animated && togglePlay(),
    };
    if (a[e.key]) {
      e.preventDefault();
      a[e.key]();
    }
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => keys.current(e);
    const r = () => fit();
    addEventListener("keydown", k);
    addEventListener("resize", r);
    return () => {
      removeEventListener("keydown", k);
      removeEventListener("resize", r);
    };
  }, []);

  /* pointer: drag to pan, pinch, wheel, double tap, swipe */
  useEffect(() => {
    const s = stage.current!;
    const pts = new Map<number, [number, number]>();
    let pinch: { d: number } | null = null;
    let lastTap = 0;
    let sx: number | null = null;
    const rel = (e: { clientX: number; clientY: number }): [number, number] => {
      const r = s.getBoundingClientRect();
      return [e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2];
    };
    const isText = (e: Event) => (e.target as HTMLElement).tagName === "TEXTAREA";
    const wheel = (e: WheelEvent) => {
      if (isText(e)) return;
      e.preventDefault();
      const [x, y] = rel(e);
      zoomAt(Math.exp(-e.deltaY * 0.0015), x, y);
    };
    const down = (e: PointerEvent) => {
      if (isText(e)) return;
      s.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) };
      }
    };
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      if (pts.size === 2 && pinch) {
        pts.set(e.pointerId, [e.clientX, e.clientY]);
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        const [cx, cy] = rel({ clientX: (a[0] + b[0]) / 2, clientY: (a[1] + b[1]) / 2 });
        zoomAt(d / pinch.d, cx, cy);
        pinch.d = d;
        return;
      }
      V.current.x += e.clientX - p[0];
      V.current.y += e.clientY - p[1];
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      apply();
    };
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (e.type !== "pointerup" || isText(e)) return;
      const n = Date.now();
      if (n - lastTap < 300) {
        const v = V.current;
        const [x, y] = rel(e);
        Math.abs(v.z - v.fit) < 0.001 ? zoomAt(Math.max(2.5, 1 / v.z), x, y) : fit();
      }
      lastTap = n;
    };
    const tstart = (e: TouchEvent) => {
      sx = !isText(e) && e.touches.length === 1 && Math.abs(V.current.z - V.current.fit) < 0.001 ? e.touches[0].clientX : null;
    };
    const tend = (e: TouchEvent) => {
      if (sx == null) return;
      const dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 70) keys.current(new KeyboardEvent("keydown", { key: dx < 0 ? "ArrowRight" : "ArrowLeft" }));
      sx = null;
    };
    s.addEventListener("wheel", wheel, { passive: false });
    s.addEventListener("pointerdown", down);
    s.addEventListener("pointermove", move);
    s.addEventListener("pointerup", up);
    s.addEventListener("pointercancel", up);
    s.addEventListener("touchstart", tstart, { passive: true });
    s.addEventListener("touchend", tend);
    return () => {
      s.removeEventListener("wheel", wheel);
      s.removeEventListener("pointerdown", down);
      s.removeEventListener("pointermove", move);
      s.removeEventListener("pointerup", up);
      s.removeEventListener("pointercancel", up);
      s.removeEventListener("touchstart", tstart);
      s.removeEventListener("touchend", tend);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isText = item.kind === "text";
  const imgSrc = fallback ?? (media?.type === "img" ? media.url : null);

  return (
    <div className={"viewer" + (bg !== "dark" ? " bg-" + bg : "")}>
      <div className="vbar">
        <button className="vbtn" aria-label="閉じる" onClick={onClose}>
          ✕
        </button>
        <span className="t">{item.name}</span>
        <span className="vstate">{vstate}</span>
        {vstate.startsWith("他の端末") && (
          <button className="vbtn" onClick={reloadText}>
            読み込み直す
          </button>
        )}
        {!isText && (
          <>
            <button className="vbtn" aria-label="縮小" onClick={() => zoomAt(0.8)}>
              −
            </button>
            <button
              className="vbtn"
              aria-label="全体表示"
              onClick={() => {
                const v = V.current;
                if (Math.abs(v.z - v.fit) < 0.001) {
                  v.z = 1;
                  v.x = 0;
                  v.y = 0;
                  apply();
                } else fit();
              }}
            >
              {zoom}%
            </button>
            <button className="vbtn" aria-label="拡大" onClick={() => zoomAt(1.25)}>
              ＋
            </button>
          </>
        )}
        <span className="swatches" role="group" aria-label="背景">
          {VIEWER_BGS.map(([v, l]) => (
            <button key={v} className={"swatch sw-" + v + (bg === v ? " on" : "")} aria-label={l} title={l} onClick={() => setBg(v)} />
          ))}
        </span>
        {animated && (
          <button className="vbtn" onClick={togglePlay}>
            {playing ? "❚❚" : "▶"}
          </button>
        )}
        <button className="vbtn" aria-label="前へ" onClick={prev}>
          ‹
        </button>
        <button className="vbtn" aria-label="次へ" onClick={next}>
          ›
        </button>
      </div>
      <div className="stage" ref={stage}>
        <canvas ref={canvas} hidden={media?.type !== "canvas" || !!fallback} />
        <img
          ref={img}
          alt=""
          draggable={false}
          hidden={!imgSrc}
          src={imgSrc ?? undefined}
          onLoad={(e) => use(e.currentTarget, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
          onError={() => !fallback && showFallback()}
        />
        <video
          ref={video}
          muted
          loop
          playsInline
          autoPlay
          hidden={media?.type !== "video" || !!fallback}
          src={media?.type === "video" && !fallback ? media.url : undefined}
          onLoadedMetadata={(e) => use(e.currentTarget, e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
          onError={() => media?.type === "video" && toast("この動画形式はブラウザで再生できません")}
        />
        {isText && (
          <textarea
            spellCheck={false}
            aria-label="テキスト"
            value={text ?? ""}
            readOnly={readonly || text === null}
            onChange={(e) => {
              setText(e.target.value);
              save(e.target.value);
            }}
          />
        )}
      </div>
      <div className="vfoot">
        <span className="path">
          {item.path}
          {size ? ` · ${size[0]}×${size[1]}` : ""}
        </span>
      </div>
    </div>
  );
}
