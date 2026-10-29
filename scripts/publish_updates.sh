#!/bin/bash
set -euo pipefail

message="$1"
site="$RUNNER_TEMP/updates"

for attempt in 1 2 3 4 5; do
  rm -rf "$site"
  git worktree prune
  if git ls-remote --exit-code origin updates > /dev/null; then
    git fetch -q origin updates
    git worktree add -q --detach "$site" origin/updates
  else
    git worktree add -q --detach "$site"
    git -C "$site" checkout -q --orphan updates
    git -C "$site" rm -rfq .
  fi
  mkdir -p "$site/updates"
  cp -R dist/update/. "$site/updates/"
  git -C "$site" add -A
  git -C "$site" diff --cached --quiet && exit 0
  git -C "$site" commit -qm "$message"
  git -C "$site" push -q origin HEAD:updates && exit 0
  sleep $((attempt * 10))
done
exit 1
