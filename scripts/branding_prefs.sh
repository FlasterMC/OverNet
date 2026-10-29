#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/../desktop"
releases="https://github.com/FlasterMC/Overwisp/releases"
files=(engine/browser/branding/*/pref/firefox-branding.js)
sed -i.orig -E \
  -e "s#https://(www\.)?zen-browser\.app/(release-notes/%VERSION%/|whatsnew\?v=%VERSION%)#$releases/tag/%VERSION%#" \
  -e "s#https://(www\.)?zen-browser\.app/(whatsnew/|release-notes/latest/|download/)#$releases/latest#" \
  -e 's#pref\("(startup\.homepage_welcome_url(\.additional)?)", "[^"]*"\)#pref("\1", "")#' \
  -e 's#pref\("app\.update\.promptWaitTime", [0-9]+\)#pref("app.update.promptWaitTime", 0)#' \
  "${files[@]}"
rm -f engine/browser/branding/*/pref/firefox-branding.js.orig
! grep -E "zen-browser\.app/(release-notes|whatsnew|download|welcome|privacy-policy)" "${files[@]}"
grep -q 'pref("app.update.promptWaitTime", 0)' engine/browser/branding/release/pref/firefox-branding.js
