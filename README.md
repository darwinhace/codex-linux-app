# Codex Linux App

This repo repackages the published Codex desktop app for Linux, especially Ubuntu `amd64`. It reads the live OpenAI appcast feed, downloads the selected upstream build, swaps in a Linux Electron runtime, rebuilds the native modules for Linux, installs stable and beta side by side, and creates user-local desktop entries.

Current upstream feed heads checked on March 26, 2026:

- Stable: `26.324.21641` build `1228`
- Beta: `26.324.21641` build `1227`

## First Run Requirements

Install these packages on Ubuntu before the first installer run:

```bash
sudo apt update
sudo apt install -y build-essential python3 make g++ curl unzip libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 libatspi2.0-0 libdrm2 libgbm1 libasound2t64
```

Install the repo dependencies:

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

## Usage

Latest stable:

```bash
./install-desktop
```

Specific stable version from the stable feed:

```bash
./install-desktop --version 26.324.21329
```

Latest beta from the beta feed:

```bash
./install-desktop --beta
```

Specific beta version from the beta feed:

```bash
./install-desktop --beta --version 26.324.21329
```

If you ran `npm link`, the same commands work as:

```bash
install-desktop
install-desktop --version 26.324.21329
install-desktop --beta
install-desktop --beta --version 26.324.21329
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
- The build/install stages retry forever on failure and keep logs under `~/.local/state/codex-linux-app/logs`.
- The generated launcher auto-falls back to `--no-sandbox --disable-setuid-sandbox` when `chrome-sandbox` is not root-owned with mode `4755`, which is the normal case for a per-user install.
- Set `CODEX_DESKTOP_FORCE_SANDBOX=1` if you manually configured `chrome-sandbox` correctly and want the wrapper to preserve Chromium sandboxing.
- Set `CODEX_DESKTOP_FORCE_NO_SANDBOX=1` to force the no-sandbox launcher path explicitly.
- The installer preserves the upstream resource layout and replaces mac-only helper binaries with Linux equivalents where needed.
- Linux editor discovery is patched into the desktop runtime for supported IDEs. It checks CLI commands on PATH, common `.desktop` launchers, and JetBrains Toolbox scripts under `~/.local/share/JetBrains/Toolbox/scripts`.
- The current Linux editor targets include VS Code, VS Code Insiders, Cursor, Windsurf, Zed, Android Studio, IntelliJ IDEA, Rider, GoLand, RustRover, PyCharm, WebStorm, and PhpStorm.
- If a requested version is not present in the selected feed, the command prints the versions currently available from that feed.
