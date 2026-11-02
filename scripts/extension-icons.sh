#!/bin/sh
# Exports the extension's store images from the app icon, following
# https://developer.chrome.com/docs/webstore/images (needs ffmpeg).
#   extension/icons/128.png         128x128, artwork fit in 96x96 with 16px transparent padding
#   extension/icons/16|32|48.png    toolbar and extensions page icons
#   dist-extension/promo-440x280.png small promo tile
#   dist-extension/promo-1400x560.png marquee
# Usage: sh scripts/extension-icons.sh [source.png]   (default desktop/icon-mac.png, the transparent artwork)
set -e
cd "$(dirname "$0")/.."
SRC=${1:-desktop/icon-mac.png}
BG=0x3772FF # --accent of the default theme
mkdir -p dist-extension
# Trim the transparent margin so the artwork itself is what gets sized.
CROP=$(ffmpeg -i "$SRC" -vf "alphaextract,bbox=min_val=8" -f null - 2>&1 | grep -o "crop=[0-9:]*" | tail -1)
fit() { echo "$CROP,scale=$1:$1:force_original_aspect_ratio=decrease:flags=lanczos"; }
ffmpeg -v error -y -i "$SRC" -filter_complex "color=c=black@0:s=128x128,format=rgba[bg];[0]$(fit 96)[a];[bg][a]overlay=(W-w)/2:(H-h)/2:format=auto" -frames:v 1 extension/icons/128.png
for n in 16 32 48; do
  ffmpeg -v error -y -i "$SRC" -filter_complex "color=c=black@0:s=${n}x${n},format=rgba[bg];[0]$(fit $n)[a];[bg][a]overlay=(W-w)/2:(H-h)/2:format=auto" -frames:v 1 extension/icons/$n.png
done
ffmpeg -v error -y -i "$SRC" -filter_complex "color=c=$BG:s=440x280[bg];[0]$(fit 180)[a];[bg][a]overlay=(W-w)/2:(H-h)/2" -frames:v 1 dist-extension/promo-440x280.png
ffmpeg -v error -y -i "$SRC" -filter_complex "color=c=$BG:s=1400x560[bg];[0]$(fit 360)[a];[bg][a]overlay=(W-w)/2:(H-h)/2" -frames:v 1 dist-extension/promo-1400x560.png
echo extension/icons/*.png dist-extension/promo-440x280.png dist-extension/promo-1400x560.png
