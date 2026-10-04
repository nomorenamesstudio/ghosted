#!/usr/bin/env bash
# Re-encode the landing's captures as WebP, next to the JPEGs.
#
# The JPEGs stay the source of truth (and the fallback the <picture> element
# serves to anything that cannot read WebP); this only adds a sibling. Run it
# after regenerating the captures, then commit both files.
#
#   ./scripts/optimize-landing-views.sh
#
# Quality 78 with method 6 is the point where the UI screenshots stop getting
# meaningfully smaller: measured on board-light.jpg, quality 78 is ~half the
# JPEG's bytes, and 85 only buys back a few kilobytes for a third more weight.
set -euo pipefail

cd "$(dirname "$0")/.."
command -v magick >/dev/null || {
  echo "ImageMagick (magick) is required" >&2
  exit 1
}

before=0
after=0
for jpg in public/landing-views/*.jpg; do
  webp="${jpg%.jpg}.webp"
  if [ -f "$webp" ] && [ "$webp" -nt "$jpg" ]; then
    echo "up to date: $webp"
  else
    magick "$jpg" -quality 78 -define webp:method=6 "$webp"
    echo "encoded:    $webp"
  fi
  before=$((before + $(stat -c%s "$jpg")))
  after=$((after + $(stat -c%s "$webp")))
done

printf 'JPEG total: %s KB\nWebP total: %s KB\n' \
  "$((before / 1024))" "$((after / 1024))"
