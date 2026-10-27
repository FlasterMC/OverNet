# OverNet Agent Rules

Answer the user in Russian; write code and identifiers in English.

## What this is

- **OverNet** is a test version of a web browser of the OverClouds family, based on Zen Browser (Firefox/Gecko). Style of Arc and Vivaldi: a vertical sidebar with tabs, pinned tabs, workspaces and groups that fold like folders.
- The repository is public. Never add personal data: no emails, private hostnames, server addresses, keys or details of other projects of the owner.
- Platform: macOS. Windows and Android are not started.
- Sync is not part of this version.

## Code Rules

- No comments and no explanatory text in our code: not in source files, scripts, styles, workflows or configs. Names must explain the code. Upstream files (Firefox, Zen) keep their own license headers and comments untouched.
- User-visible strings in Russian and English; no hardcoded text outside the localization files.
- No AI attribution anywhere: not in code, commits, PRs or docs.
- No secrets in the repository: keys and tokens live in GitHub Actions secrets or outside the repository.
- Prefer upstream mechanisms over new code; every engine change is a small, isolated patch so engine updates stay cheap.

## Russian Sites

- Russian banks and government sites must open without warnings and without the user installing any certificate.
- Mechanism: the root and intermediate certificates of the Russian Trusted CA ship inside the browser NSS built-in store, constrained to Russian domains only (`.ru`, `.рф`, `.su` and other Russian TLDs) through NSS name constraints, with the matching Certificate Transparency exemption. The system keychain is never touched. Not implemented yet.

## Video Translation

- Voice-over translation of videos like in Yandex Browser: first on top of the open `vot.js` project (check its license before shipping), later an optional local mode (whisper.cpp, translation, speech synthesis). Not implemented yet.

## Repository

- `desktop/` - `git subtree` of `zen-browser/desktop` (branch `dev`); upstream updates: `git subtree pull --prefix desktop https://github.com/zen-browser/desktop.git dev --squash`. Our changes there stay minimal: branding in `surfer.json`, `configs/common/mozconfig`, `configs/branding/*`, `build/signing/public_key.der` and small `.patch` files in `src/`.
- Icon source: `desktop/configs/branding/overnet.svg`; `node scripts/overnet_branding.mjs` (inside `desktop/`) regenerates every branding image.
- `.github/workflows/macos.yml` - the release build.
- `scripts/release_mac.sh <version>` - the same build on a local Mac, output in `dist/<version>/`.

## Build and Release

- Releases are built in GitHub Actions, never on the owner's Mac unless asked: run the workflow `macOS` with the version (`gh workflow run macos.yml -f version=0.1.1`). It cross-compiles Apple Silicon on Linux, takes several hours, and publishes the GitHub release `<version>` with `OverNet-<version>.dmg` and `macos.mar`, then pushes the update manifest to the branch `updates`.
- Auto-updates: the built-in Firefox updater reads `https://raw.githubusercontent.com/FlasterMC/OverNet/updates/updates/browser/<target>/<channel>/update.xml` and installs `macos.mar` only if it is signed with the OverNet MAR key. The public certificate is `desktop/build/signing/public_key.der`; the private key is the secret `OVERNET_MAR_KEY` and is never committed.
- A local build runs on the owner's working Mac: `nice -n 19` and 4 jobs by default (`OVERNET_JOBS`), always `run_in_background`; never raise the job count without asking. Tools: Command Line Tools with the macOS 26.5 SDK, Rust, Node 22 (`/opt/homebrew/opt/node@22/bin`), Python 3.13 (`/opt/homebrew/opt/python@3.13/libexec/bin`); newer Node and Python break the build.
- The app is not signed with an Apple Developer ID: on first launch macOS asks to allow it in Privacy & Security.
- Never commit build output (`engine/`, `obj-*`, `dist/`).

## Git

- Repository `FlasterMC/OverNet`, author email is the GitHub noreply address.
- Commit only when the user explicitly asks; then `git add .`, commit, `git push`.
- Message: one short plain sentence in Russian, no prefixes.
