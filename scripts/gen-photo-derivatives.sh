#!/bin/bash
# Build the two folders that actually ship. The originals in photos/ are masters:
# they stay in the repo, they are never deployed, and nothing links to them.
#
#   photos/large/   2400px — the single source Vercel's Image Optimization API
#                            reads from. Every <img> on the site is a
#                            /_vercel/image?url=/photos/large/...&w=…&q=… request,
#                            resized and re-encoded to AVIF/WebP per device.
#   photos/static/  mixed  — the handful of images that skip the optimizer: the
#                            three CSS hero backgrounds (a stylesheet can't do
#                            responsive selection, and a query-string URL in
#                            background-image would break on localhost) and the
#                            nav logo (under the 10 KB where optimizing pays off).
#
# There used to be three hand-tuned tiers here (640/1600/2400) whose output had
# to be committed. That's what the optimizer replaced — don't add tiers back
# without a reason a per-request transform can't cover.
#
# Never upscales: images smaller than the target are re-encoded, not enlarged.
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p photos/large/bambinoPictures photos/static

# `-s formatOptions` is silently ignored unless `-s format jpeg` is passed with
# it — sips accepts the flag, exits 0, and writes the same bytes it would have
# written with no quality setting at all. Every derivative shipped at default
# quality for this reason (a 640px thumb came out at 528 KB instead of 88 KB).
# Don't drop `-s format jpeg`.
process() {
  local f="$1" target="$2" outdir="$3" quality="$4"
  local rel="${f#photos/}"
  local out="photos/$outdir/$rel"
  [ -f "$out" ] && return 0
  local w h max
  w=$(sips -g pixelWidth "$f" | awk '/pixelWidth/{print $2}')
  h=$(sips -g pixelHeight "$f" | awk '/pixelHeight/{print $2}')
  max=$(( w > h ? w : h ))
  case "$f" in
    *.jpg|*.jpeg)
      # Re-encode even when the image is already small enough: several originals
      # are modest in pixels but enormous in bytes, and copying them verbatim
      # shipped that weight straight through.
      if [ "$max" -gt "$target" ]; then
        sips -Z "$target" -s format jpeg -s formatOptions "$quality" "$f" --out "$out" >/dev/null
      else
        sips -s format jpeg -s formatOptions "$quality" "$f" --out "$out" >/dev/null
      fi
      ;;
    *)
      # PNGs keep their format — one may be relying on transparency, and changing
      # the extension would break every path that points at it.
      if [ "$max" -gt "$target" ]; then
        sips -Z "$target" "$f" --out "$out" >/dev/null
      else
        cp "$f" "$out"
      fi
      ;;
  esac
}

# Optimizer source. Quality 82 because everything the visitor sees is re-encoded
# down from this — compressing twice at 75 shows.
for f in photos/*.jpg photos/*.jpeg photos/*.png photos/bambinoPictures/*.jpg photos/bambinoPictures/*.jpeg photos/bambinoPictures/*.png; do
  [ -f "$f" ] || continue
  process "$f" 2400 large 82
done

# Served as-is. "<file> <max-px>" — the heroes are full-bleed, the logo renders
# at 40px so 256 covers it well past DPR 3.
STATIC_SPECS=(
  "pizza-ooni.jpg 1920"
  "menu-board.jpg 1920"
  "house-sign.jpg 1920"
  "peterspizzerialogo.jpg 256"
)
for spec in "${STATIC_SPECS[@]}"; do
  set -- $spec
  [ -f "photos/$1" ] || { echo "warning: photos/$1 is referenced as a static image but is missing" >&2; continue; }
  process "photos/$1" "$2" static 80
done

node scripts/gen-photo-dims.mjs

echo "--- sizes ---"
du -sh photos photos/large photos/static
echo "--- counts ---"
find photos/large photos/static -type f | wc -l
