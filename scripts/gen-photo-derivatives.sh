#!/bin/bash
# Generate photos/thumbs (max 640px) and photos/web (max 1600px) derivatives.
# Never upscales: images smaller than the target are copied as-is.
set -euo pipefail
cd /Users/petermorganelli/peters-pizzeria-site

mkdir -p photos/thumbs/bambinoPictures photos/web/bambinoPictures

process() {
  local f="$1" target="$2" outdir="$3"
  local rel="${f#photos/}"
  local out="photos/$outdir/$rel"
  [ -f "$out" ] && return 0
  local w h max
  w=$(sips -g pixelWidth "$f" | awk '/pixelWidth/{print $2}')
  h=$(sips -g pixelHeight "$f" | awk '/pixelHeight/{print $2}')
  max=$(( w > h ? w : h ))
  if [ "$max" -gt "$target" ]; then
    case "$f" in
      *.jpg|*.jpeg) sips -Z "$target" -s formatOptions 75 "$f" --out "$out" >/dev/null ;;
      *)            sips -Z "$target" "$f" --out "$out" >/dev/null ;;
    esac
  else
    cp "$f" "$out"
  fi
}

for f in photos/*.jpg photos/*.jpeg photos/*.png photos/bambinoPictures/*.jpg photos/bambinoPictures/*.jpeg photos/bambinoPictures/*.png; do
  [ -f "$f" ] || continue
  process "$f" 640 thumbs
  process "$f" 1600 web
done

echo "--- sizes ---"
du -sh photos photos/thumbs photos/web
echo "--- counts ---"
find photos/thumbs photos/web -type f | wc -l
