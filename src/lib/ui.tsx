import { useCallback, useRef, useState } from "react";

/** Per-browser preferences. Storage can be unavailable (private mode, previews), so failures are ignored. */
export function pref(k: string): string | null;
export function pref(k: string, v: string): void;
export function pref(k: string, v?: string) {
  try {
    if (v === undefined) return localStorage.getItem("tehon-" + k);
    localStorage.setItem("tehon-" + k, v);
  } catch {
    return null;
  }
}

export const THEMES = [
  ["system", "システム"],
  ["light", "ライト"],
  ["white", "ホワイト"],
  ["dark", "ダーク"],
  ["navy", "ネイビー"],
  ["graphite", "グラファイト"],
] as const;

export const VIEWER_BGS = [
  ["dark", "黒"],
  ["blur", "透明ぼかし"],
  ["light", "ライトグレー"],
] as const;

export function applyTheme(t: string) {
  if (t && t !== "system") document.documentElement.dataset.tt = t;
  else delete document.documentElement.dataset.tt;
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const t = useRef(0);
  const toast = useCallback((m: string, sticky = false) => {
    setMsg(m);
    clearTimeout(t.current);
    if (!sticky) t.current = window.setTimeout(() => setMsg(null), 2400);
  }, []);
  return { toast, toastEl: msg ? <div className="toast">{msg}</div> : null };
}
