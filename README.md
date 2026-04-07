# Codex Linux App

This repo repackages the published Codex desktop app for Linux `amd64`/`x64` (including Ubuntu and Arch-based distros such as CachyOS). It reads the live OpenAI appcast feed, downloads the selected upstream build, swaps in a Linux Electron runtime, rebuilds the native modules for Linux, installs stable and beta side by side, and creates user-local desktop entries.

Current upstream feed heads checked on April 7, 2026:

- Stable: `26.325.31654` build `1272`
- Beta: `26.401.11717` build `1329`

## First Run Requirements

Install these distro packages before the first installer run:

| Requirement | Ubuntu/Debian | Arch/CachyOS |
| --- | --- | --- |
| Build toolchain | `build-essential python3 make g++` | `base-devel python` |
| CLI/runtime tools | `curl unzip ripgrep bash` | `curl unzip ripgrep bash` |
| Electron runtime libs | `libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 libatspi2.0-0 libdrm2 libgbm1 libasound2t64` | `gtk3 libnotify nss libxss libxtst at-spi2-core libdrm mesa alsa-lib` |

Ubuntu/Debian:

```bash
sudo apt update
sudo apt install -y build-essential python3 make g++ curl unzip ripgrep bash libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 libatspi2.0-0 libdrm2 libgbm1 libasound2t64
```

Arch/CachyOS:

```bash
sudo pacman -S --needed base-devel python curl unzip ripgrep bash gtk3 libnotify nss libxss libxtst at-spi2-core libdrm mesa alsa-lib
```

Fish shell setup (recommended on Arch/CachyOS):

```fish
# Add npm global binaries to Fish PATH once.
fish_add_path -U (npm config get prefix)/bin

# Optional but useful on node-manager setups where PATH can rotate per shell.
set -Ux CODEX_CLI_PATH (type -p codex)
set -Ux RG_PATH (type -p rg)

# Verify both required binaries are visible in Fish.
type -a codex
type -a rg
```

Install repo dependencies:

```bash
npm install
chmod +x ./install-desktop
```

Install the Linux Codex CLI that the desktop app talks to:

```bash
npm install -g @openai/codex@latest
```

Optional: link the command globally so you can run `install-desktop` without `./`:

```bash
npm link
```

Verified on April 7, 2026 on CachyOS (`ID_LIKE=arch`) with Fish `4.6.0`: `npm test` and `./release-info` both pass.

## Usage

Latest stable:

```bash
./install-desktop
```

Latest stable plus a diagnostic manifest in the install log:

```bash
./install-desktop --diagnostic-manifest
```

Inspect installed releases plus the latest 3 prod and beta appcast entries:

```bash
./release-info
```

Specific stable version from the stable feed:

```bash
./install-desktop --version 26.325.21211
```

Latest beta from the beta feed:

```bash
./install-desktop --beta
```

Specific beta version from the beta feed:

```bash
./install-desktop --beta --version 26.401.11631
```

Install without the Linux terminal lifecycle patch for A/B perf checks:

```bash
./install-desktop --skip-terminal-patch
```

Install without the Linux open-in-targets patch:

```bash
./install-desktop --skip-open-targets-patch
```

If you ran `npm link`, the same commands work as:

```bash
install-desktop
install-desktop --version 26.325.21211
install-desktop --beta
install-desktop --beta --version 26.401.11631
install-desktop --diagnostic-manifest
install-desktop --skip-terminal-patch
install-desktop --skip-open-targets-patch
release-info
```

Remove all repo-owned desktop installs created by this repo:

```bash
./uninstall-desktop
```

If you ran `npm link`:

```bash
uninstall-desktop
```

## What Gets Installed

- Stable app files: `~/.local/share/codex-linux-app/channels/stable`
- Beta app files: `~/.local/share/codex-linux-app/channels/beta`
- Diagnostic manifest:
  - `~/.local/share/codex-linux-app/channels/stable/install-diagnostic-manifest.json`
  - `~/.local/share/codex-linux-app/channels/beta/install-diagnostic-manifest.json`
- Desktop entries:
  - `~/.local/share/applications/codex.desktop`
  - `~/.local/share/applications/codex-beta.desktop`
