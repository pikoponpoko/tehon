# Tehon

Dropbox（Apps/Tehon フォルダ）を保存先にした資料管理アプリ。

## 開発

```
npm install
npm run dev          # http://localhost:5173
npm run build        # dist/ （Cloudflare Pages の出力先）
npm run build:demo   # dist-demo/index.html（デモデータ・1ファイル）
```

## Dropbox

- App folder 型、PKCE（App secret なし）
- Redirect URI は `<公開URL>/`。ローカル開発は `http://localhost:5173/`

## Cloudflare Pages

- Build command: `npm run build`
- Build output directory: `dist`
