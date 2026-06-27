# Codex Linux App Agent Notes

These notes are for the current pinned upstream version in `VERSION` (`26.623.42026+`). Do not carry old version-specific patch anchors forward; rediscover the installed bundle shape when upstream changes.

## Current Release Rules

- Treat `VERSION`, `src/repack.js`, `src/linux-computer-use-backend.mjs`, and `test/repack.test.js` as the main source files for current runtime work.
- For runtime fixes, source tests are not enough. Reinstall with `./install-desktop` and verify the installed stable resources under `~/.local/share/codex-linux-app/channels/stable`.
- Do not manually edit installed `app.asar` or installed resource files as the final fix. Patch the repack pipeline, reinstall, then prove the installed artifact.
- Electron runtime cache validation must check the actual Linux executable at `dist/electron`, not only the `dist` directory. Incomplete caches should be repaired by the repack pipeline from the Electron archive before installing channel resources.
- Keep `npm test` and `git diff --check` green before handoff.

## Linux Title-Bar Overlay

- The minimize/maximize/close box is Electron native title-bar overlay UI, not DOM chrome. It will not inherit theme CSS unless the renderer sends the active theme colors to the main process.
- Keep the Linux title-bar overlay driven by renderer `codex-linux-title-bar-overlay-theme-set` messages routed through the window manager, with a per-window theme cache and `setTitleBarOverlay(...)` reapplied on theme and zoom changes.
- The overlay background should match the app header/top strip, not the editor or page content. Probe `--color-background-surface-under` before falling back to `--color-token-editor-background`; do not restore editor-background-first sampling.
- For this patch, installed artifact checks should confirm the packed renderer contains `background:var(--color-background-surface-under,var(--color-token-editor-background))` and no old `background:var(--color-token-editor-background,var(--color-background-surface-under))` probe.

## Linux Native Window Controls

- A 26.623 repackage regressed KDE/KWin window management when the primary window used Linux hidden title-bar overlay defaults, onboarding mode disabled resizable/maximizable/fullscreenable, and the BrowserWindow constructor passed `parent` or `focusable` with undefined values. The symptom is severe: the app cannot be dragged, resized, minimized, maximized, or closed, and may sit above other apps.
- Keep the Linux primary-window path on native Electron frames by default. The main bundle should contain `codexLinuxNativeWindowFrame`, using `{frame:!0}` for Linux unless `CODEX_DESKTOP_ENABLE_LINUX_TITLE_BAR_OVERLAY=1` explicitly opts into hidden title-bar overlay.
- Keep Linux primary onboarding windows manageable. The main bundle should contain `codexLinuxPrimaryWindowModeControls`, keeping resizable, maximizable, fullscreenable, minimizable, closable, and movable enabled on Linux unless `CODEX_DESKTOP_DISABLE_LINUX_PRIMARY_WINDOW_MODE_CONTROLS_PATCH=1`.
- Keep BrowserWindow option handling nullish-safe. The main bundle should contain `codexLinuxWindowFocusableOption`, spreading `parent` and `focusable` only when they are not nullish; do not restore unconditional `parent:p,focusable:m` style options.
- Do not treat a successful source test as proof for this class of bug. Reinstall, inspect the installed `app.asar` source named by the manifest, and verify that the old Linux hidden-titlebar branch and old unconditional focusable option shape are absent.
- Runtime proof on KDE/Plasma should query KWin state for the installed app. A fixed Codex window should report `managed:true`, `wantsInput:true`, `normalWindow:true`, `keepAbove:false`, `skipTaskbar:false`, and `minimizable`, `maximizable`, `resizeable`, `moveable`, and `closeable` all true.

## Linux Computer Use

