# Tehon

Dropbox を保存先にするリファレンス管理アプリ（ブラウザ版）。

- Vite + TypeScript の静的サイト。サーバーなしでブラウザから Dropbox API に直接接続します。
- Dropbox は App folder 型・OAuth 2 PKCE（App key のみ、シークレットなし）。
- タグ・お気に入り・URL などの管理データは Dropbox の `/.tehon/devices/<端末ID>.json` に保存し、原本ファイルは変更しません（テキストも閲覧のみ）。端末ごとに別ファイルなので同時編集でも競合しません。
- 未接続時はデモデータで動きます。

## 開発

```sh
npm install
cp .env.example .env   # VITE_DROPBOX_APP_KEY を記入
npm run dev            # http://localhost:5173/
```

Eagle ライブラリ読み込み（テスト用）は `npm run dev` では常に有効、ビルドでは `VITE_EAGLE_IMPORT=1` のときだけ有効です。

## Dropbox アプリ登録

1. https://www.dropbox.com/developers/apps → **Create app**
2. **Scoped access** → **App folder** → アプリ名（例: `Tehon`）
3. **Permissions** タブで次にチェックして **Submit**
   - `files.metadata.read`
   - `files.content.read`
   - `files.content.write`
4. **Settings** タブ
   - **OAuth 2 › Redirect URIs** に次の2つを追加（末尾の `/` まで完全一致が必要）
     - `https://tehon-preview.pages.dev/`
     - `http://localhost:5173/`
   - **Allow public clients (Implicit Grant & PKCE)** が `Allow` になっていることを確認
   - **App key** を控える（App secret は使いません）

接続すると Dropbox の `アプリ/Tehon/` フォルダがライブラリになります。

開発中のアプリは登録者本人のアカウントでそのまま使えます。他の人にも使ってもらう場合は **Development users** の上限（**Enable additional users** で500人まで）か、本番申請が必要です。

## Cloudflare Pages（tehon-preview）

Git 連携で自動デプロイします。

1. Cloudflare ダッシュボード → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. リポジトリ `pikoponpoko/tehon` を選び、プロジェクト名を `tehon-preview` にする
3. ビルド設定
   - Framework preset: `None`
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Production branch: `main`
4. **Environment variables** に `VITE_DROPBOX_APP_KEY` = App key（Production と Preview の両方）。Eagle 読み込みを試す場合は `VITE_EAGLE_IMPORT` = `1`
5. **Save and Deploy**

公開 URL は `https://tehon-preview.pages.dev/`。ブランチごとのプレビュー URL（`https://<ブランチ>.tehon-preview.pages.dev/`）でも画面は確認できますが、Dropbox 接続は Redirect URI に登録した URL でのみ動きます。

手元からデプロイする場合は `npx wrangler login` のあと `VITE_DROPBOX_APP_KEY=... npm run deploy`。

セキュリティヘッダー（CSP など）は `public/_headers` にあります。
