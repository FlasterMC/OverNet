#!/bin/bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
desktop="$root/desktop"
engine="$desktop/engine"
state="$engine/.overnet-dev"
patch_args=(--ignore-space-change --ignore-whitespace)
ui_pattern='\.(mjs|js|css|ftl|html|xhtml|svg|png|jpg|webp|json)$'

export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/opt/python@3.13/libexec/bin:$PATH"
jobs="${OVERNET_JOBS:-4}"
export CARGO_BUILD_JOBS="$jobs"
unset ZEN_RELEASE

cd "$desktop"

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
  ac_add_options --disable-lto
  mk_add_options MOZ_OBJDIR=@TOPSRCDIR@/obj-overnet-dev
  mk_add_options 'export SCCACHE_CACHE_SIZE=30G'
fi
EOF

mode=ui

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

if [ "$mode" = full ]; then
  caffeinate -i nice -n 19 npx surfer build -j "$jobs"
else
  nice -n 19 npx surfer build --ui
fi
touch "$state/stamp"

if [ "${1:-}" = run ]; then
  cd "$engine"
  exec ./mach run
fi