- `./install-desktop` must install and sync the bundled `computer-use` plugin, `.mcp.json`, plugin cache, and executable backend wrapper.
- The backend must recover the active desktop session environment when MCP starts without `DISPLAY`, `WAYLAND_DISPLAY`, `XDG_CURRENT_DESKTOP`, `XDG_SESSION_TYPE`, `XDG_RUNTIME_DIR`, or `DBUS_SESSION_BUS_ADDRESS`.
- `doctor` readiness must use live probes where possible: screenshots must actually capture bytes, window backends must actually list/focus where supported, and diagnostics should show attempted commands, stderr, env presence, and setup hints.
- Never make silent sudo changes. Package installs, group membership, and system services should be reported as explicit commands. Non-sudo setup may start user services only.
- Desktop input depends on `ydotool` on Wayland and may use `xdotool` on X11. README must stay simple about installing `ydotool`, joining the `input` group, and enabling the service.
- Arch/CachyOS ships `ydotool.service` as a user unit at `/usr/lib/systemd/user/ydotool.service`; document `systemctl --user enable --now ydotool.service`, not `sudo systemctl enable --now ydotoold` or `sudo systemctl enable --now ydotool`.
- KDE/Plasma Wayland should prefer the KWin DBus scripting backend for `list_windows`, `focused_window`, and exact `activate_window`.
- Ubuntu GNOME should use GNOME Shell Introspect for listing/focused windows when permitted. App-level focus through `FocusApp` is acceptable when exact window activation is unavailable.
- Keep screenshot support practical for current desktops: `spectacle` on KDE, `gnome-screenshot` on GNOME, `grim` where available, and ImageMagick `import` only as an X11 fallback.

## Browser, Chrome, And Remote Runtime

- Browser Use runtime files must be installed into channel resources: `node`, `node_repl`, and `node_repl.mjs`.
- The generated `node_repl` must expose `globalThis.nodeRepl.env` and support MCP JSON-RPC `tools/call`; do not validate it by piping raw JavaScript to stdin.
- The Chrome native messaging host must be installed at `~/.config/google-chrome/NativeMessagingHosts/com.openai.codexextension.json`, allow `chrome-extension://hehggadaopoacecdllhhajmbjkdcmajg/`, and bridge 4-byte length-prefixed JSON-RPC messages to `/tmp/codex-browser-use/*.sock`.
- The generated Chrome host must answer JSON-RPC `{"method":"ping"}` with `pong` before a Codex task attaches.
- Preserve Browser Use approval config behavior from `~/.codex/browser/config.toml` or `$CODEX_HOME/browser/config.toml`; local `never_ask` settings do not override upstream denied-site policy.
- The Remote Connections keep-awake toggle should preserve Electron `powerSaveBlocker` behavior and add the Linux `systemd-inhibit` blocker while active.

## Linux Open In

- The `Open in` header menu depends on both the main-process target list and the worker-side open-target registry. Patch both bundles; a main-only patch can still hide the button or fail with `Unknown open target`.
- The renderer hides `Open in` when target enrichment marks every editor unavailable, so check desktop logs for `Unknown open target "vscode"`, `"cursor"`, `"zed"`, or JetBrains IDs when the button is missing.
- Worker registry dedupe must only skip upstream entries that already define `platforms.linux`; upstream macOS/Windows entries reuse IDs such as `vscode` and `cursor`, and ID-only dedupe drops the Linux target definitions.
- Installed artifact checks should confirm `worker.js` contains `codexLinuxWorkerTargets.filter(e=>e.platforms.linux)`, `new Map(codexLinuxWorkerTargets.flatMap(...))`, Linux editor targets such as `cursor`, and the `zed`/`zeditor` detection alias.

## Pet Overlay

- Preserve the Linux `/pet` yapping usage bubble, not a ring/halo design.
- Bubble text must stay in English: `5-hour usage left: N%` and `Weekly usage left: N%`.
- Hover text must show `5H left N% | Weekly left N%`.
- The bubble should poll through the main-process `codex-linux-pet-usage` bridge, read latest session rate limits, stay compact near the pet head, and fade out.
- Keep the overlay footprint only as large as the visible pet, bubble, and hover info. `.codex-usage-yap-wrap` remains the layout measurement target and must not introduce unused transparent padding.

## Validation

Before handoff for source changes:

```bash
npm test
git diff --check
```

For runtime/repack changes, also reinstall and check installed artifacts:

```bash
./install-desktop
node --input-type=module - <<'NODE'
import fs from 'node:fs';
const manifest = JSON.parse(fs.readFileSync(
  '/home/darwin/.local/share/codex-linux-app/channels/stable/install-diagnostic-manifest.json',
  'utf8'
));
console.log(Object.entries(manifest.patches).filter(([, patch]) => patch.status === 'skipped'));
console.log(manifest.linuxComputerUse?.setupDoctor?.doctor?.report?.status);
NODE
```

Installed runtime probes should use the real installed paths. Probe `node_repl` with JSON-RPC `tools/call`, and probe the Chrome native host with a 4-byte length-prefixed JSON-RPC `ping`.
