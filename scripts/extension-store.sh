#!/bin/sh
# Builds the Chrome Web Store / Edge Add-ons package: dist-extension/tehon-store.zip.
# The store assigns its own extension ID, so the manifest "key" (which pins the ID for unpacked installs) is removed,
# and recording streamed videos is turned off.
set -e
cd "$(dirname "$0")/.."
rm -rf dist-extension && mkdir -p dist-extension/tehon
cp -R extension/. dist-extension/tehon/
node -e '
const fs = require("fs"), p = "dist-extension/tehon/manifest.json";
const m = JSON.parse(fs.readFileSync(p, "utf8"));
delete m.key;
fs.writeFileSync(p, JSON.stringify(m, null, 2) + "\n");
'
sed -i.bak 's/export const RECORD = true;/export const RECORD = false;/' dist-extension/tehon/features.js && rm dist-extension/tehon/features.js.bak
(cd dist-extension/tehon && zip -qr ../tehon-store.zip .)
echo dist-extension/tehon-store.zip
