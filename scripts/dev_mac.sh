#!/bin/bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
desktop="$root/desktop"
engine="$desktop/engine"
state="$engine/.overwisp-dev"
patch_args=(--ignore-space-change --ignore-whitespace)
ui_pattern='\.(mjs|js|css|ftl|html|xhtml|svg|png|jpg|webp|json)$'

export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/opt/python@3.13/libexec/bin:$PATH"
jobs="${OVERWISP_JOBS:-4}"
export CARGO_BUILD_JOBS="$jobs"
unset ZEN_RELEASE

cd "$desktop"

previous_mozconfig="$(cat mozconfig 2>/dev/null || true)"
cat > mozconfig <<'EOF'
if test -z "$ZEN_RELEASE"; then
  ac_add_options --with-macos-sdk=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk
  ac_add_options --enable-bootstrap
  ac_add_options --with-ccache=sccache
  ac_add_options --enable-optimize
  ac_add_options --disable-debug
  ac_add_options --disable-debug-symbols
  ac_add_options --disable-tests
  ac_add_options --disable-crashreporter
  ac_add_options --disable-updater
  ac_add_options --disable-lto
  mk_add_options MOZ_OBJDIR=@TOPSRCDIR@/obj-overwisp-dev
  mk_add_options 'export SCCACHE_CACHE_SIZE=30G'
fi
EOF

mode=ui
[ "$previous_mozconfig" = "$(cat mozconfig)" ] || mode=full

if [ ! -f "$state/stamp" ]; then
  git -C "$engine" reset -q --hard
  git -C "$engine" clean -fdq
  npm run import
  rm -rf "$state"
  mkdir -p "$state"
  (cd src && find . -name '*.patch' -exec rsync -R {} "$state/patches/" \;)
  mode=full
else
  while IFS= read -r patch; do
    old="$state/patches/$patch"
    cmp -s "src/$patch" "$old" && continue
    [ -f "$old" ] && git -C "$engine" apply -R "${patch_args[@]}" "$old"
    git -C "$engine" apply "${patch_args[@]}" "$desktop/src/$patch"
    mkdir -p "$(dirname "$old")"
    cp "src/$patch" "$old"
    [[ "${patch%.patch}" =~ -(mjs|js|css|xhtml|html|ftl)$ ]] || mode=full
  done < <(cd src && find . -name '*.patch' | sed 's|^\./||')

  while IFS= read -r patch; do
    [ -f "src/$patch" ] && continue
    git -C "$engine" apply -R "${patch_args[@]}" "$state/patches/$patch"
    rm "$state/patches/$patch"
    mode=full
  done < <(cd "$state/patches" && find . -name '*.patch' | sed 's|^\./||')

  while IFS= read -r file; do
    if [ ! -L "$engine/$file" ]; then
      rm -f "$engine/$file"
      mkdir -p "$(dirname "$engine/$file")"
      ln -s "$desktop/src/$file" "$engine/$file"
      mode=full
    elif [ "$desktop/src/$file" -nt "$state/stamp" ] && ! [[ "$file" =~ $ui_pattern ]]; then
      mode=full
    fi
  done < <(cd src && find . -type f ! -name '*.patch' | sed 's|^\./||')

  if [ -n "$(find prefs -newer "$state/stamp" -type f)" ]; then
    npm run ffprefs
    mode=full
  fi
fi
(cd src && find . -name '*.patch' | wc -l | tr -d ' ') > .surfer/patchCount

l10n_commit="$(cat build/firefox-cache/l10n-last-commit-hash)"
l10n_cache="$HOME/Library/Caches/overwisp-firefox-l10n"
if [ "$(git -C "$l10n_cache" rev-parse HEAD 2>/dev/null)" != "$l10n_commit" ]; then
  rm -rf "$l10n_cache"
  git clone -q --filter=blob:none --sparse --no-checkout https://github.com/mozilla-l10n/firefox-l10n "$l10n_cache"
  git -C "$l10n_cache" sparse-checkout set ru
  git -C "$l10n_cache" checkout -q "$l10n_commit"
fi
bash "$root/scripts/branding_prefs.sh" > /dev/null
python3 scripts/copy_language_pack.py en-US > /dev/null
rsync -a --delete "$l10n_cache/ru/" "$engine/browser/locales/ru/"
rsync -a locales/ru/ "$engine/browser/locales/ru/"

if [ "$mode" = full ]; then
  caffeinate -i nice -n 19 npx surfer build -j "$jobs"
else
  nice -n 19 npx surfer build --ui
fi
(cd "$engine" && MOZ_CHROME_MULTILOCALE=ru nice -n 19 ./mach build chrome-ru)
echo "ru,en-US" > "$engine/obj-overwisp-dev/toolkit/locales/multilocale.txt"
(cd "$engine/obj-overwisp-dev/dist/bin" && rsync -aR chrome.manifest chrome/ru.manifest chrome/ru localization/ru browser/chrome.manifest browser/chrome/ru.manifest browser/chrome/ru browser/chrome/browser/locale/ru browser/localization/ru ../Overwisp.app/Contents/Resources/)
mkdir -p "$engine/obj-overwisp-dev/tmp/profile-default"
printf 'user_pref("security.sandbox.content.mac.testing_read_path1", "%s");\n' "$desktop/src" > "$engine/obj-overwisp-dev/tmp/profile-default/user.js"
touch "$state/stamp"

if [ "${1:-}" = run ]; then
  cd "$engine"
  exec ./mach run
fi
