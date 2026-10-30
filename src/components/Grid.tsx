import { useEffect, useRef, useState, type RefObject } from "react";
import type { Item, Source } from "../lib/types";

const CHUNK = 300;

interface Props {
  source: Source;
  list: Item[];
  layout: "grid" | "fall";
  cell: number;
  root: RefObject<HTMLDivElement | null>;
  empty: string;
  onOpen: (i: number) => void;
}

export function Grid({ source, list, layout, cell, root, empty, onOpen }: Props) {
  const [shown, setShown] = useState(CHUNK);
  const more = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => setShown(CHUNK), [list]);
  useEffect(() => {
    if (!more.current) return;
    const io = new IntersectionObserver((es) => es[0].isIntersecting && setShown((n) => n + CHUNK), { root: root.current, rootMargin: "800px" });
    io.observe(more.current);
    return () => io.disconnect();
  }, [shown, list, root]);

  if (!list.length) return <div className="empty">{empty}</div>;

  const onKey = (e: React.KeyboardEvent) => {
    const c = (e.target as HTMLElement).closest<HTMLElement>(".card");
    if (!c) return;
    const i = +c.dataset.i!;
    const cols = getComputedStyle(gridRef.current!).gridTemplateColumns.split(" ").length;
    const mv = ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols } as Record<string, number>)[e.key];
    if (mv) {
      e.preventDefault();
      (gridRef.current!.children[Math.max(0, Math.min(list.length - 1, i + mv))] as HTMLElement | undefined)?.focus();
    } else if (e.key === "Enter") onOpen(i);
  };

  return (
    <div ref={gridRef} className={"grid" + (layout === "fall" ? " fall" : "")} style={{ "--cell": cell + "px" } as React.CSSProperties} onKeyDown={onKey}>
      {list.slice(0, shown).map((it, i) => (
        <Card key={it.id} item={it} i={i} source={source} root={root} onOpen={onOpen} />
      ))}
      {shown < list.length && <div ref={more} style={{ gridColumn: "1/-1", height: 1 }} />}
    </div>
  );
}

function Card({ item, i, source, root, onOpen }: { item: Item; i: number; source: Source; root: RefObject<HTMLDivElement | null>; onOpen: (i: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [thumb, setThumb] = useState<string | null | undefined>(undefined);
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (visible || !ref.current) return;
    const io = new IntersectionObserver((es) => es[0].isIntersecting && setVisible(true), { root: root.current, rootMargin: "600px" });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [visible, root]);

  useEffect(() => {
    if (!visible) return;
    let live = true;
    if (item.kind === "text")
      source
        .readText(item, true)
        .then((t) => live && setText(t.text.slice(0, 400)))
        .catch(() => live && setText(""));
    else source.thumb(item).then((u) => live && setThumb(u));
    return () => {
      live = false;
    };
    // Re-fetch when the file changes (rev) as well as when it first scrolls into view.
  }, [visible, item.id, item.rev, source]);

  const badge = item.kind === "image" ? null : item.kind === "other" ? (item.name.split(".").pop() ?? "").toUpperCase() : item.kind.toUpperCase();

  let body;
  if (item.kind === "text") body = <div className="txtth">{text ?? ""}</div>;
  else if (thumb && item.kind === "video" && !thumb.startsWith("data:image")) body = <video className="th" src={thumb + "#t=0.1"} muted playsInline preload="metadata" />;
  else if (thumb) body = <img className="th" src={thumb} alt="" decoding="async" draggable={false} />;
  else body = <div className="th ph" />;

  return (
    <div ref={ref} className="card" tabIndex={0} data-i={i} onClick={() => onOpen(i)}>
      {body}
      {badge && <span className="kind">{badge}</span>}
      <div className="meta">
        <span className="nm">{item.name}</span>
      </div>
    </div>
  );
}
