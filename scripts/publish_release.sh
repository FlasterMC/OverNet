#!/bin/bash
set -euo pipefail

version="$1"
shift

if [ -z "${NOTES:-}" ]; then
  previous="$(git describe --tags --abbrev=0 2>/dev/null || true)"
  NOTES="$(git log --no-merges --format='- %s' ${previous:+$previous..}HEAD | grep -v '^- Squashed ' | head -50 || true)"
fi

for attempt in 1 2 3 4 5; do
  if gh release view "$version" > /dev/null 2>&1; then
    gh release upload "$version" "$@" --clobber && exit 0
  elif gh release create "$version" "$@" --title "Overwisp $version" --notes "${NOTES:-Overwisp $version}" --target "$GITHUB_SHA"; then
    exit 0
  fi
  sleep $((attempt * 10))
done
exit 1
