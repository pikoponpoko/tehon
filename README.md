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
     - `http://localhost:47615/`（デスクトップ版）
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

## デスクトップ版（Windows）

`desktop/` の Electron アプリ。ブラウザ版のビルド（`dist`）を `http://localhost:47615/` で配信して表示します。Dropbox のサインインは既定のブラウザで行い、このアドレスに戻ってきます。

- `desktop/package.json` の `version` を上げて main に push すると、GitHub Actions（`.github/workflows/desktop.yml`）がインストーラーを作り Release `v<version>` として公開します。それ以外の push ではビルドのみ（Actions の Artifacts に exe）
- インストーラーは同じ appId で上書きするため、旧バージョンは自動でアンインストールされます
- 設定の「アップデートを確認」は最新の Release と比べ、新しければダウンロードページへのリンクを出します

```sh
npm run build
cd desktop && npm install && npm start
```

## ブラウザ拡張（Chrome・Edge）

`extension/` は、開いているページの画像を選んで Tehon（Dropbox の App folder）にまとめて保存する拡張機能です。ビルドは不要です。

- 拡張のアイコン、または `Alt+Shift+S` でページ内の画像一覧を開く。クリックで選択、Shift+クリックで範囲選択、`Ctrl+A` ですべて選択、`Enter` で保存
- フォルダとタグを付けて保存。タグは拡張用の `/.tehon/devices/ext-<ID>.json` に書き、アプリ側で他の端末と同じように読み込まれる
- 画像の右クリックメニュー「Tehonに保存」で1枚だけ保存（直前に使ったフォルダとタグ）
- 「URLを保存」でページをブックマークとして追加
- Pinterest と X の画像は原寸版を保存
- すべてのサイトへのアクセス権は `optional_host_permissions` にしてあり、初めて保存するときに一度だけ許可を求める（許可しなくても、ページ自身から取れる画像は保存できる）
- 動画も一覧に出る。ファイルとして取れる動画はそのまま保存し、Instagram のように配信形式で再生される動画は、ページ上で最初から1回再生して録画（Chrome では MP4、使えない環境では WebM）。録画は動画の長さだけ時間がかかり、その間はタブを閉じない。60MB を超える録画は保存しない

### 読み込み

1. `chrome://extensions`（Edge は `edge://extensions`）でデベロッパーモードをオン
2. 「パッケージ化されていない拡張機能を読み込む」で `extension/` フォルダを選ぶ
3. Dropbox App Console の **Redirect URIs** に `https://aabpfpgbpdpopcfckkcdhcfciihlpkji.chromiumapp.org/` を追加

拡張の ID は `manifest.json` の `key` で固定しているため、どの PC で読み込んでも上の Redirect URI のままで使えます。

### ストア版（Chrome ウェブストア・Edge アドオン）

`npm run extension:store` で `dist-extension/tehon-store.zip` を作ります。`manifest.json` の `key` を外します（ID はストアが決める）。審査で求められた場合は `NO_RECORD=1 npm run extension:store` で動画の録画（`extension/features.js` の `RECORD`）を切ったものを作れます。公開後、ストアの ID の `https://<ID>.chromiumapp.org/` を Dropbox の Redirect URIs に追加します。プライバシーポリシーは `public/privacy.html`。ストアに書く URL は `https://tehon.pikoponpoko.workers.dev/privacy`（`/privacy.html` は Workers が `/privacy` へリダイレクトする）。サービスワーカーはこのページをアプリ画面に差し替えない。

ストアの画像基準（https://developer.chrome.com/docs/webstore/images ）に沿った画像は `sh scripts/extension-icons.sh`（ffmpeg が必要）で `public/icons/icon-512.png` から書き出します。`extension/icons/128.png`（イラストを 96×96 に収め周囲 16px 透過）と、`dist-extension/` のプロモーション画像 440×280・1400×560。
