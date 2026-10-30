import { kindOf, type Item, type Library, type Media, type Source, type TextFile } from "./types";

// Demo library with generated artwork, used by the preview build (no Dropbox).
const FOLDERS = ["キャラクター/表情", "キャラクター/ポーズ", "キャラクター/手", "背景/屋内", "背景/屋外", "配色", "UI", "動き", "メモ"];
const PAL = [
  ["#1f3b73", "#f2a65a", "#f6e6c8"], ["#0e4d64", "#6fb3b8", "#f1f1f1"], ["#3b1f4a", "#d96c75", "#f5c16c"],
  ["#14281d", "#5c946e", "#e3e7af"], ["#20232a", "#61dafb", "#ffffff"], ["#5b2a86", "#9a48d0", "#f0e6ff"],
  ["#7a1f1f", "#e86a33", "#ffd166"], ["#102542", "#f87060", "#cdd7d6"], ["#2d3047", "#93b7be", "#e0ca3c"],
  ["#0b3954", "#bfd7ea", "#ff5a5f"],
];
const NAMES: Record<string, string[]> = {
  "キャラクター/表情": ["笑顔", "驚き", "怒り", "泣き顔", "横顔"],
  "キャラクター/ポーズ": ["走る", "座る", "振り向き", "跳ぶ"],
  "キャラクター/手": ["握る", "指差し", "開いた手", "持つ"],
  "背景/屋内": ["教室", "台所", "駅構内", "喫茶店"],
  "背景/屋外": ["夕方の河川敷", "夜の商店街", "雨の交差点", "山道"],
  配色: ["寒色", "補色", "夕焼け", "ネオン"],
  UI: ["ボタン", "カード", "メニュー"],
  動き: ["髪のなびき", "煙", "水しぶき", "歩き"],
};
const MEMOS: [string, string][] = [
  ["演出メモ.txt", "カット12\n・振り向きは2コマ溜めてから一気に\n・髪は1コマ遅れて追従\n・最後に瞬き\n\nカット13\n・煙は手前に1レイヤー足す"],
  ["配色ルール.txt", "夕景\n空：橙→紫のグラデーション\n影：青紫寄り、彩度は落とさない\n\n夜\n街灯の色を主光源にする"],
  ["参考リンクまとめ.txt", "歩きのサイクル：8コマ／2コマ打ち\n走り：6コマ\n\nあとで見る\n・水しぶきの作画\n・炎の形の変化"],
  ["アイデア.txt", "雨上がりの交差点で、水たまりに映る信号だけが動くショット"],
];

interface Art {
  pal: string[];
  style: number;
  seed: number;
}
const art = new Map<string, Art>();
const texts = new Map<string, string>();
const blobs = new Map<string, string>();

function build(): Library {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const now = Date.parse("2026-10-30T12:00:00Z");
  const items: Item[] = [];
  for (let i = 0; i < 72; i++) {
    const folder = FOLDERS[i % 8];
    const ext = folder === "動き" ? (i % 2 ? "gif" : "mp4") : rnd() > 0.5 ? "png" : "jpg";
    const name = `${pick(NAMES[folder])}_${String(i + 1).padStart(3, "0")}.${ext}`;
    const id = "id:demo" + i;
    items.push({
      id, name, folder, path: `/${folder}/${name}`, kind: kindOf(name), size: 0,
      modified: now - i * 3.7e6 * (1 + rnd() * 8),
      w: pick([1200, 1600, 2048, 1080]), h: pick([900, 1200, 1536, 1920]),
    });
    art.set(id, { pal: pick(PAL), style: Math.floor(rnd() * 4), seed: Math.floor(rnd() * 1e6) });
  }
  MEMOS.forEach(([name, text], j) => {
    const id = "id:memo" + j;
    texts.set(id, text);
    items.push({ id, name, folder: "メモ", path: `/メモ/${name}`, kind: "text", size: text.length, modified: now - j * 9e6 - 2e6 });
  });
  return { folders: [...FOLDERS], items };
}

function draw(ctx: CanvasRenderingContext2D, a: Art, W: number, H: number, t = 0) {
  let s = a.seed;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const [c0, c1, c2] = a.pal;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, c0);
  g.addColorStop(1, c1);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = c2;
  ctx.strokeStyle = c2;
  if (a.style === 0) {
    for (let i = 0; i < 9; i++) {
      ctx.globalAlpha = 0.25 + r() * 0.5;
      ctx.beginPath();
      ctx.arc(r() * W + Math.sin(t + i) * W * 0.04, r() * H, (r() * 0.22 + 0.05) * W, 0, 7);
      ctx.fill();
    }
  } else if (a.style === 1) {
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(0, H * 0.7);
    for (let x = 0; x <= W; x += W / 12) ctx.lineTo(x, H * (0.45 + r() * 0.25) + Math.sin(t + x) * H * 0.02);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(W * 0.7, H * 0.3, W * 0.1, 0, 7);
    ctx.fill();
  } else if (a.style === 2) {
    ctx.lineWidth = W * 0.012;
    for (let i = 0; i < 14; i++) {
      ctx.globalAlpha = 0.3 + r() * 0.6;
      ctx.beginPath();
      const y = r() * H;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(W * 0.3, y + (r() - 0.5) * H + Math.sin(t) * H * 0.05, W * 0.6, y + (r() - 0.5) * H, W, y);
      ctx.stroke();
    }
  } else {
    for (let i = 0; i < 7; i++) {
      ctx.globalAlpha = 0.3 + r() * 0.6;
      ctx.save();
      ctx.translate(r() * W, r() * H);
      ctx.rotate(r() * 3 + t * 0.3);
      ctx.fillRect(-W * 0.12, -H * 0.08, W * 0.24, H * 0.16);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

const thumbs = new Map<string, string>();

export const demoSource: Source = {
  kind: "demo",
  async load() {
    return build();
  },
  async thumb(item) {
    if (blobs.has(item.id)) return blobs.get(item.id)!;
    const a = art.get(item.id);
    if (!a || !item.w || !item.h) return null;
    if (!thumbs.has(item.id)) {
      const cv = document.createElement("canvas");
      cv.width = 320;
      cv.height = Math.round((320 * item.h) / item.w);
      draw(cv.getContext("2d")!, a, cv.width, cv.height);
      thumbs.set(item.id, cv.toDataURL("image/jpeg", 0.8));
    }
    return thumbs.get(item.id)!;
  },
  async media(item): Promise<Media> {
    if (blobs.has(item.id)) return { type: item.kind === "video" ? "video" : "img", url: blobs.get(item.id)! };
    const a = art.get(item.id)!;
    const w = Math.round(item.w! / 2), h = Math.round(item.h! / 2);
    const speed = item.kind === "gif" ? 3 : 1.2;
    return { type: "canvas", w, h, animated: item.kind === "gif" || item.kind === "video", draw: (ctx, t) => draw(ctx, a, w, h, t * speed) };
  },
  async readText(item): Promise<TextFile> {
    return { text: texts.get(item.id) ?? "", enc: "UTF-8", readonly: false };
  },
  async writeText(item, text) {
    texts.set(item.id, text);
    return undefined;
  },
  async upload(file, folder) {
    const kind = kindOf(file.name);
    if (kind === "other") return null;
    const id = "id:local" + Date.now() + Math.random();
    if (kind === "text") texts.set(id, await file.text());
    else blobs.set(id, URL.createObjectURL(file));
    return { id, name: file.name, folder, path: `/${folder}/${file.name}`, kind, size: file.size, modified: Date.now() };
  },
  async account() {
    return null;
  },
  async logout() {},
};
