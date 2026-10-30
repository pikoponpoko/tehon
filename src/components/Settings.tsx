import { useEffect, useState } from "react";
import type { Source } from "../lib/types";
import { applyTheme, pref, THEMES, VIEWER_BGS } from "../lib/ui";

export function Settings({ source, onClose, onLogout }: { source: Source; onClose: () => void; onLogout: () => void }) {
  const [theme, setTheme] = useState(() => pref("theme") || "system");
  const [vbg, setVbg] = useState(() => pref("vbg") || "dark");
  const [account, setAccount] = useState<string | null>(null);

  useEffect(() => {
    source.account().then(setAccount);
  }, [source]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [onClose]);

  return (
    <div className="dlg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onClose();
        }}
      >
        <h4>設定</h4>
        <label htmlFor="fTheme">カラーテーマ</label>
        <select
          id="fTheme"
          value={theme}
          onChange={(e) => {
            setTheme(e.target.value);
            applyTheme(e.target.value);
            pref("theme", e.target.value);
          }}
        >
          {THEMES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <label htmlFor="fVbg">ビューアの背景</label>
        <select
          id="fVbg"
          value={vbg}
          onChange={(e) => {
            setVbg(e.target.value);
            pref("vbg", e.target.value);
          }}
        >
          {VIEWER_BGS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        {source.kind === "dropbox" && (
          <div className="acct">
            <span>{account ?? "Dropbox"}</span>
            <button type="button" className="btn" onClick={onLogout}>
              ログアウト
            </button>
          </div>
        )}
        <div className="row">
          <button className="btn pri">閉じる</button>
        </div>
      </form>
    </div>
  );
}