- State and logs: `~/.local/state/codex-linux-app`
- Cache and downloaded archives: `~/.cache/codex-linux-app`

Stable and beta installs are fully separate. Reinstalling stable only replaces stable. Reinstalling beta only replaces beta.

## What Uninstall Removes

- `~/.local/share/codex-linux-app`
- `~/.local/state/codex-linux-app`
- `~/.cache/codex-linux-app`
- `~/.local/share/applications/codex.desktop`
- `~/.local/share/applications/codex-beta.desktop`

`uninstall-desktop` does not remove the separately installed global `codex` CLI.

## Notes

- The installer only supports Linux `amd64` in this version.
- The installer uses the live appcast at runtime, so plain `install-desktop` always tracks the newest stable release from the stable feed.
- `install-desktop --beta` always tracks the newest beta release from the beta feed.
- The installer requires a Linux `codex` CLI on PATH, or `CODEX_CLI_PATH` set to an existing Codex CLI binary. The installed desktop app uses a bundled wrapper at `resources/bin/codex` so the desktop runtime can find it reliably.
- The installer also requires `rg` on PATH, or `RG_PATH` set to an existing Linux ripgrep binary.
- Binary discovery is done with direct PATH scanning in Node (not external `which`), so Fish/Arch setups work as long as PATH or the `CODEX_CLI_PATH`/`RG_PATH` overrides are correct.
- The build/install stages retry forever on failure and keep logs under `~/.local/state/codex-linux-app/logs`.
- The installer always writes a per-channel diagnostic manifest with upstream version/build info, Electron runtime info, native module versions, and patch state.
- The generated launcher auto-falls back to `--no-sandbox --disable-setuid-sandbox` when `chrome-sandbox` is not root-owned with mode `4755`, which is the normal case for a per-user install.
- Set `CODEX_DESKTOP_FORCE_SANDBOX=1` if you manually configured `chrome-sandbox` correctly and want the wrapper to preserve Chromium sandboxing.
- Set `CODEX_DESKTOP_FORCE_NO_SANDBOX=1` to force the no-sandbox launcher path explicitly.
- Set `CODEX_DESKTOP_DISABLE_GPU=1` to launch with `--disable-gpu` for experimental compositor/GPU checks. Some upstream builds can fail to start when GPU access is disabled, so this is not the preferred recovery path for a black window.
- Set `CODEX_DESKTOP_OZONE_PLATFORM_HINT=x11`, `wayland`, or `auto` to pass `--ozone-platform=<value>` through the launcher.
- Set `CODEX_DESKTOP_DISABLE_LINUX_VISUAL_COMPAT=1` to disable the default Linux sidebar visual-compat patch for A/B rendering checks.
- Set `CODEX_DESKTOP_ENABLE_CHROMIUM_LOGGING=1` to enable Chromium logging and write a per-channel Chromium log under `~/.local/state/codex-linux-app/logs`.
- Set `CODEX_DESKTOP_TRACE_TERMINAL_PATCH=1` to enable low-volume terminal lifecycle trace warnings from the injected Linux terminal patch.
- If a reinstall opens to a black spinner window, reinstall once with `./install-desktop --skip-terminal-patch` to bypass the renderer terminal patch while debugging.
- The installer preserves the upstream resource layout and replaces mac-only helper binaries with Linux equivalents where needed.
- Linux editor discovery is patched into the desktop runtime for supported IDEs. It checks CLI commands on PATH, common `.desktop` launchers, and JetBrains Toolbox scripts under `~/.local/share/JetBrains/Toolbox/scripts`.
- The current Linux editor targets include VS Code, VS Code Insiders, Cursor, Windsurf, Zed, Android Studio, IntelliJ IDEA, Rider, GoLand, RustRover, PyCharm, WebStorm, and PhpStorm.
- The launcher writes resolved runtime mode details, including sandbox mode, GPU mode, ozone hint, manifest path, and patch summary, to `~/.local/state/codex-linux-app/logs/runtime-launch-<channel>.log`.
- If a requested version is not present in the selected feed, the command prints the versions currently available from that feed.
