# Overwisp Agent Rules

Answer the user in Russian; write code and identifiers in English.

## What this is

- **Overwisp** is a test version of a web browser of the OverClouds family, based on Zen Browser (Firefox/Gecko). Style of Arc and Vivaldi: a vertical sidebar with tabs, pinned tabs, workspaces and groups that fold like folders.
- The repository is public. Never add personal data: no emails, private hostnames, server addresses, keys or details of other projects of the owner.
- Platforms: macOS (Apple Silicon and Intel), Windows x64, Linux x64. Android is not started.
- Sync is not part of this version.

## Code Rules

- No comments and no explanatory text in our code: not in source files, scripts, styles, workflows or configs. Names must explain the code. Upstream files (Firefox, Zen) keep their own license headers and comments untouched.
- User-visible strings in Russian and English; no hardcoded text outside the localization files.
- No AI attribution anywhere: not in code, commits, PRs or docs.
- No secrets in the repository: keys and tokens live in GitHub Actions secrets or outside the repository.
- Prefer upstream mechanisms over new code; every engine change is a small, isolated patch so engine updates stay cheap.

## Russian Sites

- Russian banks and government sites must open without warnings and without the user installing any certificate.
- The owner rejected trusting the Russian Trusted CA (Минцифры) itself. Mechanism instead: the browser trusts only exact leaf certificates of listed sites. `scripts/russian-sites.json` lists the sites; the workflow `russian-sites.yml` collects their current certificates from GitHub runners outside Russia every 4 hours into `russian-sites.json` on the branch `updates`.
- `ZenRussianSites.sys.mjs` downloads that list and writes the SHA-256 fingerprints of enabled sites into `zen.russian-sites.trusted-certificates`; the engine patch `SSLServerCertVerification-cpp.patch` accepts an `SEC_ERROR_UNKNOWN_ISSUER` certificate only if it is in that set, valid now, matches the host and the host is in `.ru`, `.su` or `.рф`.
- Settings → Privacy → «Российские сайты»: the user turns listed sites off and adds or removes own sites (the certificate the site shows at that moment is pinned).

## Video Translation

- Voice-over translation of videos like in Yandex Browser: `ZenVideoTranslation.sys.mjs` installs the official Mozilla-signed VOT extension (`vot-ext@firefox`, MIT, `ilyhalight/voice-over-translation`) from its GitHub release once per profile and grants its host permissions; the extension updates itself. Later: an optional local mode (whisper.cpp, translation, speech synthesis).

## Repository

- `desktop/` - `git subtree` of `zen-browser/desktop` (branch `dev`); upstream updates: `git subtree pull --prefix desktop https://github.com/zen-browser/desktop.git dev --squash`. Our changes there stay minimal: branding in `surfer.json`, `configs/common/mozconfig`, `configs/branding/*`, `build/signing/public_key.der` and small `.patch` files in `src/`.
- Icon source: `desktop/configs/branding/overwisp.svg`; `node scripts/overwisp_branding.mjs` (inside `desktop/`) regenerates every branding image.
- The script also writes the Windows installer branding: `wizWatermark.bmp`, `wizHeader*.bmp`, `src/toolkit/mozapps/installer/windows/nsis/setup.ico` and `src/other-licenses/7zstub/firefox/7zSD.Win32.sfx` (the installer stub with our icons and version info instead of Firefox's).
- The Windows installer is bilingual: `preprocess-locale-py.patch` generates `ruLocale` from the Firefox l10n `ru` installer strings, `installer-nsi.patch` and `uninstaller-nsi.patch` load it and pick Russian when the Windows UI language is Russian.
- macOS DMG: the script draws `background.png` (1440x880 at 144 dpi: arrow and label plate at y=170 pt) and copies `firefox.icns` to `disk.icns`. `dsstore` is the Finder layout of the volume `Overwisp` (720x440 window, `Overwisp.app` at 190,170, the Applications symlink `" "` at 530,170, background alias to `.background/background.png`); it was written with the Python packages `ds_store` and `mac_alias` on a temporary HFS+ volume named `Overwisp`, regenerate it the same way when the layout or the volume name changes.
- `-moz-window-dragging: drag` swallows clicks on Windows: every clickable element inside a drag area needs `-moz-window-dragging: no-drag`.
- `.github/workflows/macos.yml` - the release build.
- `scripts/release_mac.sh <version>` - the same build on a local Mac, output in `dist/<version>/`.

## Build and Release

- Releases are built in GitHub Actions, never on the owner's Mac unless asked: run `macos.yml`, `windows.yml` and `linux.yml` with the same version (`gh workflow run macos.yml -f version=0.3.0`). They take several hours and add their files to the one GitHub release `<version>` (`scripts/publish_release.sh`), then push their update manifests to the branch `updates` (`scripts/publish_updates.sh`).
- `macos.yml` cross-compiles on Linux for both `aarch64` (`Overwisp-<version>.dmg`, `macos.mar`) and `x86_64` (`Overwisp-<version>-Intel.dmg`, `macos-x64.mar`). Surfer writes every `Darwin_*` manifest for a universal `macos.mar`, so each job keeps only its own targets and points them at its own MAR. `windows.yml` gives `Overwisp-Setup-<version>.exe`, a zip and `windows.mar`; `linux.yml` gives `Overwisp-<version>-linux-x86_64.tar.xz` and `linux.mar`.
- Auto-updates: the built-in Firefox updater reads `https://raw.githubusercontent.com/FlasterMC/Overwisp/updates/updates/browser/<target>/<channel>/update.xml` and installs the platform MAR only if it is signed with the Overwisp MAR key. The public certificate is `desktop/build/signing/public_key.der`; the private key is the secret `OVERNET_MAR_KEY` and is never committed.
- A local build runs on the owner's working Mac: `nice -n 19` and 4 jobs by default (`OVERWISP_JOBS`), always `run_in_background`; never raise the job count without asking. Tools: Command Line Tools with the macOS 26.5 SDK, Rust, Node 22 (`/opt/homebrew/opt/node@22/bin`), Python 3.13 (`/opt/homebrew/opt/python@3.13/libexec/bin`); newer Node and Python break the build.
- The app is not signed with an Apple Developer ID: on first launch macOS asks to allow it in Privacy & Security.
- Never commit build output (`engine/`, `obj-*`, `dist/`).

## Git

- Repository `FlasterMC/Overwisp`, author email is the GitHub noreply address.
- Commit only when the user explicitly asks; then `git add .`, commit, `git push`.
- Message: one short plain sentence in Russian, no prefixes.
