# Codex Linux App

This repo repackages the published Codex desktop app for Linux `amd64`/`x64` (including Ubuntu and Arch-based distros such as CachyOS). It reads the live OpenAI appcast feed, downloads the selected upstream build, swaps in a Linux Electron runtime, rebuilds the native modules for Linux, installs stable and beta side by side, and creates user-local desktop entries.

Current upstream feed heads checked on April 19, 2026:

- Stable: `26.415.32059` build `1789`
- Beta: `26.415.40636` build `1798`

## First Run Requirements

Before using this project, run `npm install` in the repository root.

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

`npm install` is required before running `install-desktop`, `release-info`, or `uninstall-desktop`.

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

All commands below assume you already ran `npm install` in this repository.

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

Install without the Linux todo progress patch:

```bash
./install-desktop --skip-todo-progress-patch
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
install-desktop --skip-todo-progress-patch
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

## Environment Variables

Use this section as the single source of truth for env vars used by this project.

| Variable | Where Used | Default | Effect |
| --- | --- | --- | --- |
| `CODEX_CLI_PATH` | Installer + launcher | Auto-detect from `PATH` (installer), bundled wrapper fallback (launcher) | Overrides which `codex` binary is used. |
| `RG_PATH` | Installer | Auto-detect from `PATH` | Overrides which `rg` binary is used during install. |
| `CODEX_DESKTOP_FORCE_SANDBOX` | Launcher | unset / `0` | Force Chromium sandbox mode (`1`). |
| `CODEX_DESKTOP_FORCE_NO_SANDBOX` | Launcher | unset / `0` | Force `--no-sandbox --disable-setuid-sandbox` (`1`). |
| `CODEX_DESKTOP_DISABLE_GPU` | Launcher | unset / `0` | Adds `--disable-gpu` (`1`). |
| `CODEX_DESKTOP_OZONE_PLATFORM_HINT` | Launcher | unset | Passes `--ozone-platform=x11`, `wayland`, or `auto`. |
| `CODEX_DESKTOP_DISABLE_LINUX_AUTO_HIDE_MENU_BAR` | Patched app main bundle (Linux) | unset | Keeps native menu bar always visible when set to `1` (default behavior auto-hides it). |
| `CODEX_DESKTOP_DISABLE_LINUX_CLOSE_CANCEL_PATCH` | Patched app main bundle (Linux) | unset | Disables the Linux close-cancel window restoration patch when set to `1`. |
| `CODEX_DESKTOP_DISABLE_LINUX_VISUAL_COMPAT` | Patched app renderer bundle (Linux) | unset | Disables Linux visual-compat patch when set to `1`. |
| `CODEX_DESKTOP_DISABLE_LINUX_TODO_PROGRESS_PATCH` | Patched app renderer bundle (Linux) | unset | Disables Linux todo progress patch when set to `1`. |
| `CODEX_DESKTOP_DISABLE_LINUX_BROWSER_COMMENT_POSITION_PATCH` | Patched app renderer bundle (Linux) | unset | Disables Linux browser comment popup positioning correction when set to `1`. |
| `CODEX_DESKTOP_ENABLE_CHROMIUM_LOGGING` | Launcher | unset / `0` | Enables Chromium logging when set to `1`. |
| `CODEX_DESKTOP_TRACE_TERMINAL_PATCH` | Patched app renderer bundle (Linux) | unset | Enables terminal patch trace warnings when set to `1`. |
| `CODEX_DESKTOP_INSTALL_MANIFEST` | Launcher (internal) | Auto-set by launcher | Path to install diagnostic manifest. Do not set manually. |

## Notes

- The installer only supports Linux `amd64` in this version.
- The installer uses the live appcast at runtime, so plain `install-desktop` always tracks the newest stable release from the stable feed.
- `install-desktop --beta` always tracks the newest beta release from the beta feed.
- Binary discovery is done with direct PATH scanning in Node (not external `which`), so Fish/Arch setups work as long as PATH or the `CODEX_CLI_PATH`/`RG_PATH` overrides are correct.
- For all runtime and installer env vars, see the **Environment Variables** section above.
- The build/install stages retry forever on failure and keep logs under `~/.local/state/codex-linux-app/logs`.
- The installer always writes a per-channel diagnostic manifest with upstream version/build info, Electron runtime info, native module versions, and patch state (including `compactSlashCommand`).
- The fresh-thread model patch is required. If upstream bundle anchors drift and the patch cannot be applied, install aborts with an explicit `newThreadModel` patch error.
- Compact slash command support (`/compact`) is required. If compatibility anchors are missing, install aborts with an explicit compact slash command verification error.
- If a new upstream renderer build changes the Linux visual-compat renderer bundle shape, the installer skips that patch with a warning instead of aborting the install.
- The generated launcher auto-falls back to `--no-sandbox --disable-setuid-sandbox` when `chrome-sandbox` is not root-owned with mode `4755`, which is the normal case for a per-user install.
- If a reinstall opens to a black spinner window, reinstall once with `./install-desktop --skip-terminal-patch` to bypass the renderer terminal patch while debugging.
- On Linux, canceling the quit confirmation restores or recreates the main window so the app stays visible instead of remaining only as a background task.
- The installer preserves the upstream resource layout and replaces mac-only helper binaries with Linux equivalents where needed.
- Linux editor discovery is patched into the desktop runtime for supported IDEs. It checks CLI commands on PATH, common `.desktop` launchers, and JetBrains Toolbox scripts under `~/.local/share/JetBrains/Toolbox/scripts`.
- The current Linux editor targets include VS Code, VS Code Insiders, Cursor, Windsurf, Zed, Android Studio, IntelliJ IDEA, Rider, GoLand, RustRover, PyCharm, WebStorm, and PhpStorm.
- The launcher writes resolved runtime mode details, including sandbox mode, GPU mode, ozone hint, manifest path, and patch summary, to `~/.local/state/codex-linux-app/logs/runtime-launch-<channel>.log`.
- If a requested version is not present in the selected feed, the command prints the versions currently available from that feed.
