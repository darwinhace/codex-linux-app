# Codex Linux App Agent Notes

These notes are for the current pinned upstream version in `VERSION` (`26.616.51431+`). Do not carry old version-specific patch anchors forward; rediscover the installed bundle shape when upstream changes.

## Current Release Rules

- Treat `VERSION`, `src/repack.js`, `src/linux-computer-use-backend.mjs`, and `test/repack.test.js` as the main source files for current runtime work.
- For runtime fixes, source tests are not enough. Reinstall with `./install-desktop` and verify the installed stable resources under `~/.local/share/codex-linux-app/channels/stable`.
- Do not manually edit installed `app.asar` or installed resource files as the final fix. Patch the repack pipeline, reinstall, then prove the installed artifact.
- Electron runtime cache validation must check the actual Linux executable at `dist/electron`, not only the `dist` directory. Incomplete caches should be repaired by the repack pipeline from the Electron archive before installing channel resources.
- Keep `npm test` and `git diff --check` green before handoff.

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
