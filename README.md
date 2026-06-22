# Codex Linux App

Linux installer and repackager for the upstream Codex desktop app on `amd64`/`x64`. It reads the live OpenAI appcast, downloads the pinned or latest stable upstream build, preserves upstream resources, swaps macOS-only helper binaries for Linux equivalents, rebuilds native modules, and installs the stable desktop app.

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

## Linux Computer Use

`./install-desktop` includes the Linux Computer Use backend. Desktop input still needs the OS `ydotool` package and service.

KDE/Plasma on Arch/CachyOS:

```bash
sudo pacman -S --needed ydotool spectacle python-dbus python-gobject
sudo usermod -a -G input "$USER"
```

Log out and back in after changing the `input` group. After login, `groups` should include `input`; then enable the Arch/CachyOS user service:

```bash
systemctl --user daemon-reload
systemctl --user enable --now ydotool.service
systemctl --user status ydotool.service
ydotool type "hello"
```

Arch/CachyOS packages the unit as `/usr/lib/systemd/user/ydotool.service`; do not use `sudo systemctl` for it. If the unit is missing, check `pacman -Ql ydotool | grep systemd` and reinstall with `sudo pacman -Syu ydotool`. If `/dev/uinput` is missing, load it with `sudo modprobe uinput`. Fish users who see socket path errors can set `set -Ux YDOTOOL_SOCKET "$XDG_RUNTIME_DIR/.ydotool_socket"`.

Ubuntu GNOME:

```bash
sudo apt update
sudo apt install -y ydotool gnome-screenshot python3-dbus python3-gi
sudo usermod -a -G input "$USER"
sudo systemctl enable --now ydotoold || sudo systemctl enable --now ydotool
```

On Ubuntu, log out and back in after changing the `input` group before testing `ydotool`. After the distro service is running, run `./install-desktop`.

To check readiness after install:

```bash
~/.local/share/codex-linux-app/channels/stable/app/resources/plugins/openai-bundled/plugins/computer-use/bin/codex-computer-use-linux doctor
```

Browser Use is a required desktop runtime. The installer installs Linux `resources/node` and `resources/node_repl`, prefers the Codex primary runtime cache when available, and fails with the exact paths it checked if a usable Linux runtime cannot be found.

Chrome Browser Use needs Google Chrome installed. On Debian systems that provide only `google-chrome-stable`, add a user-level `google-chrome` shim if Browser Use cannot find Chrome:

```bash
mkdir -p ~/.local/bin
ln -sf /usr/bin/google-chrome-stable ~/.local/bin/google-chrome
```

## Usage

Pinned stable version from `VERSION`:

```bash
./install-desktop
```

Latest stable from the live appcast:

```bash
./install-desktop --dev
```

Show the installed version and latest stable appcast entries:

```bash
./release-info
```

Remove repo-owned desktop installs:

```bash
./uninstall-desktop
```

## Install Locations

- Stable: `~/.local/share/codex-linux-app/channels/stable`
- Desktop entry: `~/.local/share/applications/codex.desktop`
- Logs and state: `~/.local/state/codex-linux-app`
- Cache and downloads: `~/.cache/codex-linux-app`

Advanced environment variables and recovery flags are documented in [docs/advanced.md](docs/advanced.md).

## Troubleshooting

If `./install-desktop` fails while copying `app/electron` to `app/codex`, the cached Electron runtime is incomplete. The installer validates the actual Linux `electron` executable and repairs `~/.cache/codex-linux-app/electron-runtime/<version>/node_modules/electron/dist` from the cached Electron archive; rerun `./install-desktop` after updating this repo.
