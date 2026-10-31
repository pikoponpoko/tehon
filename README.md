# Tehon

Dropbox を保存先にするリファレンス管理アプリ（ブラウザ版）。

- Vite + TypeScript の静的サイト。サーバーなしでブラウザから Dropbox API に直接接続します。
- Dropbox は App folder 型・OAuth 2 PKCE（App key のみ、シークレットなし）。
- タグ・お気に入り・URL などの管理データは Dropbox の `/.tehon/devices/<端末ID>.json` に保存し、原本ファイルは変更しません。例外は txt・md の編集で、読み込んだ後に他の端末で更新されていた場合は上書きせずに知らせます（Shift_JIS と 2MB 超は閲覧のみ）。端末ごとに別ファイルなので同時編集でも競合しません。
- 未接続時はデモデータで動きます。

## 開発

```sh
npm install
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
     - `https://tehon.<アカウントのサブドメイン>.workers.dev/`（Cloudflare の公開 URL）
     - `http://localhost:5173/`
   - **Allow public clients (Implicit Grant & PKCE)** が `Allow` になっていることを確認
   - App key（`x7ap0g0pau1irkc`）は `src/config.ts` に記載済み。App secret は使いません

接続すると Dropbox の `アプリ/Tehon/` フォルダがライブラリになります。

開発中のアプリは登録者本人のアカウントでそのまま使えます。他の人にも使ってもらう場合は **Development users** の上限（**Enable additional users** で500人まで）か、本番申請が必要です。

## Cloudflare Workers（tehon）

リポジトリに接続した Worker `tehon` が、push ごとに `npx wrangler deploy` で静的サイトとして公開します（設定は `wrangler.toml`。ビルドは `npm run build` が自動で走ります）。

1. Eagle 読み込みを試す場合は **Workers & Pages** → `tehon` → **Settings** → **Build** → **Variables and secrets** に `VITE_EAGLE_IMPORT` = `1`
2. 公開 URL（`https://tehon.<アカウントのサブドメイン>.workers.dev/`）を Dropbox の Redirect URIs にも追加

ブランチごとのプレビュー URL でも画面は確認できますが、Dropbox 接続は Redirect URI に登録した URL でのみ動きます。

手元からデプロイする場合は `npx wrangler login` のあと `npx wrangler deploy`。

セキュリティヘッダー（CSP など）は `public/_headers` にあります。

## ブラウザ拡張（Chrome・Edge）

`extension/` は、開いているページの画像を選んで Tehon（Dropbox の App folder）にまとめて保存する拡張機能です。ビルドは不要です。

- 拡張のアイコン、または `Alt+Shift+S` でページ内の画像一覧を開く。クリックで選択、Shift+クリックで範囲選択、`Ctrl+A` ですべて選択、`Enter` で保存
- フォルダとタグを付けて保存。タグは拡張用の `/.tehon/devices/ext-<ID>.json` に書き、アプリ側で他の端末と同じように読み込まれる
- 画像の右クリックメニュー「Tehonに保存」で1枚だけ保存（直前に使ったフォルダとタグ）
- 「URLを保存」でページをブックマークとして追加
- Pinterest と X の画像は原寸版を保存
- 動画も一覧に出る。ファイルとして取れる動画はそのまま保存し、Instagram のように配信形式で再生される動画は、ページ上で最初から1回再生して録画（Chrome では MP4、使えない環境では WebM）。録画は動画の長さだけ時間がかかり、その間はタブを閉じない。60MB を超える録画は保存しない

### 読み込み

1. `chrome://extensions`（Edge は `edge://extensions`）でデベロッパーモードをオン
2. 「パッケージ化されていない拡張機能を読み込む」で `extension/` フォルダを選ぶ
3. Dropbox App Console の **Redirect URIs** に `https://aabpfpgbpdpopcfckkcdhcfciihlpkji.chromiumapp.org/` を追加

拡張の ID は `manifest.json` の `key` で固定しているため、どの PC で読み込んでも上の Redirect URI のままで使えます。
