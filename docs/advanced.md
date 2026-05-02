# Advanced Usage

## Environment Variables

| Variable | Where Used | Effect |
| --- | --- | --- |
| `CODEX_CLI_PATH` | Installer + launcher | Overrides which `codex` binary is used. |
| `RG_PATH` | Installer | Overrides which `rg` binary is copied into the install. |
| `CODEX_BROWSER_USE_NODE_PATH` | Installer | Overrides Browser Use Linux `node` source. |
| `CODEX_BROWSER_USE_NODE_REPL_PATH` | Installer | Overrides Browser Use Linux `node_repl` source. |
| `CODEX_DESKTOP_FORCE_SANDBOX` | Launcher | Forces Chromium sandbox mode when set to `1`. |
| `CODEX_DESKTOP_FORCE_NO_SANDBOX` | Launcher | Forces `--no-sandbox --disable-setuid-sandbox` when set to `1`. |
| `CODEX_DESKTOP_DISABLE_GPU` | Launcher | Adds `--disable-gpu` when set to `1`. |
| `CODEX_DESKTOP_OZONE_PLATFORM_HINT` | Launcher | Passes `--ozone-platform=x11`, `wayland`, or `auto`. Defaults to `x11` so the `/pet` overlay can use XWayland stacking hints on Wayland desktops. |
| `CODEX_DESKTOP_ENABLE_CHROMIUM_LOGGING` | Launcher | Enables Chromium logging when set to `1`. |
| `CODEX_DESKTOP_DISABLE_LINUX_AUTO_HIDE_MENU_BAR` | Patched app | Keeps the native Linux menu bar visible when set to `1`. |
| `CODEX_DESKTOP_DISABLE_LINUX_CLOSE_CANCEL_PATCH` | Patched app | Disables close-cancel window restoration when set to `1`. |
| `CODEX_DESKTOP_DISABLE_LINUX_VISUAL_COMPAT` | Patched app | Disables Linux visual compatibility CSS/JS when set to `1`. |
| `CODEX_DESKTOP_DISABLE_LINUX_TODO_PROGRESS_PATCH` | Patched app | Disables Linux todo progress patch when set to `1`. |
| `CODEX_DESKTOP_DISABLE_LINUX_BROWSER_COMMENT_POSITION_PATCH` | Patched app | Disables browser comment popup positioning correction when set to `1`. |
| `CODEX_DESKTOP_DISABLE_LINUX_BACKGROUND_SUBAGENTS_PANEL_PATCH` | Patched app | Restores upstream background-subagents panel gating when set to `1`. |
| `CODEX_DESKTOP_TRACE_TERMINAL_PATCH` | Patched app | Enables terminal patch trace warnings when set to `1`. |
| `CODEX_DESKTOP_INSTALL_MANIFEST` | Launcher | Internal path to the diagnostic manifest. Do not set manually. |

## Browser Use Runtime Lookup

`node_repl` lookup order:

1. `CODEX_BROWSER_USE_NODE_REPL_PATH`
2. `~/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/node_repl`
3. `~/.cache/codex-runtimes/codex-primary-runtime/dependencies/node_repl`
4. `~/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node_repl`
5. `~/.cache/codex-runtimes/codex-primary-runtime/node_repl`
6. Repo-local `resources/node_repl`
7. Repo-local `vendor/node_repl`

`node` lookup order:

1. `CODEX_BROWSER_USE_NODE_PATH`
2. `~/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`
3. `~/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/node`
4. `PATH`

Both installed files must be executable Linux ELF binaries or executable scripts. macOS Mach-O binaries are rejected.

## Recovery Flags

These flags remain available for install recovery and A/B checks, but are hidden from normal help:

```bash
./install-desktop --diagnostic-manifest
./install-desktop --skip-open-targets-patch
./install-desktop --skip-terminal-patch
./install-desktop --skip-todo-progress-patch
```

The installer always writes a per-channel diagnostic manifest:

- `~/.local/share/codex-linux-app/channels/stable/install-diagnostic-manifest.json`
- `~/.local/share/codex-linux-app/channels/beta/install-diagnostic-manifest.json`

## Notes

- The installer supports Linux `amd64`/`x64`.
- Stable and beta installs are separate. Reinstalling one channel only replaces that channel.
- Build and install stages retry and log under `~/.local/state/codex-linux-app/logs`.
- The generated launcher falls back to `--no-sandbox --disable-setuid-sandbox` when `chrome-sandbox` is not root-owned with mode `4755`, which is normal for a per-user install.
- Linux editor discovery is patched into the desktop runtime for supported IDEs by checking CLI commands on `PATH`, common `.desktop` launchers, and JetBrains Toolbox scripts.
