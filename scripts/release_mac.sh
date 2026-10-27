#!/bin/bash
set -euo pipefail

version="${1:?usage: release_mac.sh <version>}"
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/dist/$version"

export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/opt/python@3.13/libexec/bin:$PATH"
export ZEN_RELEASE=1
export ZEN_GA_DISABLE_PGO=1
export ZEN_DISABLE_LTO="${ZEN_DISABLE_LTO-1}"
jobs="${OVERNET_JOBS:-4}"
export CARGO_BUILD_JOBS="$jobs"

cd "$root/desktop"
npx surfer ci --brand release --display-version "$version"
nice -n 19 npx surfer build -j "$jobs"
nice -n 19 npx surfer package

mkdir -p "$out"
cp "$(ls -t dist/*.dmg | head -1)" "$out/OverNet-$version.dmg"
echo "$out"
