export type Kind = "image" | "gif" | "video" | "text" | "other";

export interface Item {
  id: string;
  name: string;
  /** Folder path relative to the library root, "" for root. */
  folder: string;
  path: string;
  kind: Kind;
  size: number;
  modified: number;
  rev?: string;
  w?: number;
  h?: number;
}

export interface Library {
  folders: string[];
  items: Item[];
}

/** What the viewer shows for an item. */
export type Media =
  | { type: "img"; url: string }
  | { type: "video"; url: string }
  | { type: "canvas"; w: number; h: number; draw: (ctx: CanvasRenderingContext2D, t: number) => void; animated: boolean };

export interface TextFile {
  text: string;
  enc: "UTF-8" | "Shift_JIS";
  rev?: string;
  readonly: boolean;
}

export class ConflictError extends Error {}

export interface Source {
  kind: "dropbox" | "demo";
  load(): Promise<Library>;
  thumb(item: Item): Promise<string | null>;
  media(item: Item): Promise<Media>;
  readText(item: Item, preview?: boolean): Promise<TextFile>;
  /** Saves only if the file is still at `rev`; throws ConflictError otherwise. Returns the new rev. */
  writeText(item: Item, text: string): Promise<string | undefined>;
  upload(file: File, folder: string): Promise<Item | null>;
  account(): Promise<string | null>;
  logout(): Promise<void>;
}

const IMG = ["jpg", "jpeg", "png", "webp", "bmp", "avif", "tif", "tiff", "svg"];
const VIDEO = ["mp4", "webm", "mov", "m4v", "ogv"];
const TEXT = ["txt", "md"];

export function kindOf(name: string): Kind {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "gif") return "gif";
  if (IMG.includes(ext)) return "image";
  if (VIDEO.includes(ext)) return "video";
  if (TEXT.includes(ext)) return "text";
  return "other";
}

export function decodeText(buf: ArrayBuffer, partial = false): { text: string; enc: "UTF-8" | "Shift_JIS" } {
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(buf, { stream: partial }), enc: "UTF-8" };
  } catch {
    return { text: new TextDecoder("shift_jis").decode(buf), enc: "Shift_JIS" };
  }
}
