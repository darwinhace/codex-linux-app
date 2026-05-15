# Codex Linux App

Linux installer and repackager for the upstream Codex desktop app on `amd64`/`x64`. It reads the live OpenAI appcast, downloads the selected upstream build, preserves upstream resources, swaps macOS-only helper binaries for Linux equivalents, rebuilds native modules, and installs stable and beta side by side.

## Requirements

Arch/CachyOS:

```bash
sudo pacman -S --needed base-devel python nodejs npm curl unzip ripgrep bash gtk3 libnotify nss libxss libxtst at-spi2-core libdrm mesa alsa-lib
npm install -g @openai/codex@latest
```

Ubuntu/Debian 13+:

```bash
sudo apt update
sudo apt install -y build-essential python3 make g++ nodejs npm curl unzip ripgrep bash libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 libatspi2.0-0 libdrm2 libgbm1 libasound2t64
npm install -g @openai/codex@latest
```

Debian 12:

```bash
sudo apt update
sudo apt install -y build-essential python3 make g++ nodejs npm curl unzip ripgrep bash libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 libatspi2.0-0 libdrm2 libgbm1 libasound2
npm install -g @openai/codex@latest
```

The installer auto-runs `npm install --no-audit --no-fund` for this repo when dependencies are missing, so a fresh clone can run `./install-desktop` directly.

Browser Use is a required desktop runtime. The installer installs Linux `resources/node` and `resources/node_repl`, prefers the Codex primary runtime cache when available, and fails with the exact paths it checked if a usable Linux runtime cannot be found.

Chrome Browser Use needs Google Chrome installed. On Debian systems that provide only `google-chrome-stable`, add a user-level `google-chrome` shim if Browser Use cannot find Chrome:

```bash
mkdir -p ~/.local/bin
ln -sf /usr/bin/google-chrome-stable ~/.local/bin/google-chrome
```

## Usage

Latest stable:

```bash
./install-desktop
```

Specific stable version:

```bash
./install-desktop --version 26.325.21211
```

Latest beta:

```bash
./install-desktop --beta
```

Specific beta version:

```bash
./install-desktop --beta --version 26.401.11631
```

Show installed versions and the latest appcast entries:

```bash
./release-info
```

Remove repo-owned desktop installs:

```bash
./uninstall-desktop
```

## Install Locations

- Stable: `~/.local/share/codex-linux-app/channels/stable`
- Beta: `~/.local/share/codex-linux-app/channels/beta`
- Desktop entries: `~/.local/share/applications/codex.desktop` and `~/.local/share/applications/codex-beta.desktop`
- Logs and state: `~/.local/state/codex-linux-app`
- Cache and downloads: `~/.cache/codex-linux-app`

Advanced environment variables and recovery flags are documented in [docs/advanced.md](docs/advanced.md).
