#!/usr/bin/env bash
set -euo pipefail
extension_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
repo_dir=$(cd "$extension_dir/.." && pwd)
icon_tmp=$(mktemp -d)
trap 'rm -rf "$icon_tmp"' EXIT
surface=$(node --input-type=module - "$repo_dir/design/palette.css" <<'NODE'
import {readFileSync} from 'node:fs';
const css = readFileSync(process.argv[2], 'utf8');
const match = css.match(/--color-surface:\s*([^;]+);/);
if (!match) throw new Error('Palette surface token is missing.');
console.log(match[1].trim());
NODE
)
for size in 16 32 48 128; do
  if (( size <= 32 )); then margin=$(( size / 8 )); else margin=$(( size / 6 )); fi
  mark_size=$(( size - 2 * margin ))
  radius=$(( size / 5 ))
  last=$(( size - 1 ))
  magick -size "${size}x${size}" xc:none -fill "$surface" \
    -draw "roundrectangle 0,0,$last,$last,$radius,$radius" \
    \( "$repo_dir/landing/public/brev_icona.webp" -shave 24x24 -trim +repage -resize "${mark_size}x${mark_size}" \) \
    -gravity center -compose over -composite -strip \
    -define png:exclude-chunk=date,time "PNG32:$icon_tmp/icon$size.png"
  if [[ "${1:-}" == '--check' ]]; then
    if ! cmp -s "$icon_tmp/icon$size.png" "$extension_dir/icons/icon$size.png"; then
      echo "Icon check failed: icon$size.png differs. Run bash chrome-extension/scripts/build-icons.sh." >&2
      exit 1
    fi
  else
    cp "$icon_tmp/icon$size.png" "$extension_dir/icons/icon$size.png"
  fi
done
if [[ "${1:-}" == '--check' ]]; then echo 'Icon check passed (16, 32, 48, 128).'; else echo 'Generated icons (16, 32, 48, 128).'; fi
