// UI language: "auto" follows the browser (Japanese → 日本語, anything else → English). Strings are keyed by their Japanese text.
const KEY="tehon-lang";
export const langPref=()=>{try{return localStorage.getItem(KEY)||"auto"}catch(e){return"auto"}};
export const setLangPref=v=>{try{localStorage.setItem(KEY,v)}catch(e){}};
const p=langPref();
export const LANG=p==="ja"||p==="en"?p:/^ja\b/i.test((navigator.languages&&navigator.languages[0])||navigator.language||"ja")?"ja":"en";

const EN={
  // sidebar, toolbar
  "未接続":"Not connected","設定":"Settings","フォルダ":"Folders","タグ":"Tags","メニュー":"Menu","検索":"Search",
  "種類":"Type","すべての種類":"All types","並べ替え":"Sort","追加日（新しい順）":"Date added (newest)","追加日（古い順）":"Date added (oldest)",
  "名前":"Name","ランダム":"Random","シャッフル":"Shuffle","レイアウト":"Layout","グリッド":"Grid","ウォーターフォール":"Waterfall","列数":"Columns",
  "選択":"Select","完了":"Done","＋ 追加":"＋ Add","件選択":"selected","お気に入り":"Favorites","タグを追加":"Add tag","移動":"Move",
  "ゴミ箱へ":"Move to Trash","ゴミ箱から削除":"Delete from Trash","元に戻す":"Restore","すべて選択":"Select all","解除":"Deselect",
  "すべて":"All","ゴミ箱":"Trash","プレビュー":"Preview",
  "保存中":"Saving","未保存":"Not saved","読み込み中":"Loading",
  // viewer
  "閉じる":"Close","読み込み直す":"Reload","縮小":"Zoom out","全体表示":"Fit","拡大":"Zoom in","前のページ":"Previous page","次のページ":"Next page",
  "背景":"Background","テーマ":"Theme","ぼかし":"Blur","暗く":"Dark","前へ":"Previous","次へ":"Next","テキスト":"Text","動画":"Video","画像":"Image",
  "＋ タグ":"＋ Tag","タグを外す":"Remove tag","編集中":"Editing","保存しました":"Saved","保存しました（このデモ内のみ）":"Saved (this demo only)",
  "保存できませんでした":"Couldn't save","他の端末で更新されたため保存していません":"Not saved: updated on another device",
  "Shift_JIS・閲覧のみ":"Shift_JIS · read-only","2MBを超えるため閲覧のみ":"Read-only (over 2 MB)",
  "プレビューできない形式です":"This format can't be previewed","この動画形式はブラウザで再生できません":"This browser can't play this video format",
  "読み込めませんでした":"Couldn't load","サムネイルを表示しています":"Showing thumbnail","ゴミ箱へ移動しました":"Moved to Trash",
  // grid, dialogs
  "Dropboxに接続":"Connect Dropbox","ゴミ箱は空です":"Trash is empty","該当する資料はありません":"No matching items",
  "タグを編集":"Edit tag","削除":"Delete","保存":"Save","追加":"Add","キャンセル":"Cancel","タグ名":"Tag name",
  "「{t}」に変更しました":"Renamed to \"{t}\"","「{t}」を削除":"Delete \"{t}\"","{n} 件から外します。":"Removes it from {n|item}.",
  "「{t}」を削除しました":"Deleted \"{t}\"","「{t}」を追加しました":"Added \"{t}\"",
  "お気に入りに追加しました":"Added to Favorites","お気に入りを解除しました":"Removed from Favorites",
  "{n} 件をゴミ箱から削除":"Delete {n|item} from Trash","Dropboxでは「削除済みファイル」から一定期間復元できます。":"Dropbox keeps them in \"Deleted files\" for a limited time.",
  "削除しました":"Deleted","{n} 件をゴミ箱へ移動しました":"Moved {n|item} to Trash","{n} 件を元に戻しました":"Restored {n|item}",
  "{n} 件を {f} へ移動しました":"Moved {n|item} to {f}",
  "ファイル（画像・動画・テキスト）":"File (image, video, text)","Eagleライブラリ（.library フォルダ）":"Eagle library (.library folder)",
  "URLを入力してください":"Enter a URL","URLを追加しました":"URL added",
  "{n} 件を追加しました":"Added {n|item}","（{n} 件はアップロードできませんでした）":" ({n|item} couldn't be uploaded)",
  "（このデモでは再読み込みで消えます）":" (removed on reload in this demo)","画像・動画・テキストファイルを選んでください":"Choose image, video or text files",
  "アップロード中 {i} / {n}":"Uploading {i} / {n}","読み込み中 {n} 件":"Loading {n}",
  "Dropboxに保存できませんでした":"Couldn't save to Dropbox","Dropboxに再接続してください":"Reconnect Dropbox","Dropboxを読み込めませんでした":"Couldn't load Dropbox",
  "Dropboxに接続できませんでした":"Couldn't connect to Dropbox",
  // settings
  "カラーテーマ":"Color theme","自動":"Auto","ライト":"Light","ダーク":"Dark","テーマを読み込む（.json）":"Load theme (.json)",
  "ビューアの背景":"Viewer background","ファイル名":"File names","表示":"Show","非表示":"Hide","切断":"Disconnect","接続":"Connect",
  "ホーム画面に追加":"Add to Home Screen","インストール":"Install","共有メニュー →「ホーム画面に追加」":"Share menu → \"Add to Home Screen\"",
  "言語":"Language","デフォルト":"Default",
  "テーマのファイルではありません":"Not a theme file","テーマを読み込みました":"Theme loaded",
  // keyboard shortcuts
  "キーボードショートカット":"Keyboard shortcuts","一覧":"List","範囲選択":"Select range","先頭 / 末尾":"First / Last","開く":"Open",
  "選択解除":"Deselect","サイドバー":"Sidebar","列数を指定 / 自動":"Set columns / Auto","グリッド / ウォーターフォール":"Grid / Waterfall",
  "ビューア":"Viewer","前 / 次":"Previous / Next","拡大 / 縮小 / 全体":"Zoom in / out / Fit","前 / 次のページ":"Previous / Next page","再生 / 停止":"Play / Pause",
};

const fill=(s,v)=>s.replace(/\{(\w+)(?:\|(\w+))?\}/g,(_,k,w)=>w?`${v[k]} ${w}${v[k]==1?"":"s"}`:v[k]);
export function L(s,v={}){return fill(LANG==="en"&&EN[s]||s,v)}

// Static markup in index.html: text, aria-label, title and placeholder.
export function translateDom(root=document.body){
  document.documentElement.lang=LANG;if(LANG==="ja")return;
  const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  for(let n;(n=w.nextNode());){const s=n.nodeValue.trim();if(s&&EN[s])n.nodeValue=n.nodeValue.replace(s,EN[s])}
  for(const a of["aria-label","title","placeholder"])root.querySelectorAll(`[${a}]`).forEach(el=>{const s=el.getAttribute(a);if(EN[s])el.setAttribute(a,EN[s])});
}
