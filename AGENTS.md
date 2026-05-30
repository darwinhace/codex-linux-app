# Codex Linux App Agent Notes

## Pet Overlay Defaults

Every desktop repackage must preserve the Linux `/pet` overlay customizations in `src/repack.js`.

- Keep the pixel pet usage UI as a yapping speech bubble, not neon rings.
- The bubble polls Codex usage every 10 seconds through the main-process app bridge.
- Bubble text must stay in English:
  - `5-hour usage left: N%`
  - `Weekly usage left: N%`
- The hover info under the pet must show both values in one pixel square:
  - `5H left N% | Weekly left N%`
- The bubble should be pixelated, compact, close to the pet head, and should fade out instead of disappearing instantly.
- Keep the transparent overlay footprint only as large as needed for the pet, bubble, and hover info. `.codex-usage-yap-wrap` is intentionally used as the avatar layout measurement target so the speech bubble and hover info are not clipped, but do not add extra unused transparent padding beyond those visible elements.
- Do not add a glow ring, aura, halo, or external usage ring around the pet unless the user explicitly asks to bring that design back.
- If the yapping bubble disappears after an upstream update, inspect the installed `webview/assets/avatar-overlay-page-*.js`, not only the unit fixture. The injection must use the real JSX runtime from the `jsx-runtime` import and attach to the mascot hit-region (`data-avatar-overlay-hit-region="mascot"`), not to notification scroll controls or the React compiler cache helper.
- If the yapping bubble stays on `Checking usage...`, do not import a minified `codex-api` export as the usage fetcher; in 26.513 `codex-api` export `n` was a worktree upload helper, not usage. The renderer must call the VS Code bridge handler `codex-linux-pet-usage`, and the main-process provider must read the latest `payload.rate_limits` from `~/.codex/sessions/**/*.jsonl`.
- If waking the pet shows only a draggable cursor/hit region, or the pet looks tiny/transparent while the bubble area is still present, inspect `.codex-usage-yap-wrap` sizing in the installed `webview/assets/codex-avatar-*.css` and `webview/assets/avatar-overlay-page-*.js`. `.codex-usage-yap-wrap` is the avatar layout measurement target, so it must not use parent-relative `inset` sizing that can feed its own measured size back into the overlay layout. The renderer should measure the real `.codex-avatar-root` and pass stable `--codex-usage-avatar-width` / `--codex-usage-avatar-height` CSS variables; the wrapper should use explicit `top`/`left` offsets plus those variables for width/height.
- Installed-bundle verification should confirm `codexLinuxPetYappingUsage`, `codexLinuxFetchUsage`, `.codex-usage-yap-wrap`, `codex-linux-pet-usage`, and the mascot hit-region are all present together, and that stale `codexLinuxUseQuery` is absent.
- Installed-bundle verification for the tiny/missing pet wake-up regression should also confirm `codexLinuxWrapRef`, `.codex-avatar-root` measurement, `--codex-usage-avatar-width`, `--codex-usage-avatar-height`, and no `.codex-usage-yap-wrap { ... inset: ... }` rule.

Reference implementation:

- Main usage provider patch: `patchMainProcessLinuxPetYappingUsage`, `injectLinuxPetYappingUsageMainPatch`, and `buildLinuxPetYappingUsageMainHandler` in `src/repack.js`.
- Renderer JS patch: `patchRendererLinuxPetYappingUsage`, `injectLinuxPetYappingUsagePatch`, and `buildLinuxPetYappingUsageComponent` in `src/repack.js`.
- Renderer CSS patch: `injectLinuxPetYappingUsageCssPatch` and `buildLinuxPetYappingUsageCss` in `src/repack.js`.
- Tests: `injectLinuxPetYappingUsagePatch adds yapping usage bubble to avatar overlay renderer` and `injectLinuxPetYappingUsageCssPatch adds pixel yapping styles` in `test/repack.test.js`.

Reference behavior shape:

```js
codexLinuxFetchUsage(`codex-linux-pet-usage`);
```

```css
.codex-usage-yap-pop {
  image-rendering: pixelated;
  animation: codex-usage-yap-pop 10s ease-in-out both;
}

@keyframes codex-usage-yap-pop {
  0% { opacity: 0; transform: translateY(8px) scale(.9); }
  3%, 24% { opacity: 1; transform: translateY(0) scale(1); }
  34%, 100% { opacity: 0; transform: translateY(-4px) scale(.96); }
}
```

## Pet Overlay Close Behavior

The avatar overlay must not keep Codex alive after the main Codex window closes.

- Keep `codexLinuxRegisterAvatarOverlayAutoClose` and `codexLinuxCloseAvatarOverlayIfOnlyWindow` in the main bundle patch.
- Listen to `closed` on existing and newly created `BrowserWindow` instances. Do not rely on an `app`-level `browser-window-closed` event.
- The avatar overlay window should close itself when it is the only remaining `BrowserWindow`.
- Preserve `CODEX_DESKTOP_DISABLE_LINUX_AVATAR_OVERLAY_AUTO_CLOSE=1` as a local escape hatch.

## Chrome Extension Host

Linux repacks must install a Chrome native messaging host for the Codex Chrome extension.

- Keep `installLinuxChromeExtensionHost` in `src/repack.js` wired into `installChannelRuntime`.
- The manifest path must be `~/.config/google-chrome/NativeMessagingHosts/com.openai.codexextension.json`.
- The manifest must allow `chrome-extension://hehggadaopoacecdllhhajmbjkdcmajg/`.
- The generated host must bridge Chrome native messaging stdio to `/tmp/codex-browser-use/*.sock` with the same 4-byte length-prefixed JSON framing used by Browser Use native pipes.
- The host must answer extension `ping` requests itself so the extension can show `Connected` even before a Codex task attaches.
- Keep tests for `installLinuxChromeExtensionHost` and `buildLinuxChromeExtensionHostModule` in `test/repack.test.js`.
- If the Chrome plugin fails to install or connect after an upstream update, verify both host paths: the root resource host used by the native messaging manifest (`app/resources/chrome-extension-host`) and the bundled plugin Linux wrapper (`app/resources/plugins/openai-bundled/plugins/chrome/extension-host/linux/x64/extension-host`).
- If the extension popup says `Connected` but Codex Settings says Chrome is `Not connected`, inspect the generated Browser Use runtime before reinstalling the extension. The Chrome browser client may load through `node_repl` and crash before browser discovery.
- The generated Linux `node_repl` must expose `globalThis.nodeRepl.env`. Chrome browser-client builds have read environment flags with `globalThis.nodeRepl?.env[e]`; if `nodeRepl` exists but `env` is missing, Browser Use can fail with `TypeError: Cannot read properties of undefined (reading 'BROWSER_USE_DISABLE_AMBIENT_NETWORK')`.
- Fix that class of failure in `src/repack.js` by initializing or exposing `nodeRepl.env` in the generated runtime, then add a generated `node_repl` regression test that reads `globalThis.nodeRepl?.env["BROWSER_USE_DISABLE_AMBIENT_NETWORK"]`.
- The installer diagnostic manifest must include `chromeExtensionHost` and `chromeNativeMessagingHost`; do not treat the Chrome plugin as repaired until the manifest path and wrapper executable both exist in the installed channel resources.

## Browser Use Permissions

The generated Linux `node_repl` must respect Browser Use approval config.

- If `~/.codex/browser/config.toml` or `$CODEX_HOME/browser/config.toml` has `approval_mode = "never_ask"`, Browser Use origin elicitations should auto-accept unless the origin is explicitly denied.
- If `history_approval_mode = "never_ask"`, browsing-history elicitations should auto-accept.
- Preserve the native prompt path for normal `always_ask` mode; do not bypass prompts by default.
- Keep generated `node_repl` tests for `never_ask`, local origins, allow-all preferences, and native-pipe fallback.
- Local Browser Use approval settings do not override upstream Browser Use site policy. If a domain is denied by the policy response, do not add a local bypass.

## Remote Control Keep Awake

Linux repacks must make the Remote Connections `Keep this Mac awake` toggle actually block Linux sleep while the upstream power-save state is active.

- Keep `patchMainProcessLinuxPowerSaveBlocker`, `injectLinuxPowerSaveBlockerPatch`, and `buildLinuxSystemSleepInhibitorMethods` in `src/repack.js`.
- Keep `patchRendererLinuxRemoteControlKeepAwake` and `injectLinuxRemoteControlKeepAwakePatch` so the visible Remote Connections keep-awake toggle value is included in `power-save-blocker-set`.
- Preserve upstream Electron `powerSaveBlocker.start("prevent-app-suspension")`; the Linux patch adds a systemd inhibitor on top of it instead of replacing upstream behavior.
- The Linux inhibitor must use `systemd-inhibit --what=sleep:idle --mode=block --who=codex --why="Codex remote access keep awake"` so `systemd-inhibit --list` shows a real `block` inhibitor when the toggle is active and the machine is plugged in.
- Keep `CODEX_DESKTOP_DISABLE_LINUX_SYSTEM_SLEEP_INHIBITOR=1` as a local escape hatch.
- Keep tests for `injectLinuxPowerSaveBlockerPatch` and `injectLinuxRemoteControlKeepAwakePatch` in `test/repack.test.js`.

## Linux Browser Install Repair

When Chrome or Browser Use breaks after an upstream Codex app update, fix the repack pipeline first. Do not rely on manual edits to the installed `app.asar`.

- Run `npm test` before reinstalling.
- Reinstall with `./install-desktop` for the stable version pinned in `VERSION`, or `./install-desktop --dev` for the latest stable appcast entry.
- The install must write Browser Use runtime files into the channel app resources: `node`, `node_repl`, and `node_repl.mjs`.
- The install must write Chrome extension host files into the channel app resources: `chrome-extension-host` and `chrome-extension-host.mjs`.
- The install must write the Chrome native messaging manifest at `~/.config/google-chrome/NativeMessagingHosts/com.openai.codexextension.json`.
- After install, check the stable diagnostic manifest at `~/.local/share/codex-linux-app/channels/stable/install-diagnostic-manifest.json` for `browserUseRuntime`, `browserUseNodeRepl`, `browserUseNode`, `chromeExtensionHost`, and `chromeNativeMessagingHost`.
- If Browser Use starts slowly or reports a Chrome plugin trust/native-bridge failure, run the installed `node_repl` directly and verify `globalThis.nodeRepl?.env["BROWSER_USE_DISABLE_AMBIENT_NETWORK"]` does not throw. A healthy generated runtime should return the env value or `undefined`, not crash.
- If the in-app Browser bottom panel opens but its page content is blank, inspect `webview/assets/thread-side-panel-tabs-*.js`. The native browser viewport wrapper must carry `data-codex-linux-browser-viewport` / `.codex-linux-browser-viewport-surface`, and Linux visual-compat CSS must keep that surface transparent so it does not cover the native web contents.
- If the Browser panel is still blank after the viewport wrapper patch is present, inspect `webview/assets/thread-side-panel-tabs-*.js` and `webview/assets/browser-sidebar-manager-*.js` together. The Browser panel component must pass its panel host ref into the webview manager (`codexLinuxBrowserWebviewPanelHost`), and the manager must reparent the native `<webview>` container into that host (`codexLinuxBrowserWebviewHostContainer`) so host-relative bounds are used. Keep delayed detach (`codexLinuxBrowserWebviewDetachDelay`) so transient panel remounts do not hide the webview, and keep `codexLinuxBrowserWebviewVisibleWhenUrl` so a Browser tab with a URL remains visible even when upstream is in annotation mode. Browser Use capture-surface mode must use the computed visible bounds marker `codexLinuxBrowserWebviewVisibleCaptureSurface`; otherwise the webview can stay offscreen while the bottom tab and URL bar are visible.
- If the right sidebar opens file/review content but loses the tab header and `+` button, inspect `webview/assets/app-shell-*.js`. The right panel must render the direct tab strip child before the outlet content (`codexLinuxRightPanelTabsFirst`); the older outlet-first order can leave the content visible while hiding the header.
- Browser annotation submit mode must default to adding notes to chat. In 26.519, patch both the component default (`defaultCreateSubmitMode` fallback) and the explicit Browser caller override (`defaultCreateSubmitMode: vt ? "saved" : "direct"`). Keep the direct-submit path available for Ctrl+Enter through `submitDirectly: true`.
- If Browser annotation Adjust opens as a tiny, overlapping comment bar instead of the full design editor, inspect Linux visual-compat CSS before changing the overlay state machine. The compact comment clamp on `[data-browser-comment-editor-surface]` must exclude surfaces containing `[data-browser-comment-design-prompt-shell]`; keep the `codexLinuxBrowserAdjustEditorSurface` marker in `src/repack.js`.
- The right side panel should keep its tab strip and `+` action when file tabs are open. If an upstream update removes the header, inspect `app-shell-*.js` and confirm the direct right-panel tab/outlet registrar renders before full-height slot content (`codexLinuxRightPanelTabsFirst`), `RightPanelTabs` uses pane-height tabs without the old titlebar spacer (`codexLinuxRightPanelPaneTabs`), and the app shell has the local fallback `codexLinuxRightPanelTabsFallback` for cases where the registered outlet is temporarily null. Do not move `RightPanelTabs` out of `RightPanelOutlet`; `RightPanelOutlet` is the registrar that places the tabs inside the right panel. Linux visual-compat CSS should also keep `[data-app-shell-focus-area=right-panel] div:has(>[data-app-shell-tab-strip-controller])` and `[data-app-shell-focus-area=right-panel] [data-app-shell-tab-strip-controller]` at toolbar height above panel content.
- If right-panel content is visible but the tab header is missing, do not assume the registrar patch failed just because the header is invisible. Attach to the installed app with a remote debugging port and inspect `[data-app-shell-focus-area=right-panel]`, `[data-app-shell-tab-strip-controller]`, `[data-app-shell-tab-controller]`, `[role=tab]`, and the `button:not([role=tab])` `+` action. In 26.519 the tab strip was mounted, but Linux CSS let the full-height panel content and the app title/header layer cover it. The visual-compat CSS must include `codexLinuxRightPanelTabsVisible`, keep the tab-strip wrapper and controller at toolbar height above panel content, and reserve visible geometry for the tab list, tab controllers, tab buttons, and `+` action.
- In 26.527, upstream already renders pane-height right-panel tabs, so the old toolbar-to-pane conversion anchors may not run. Still inspect `webview/assets/app-shell-*.js`: the right-panel layout can ship as `children:[e,s]`, where the registered tab strip is `s` and the full-height slot/content is `e`. The repack must detect this 26.527 shape and rewrite it to `children:[s,/* codexLinuxRightPanelTabsFirst */e]` without adding the old fallback registrar. If the tab row exists in the DOM and `document.elementFromPoint` hits the tab/`+` controls but the user cannot see them, check the live geometry: in the broken state the wrapper is at `y=0` under the app title/header. Linux visual-compat CSS must include `codexLinuxRightPanelHeaderOffset` and `margin-top:var(--height-toolbar)!important` on `[data-app-shell-focus-area=right-panel] div:has(>[data-app-shell-tab-strip-controller])`, which should move the wrapper to `y=46` and the tab/`+` controls to about `y=55` in the installed app.
- When repairing right-panel tab ordering, avoid forcing large fixed minimum tab widths such as `min-width:min(10rem, ...)`; that can make multiple tabs overflow under the `+` button. Also avoid zero-min tab controllers for single-tab Browser cases; that can clip labels to text like `Bro`. The working shape is: the full-width header wrapper exists only as the toolbar row, the actual `[data-app-shell-tab-strip-controller]` is compact, the tab list uses measured intrinsic width with a panel cap (`codexLinuxRightPanelTabMetrics`), each tab controller uses intrinsic `max-content` width with a sane max cap, and the `+` wrapper is `position:relative; margin-left:0; flex:0 0 28px`.
- If the right-panel tab strip, `+`, and expand/restore button are visible but the global `Toggle bottom panel` and `Toggle side panel` controls disappear at the top-right, inspect element hit targets before changing app-shell registration. In 26.519 the controls were still mounted and visible in the DOM, but the full-width right-panel header wrapper painted an opaque background over the app header. Keep `codexLinuxRightPanelHeaderPassthrough`: the wrapper `div:has(>[data-app-shell-tab-strip-controller])` should be transparent with `pointer-events:none`, while the actual `[data-app-shell-tab-strip-controller]` must keep its background and `pointer-events:auto`. Verify both normal and expanded panel states with `document.elementFromPoint` on the toggle button centers.
- If the Browser right-panel expand/restore button is visible but cannot be clicked, inspect the trailing action slot before changing app-shell registration. The full-width header wrapper still needs `pointer-events:none`, but its direct `[role=presentation]` trailing action child and contained button must have `pointer-events:auto`, visible toolbar height, and a z-index above the wrapper. Verify with `document.elementFromPoint` on the expand button center and a real click that changes `aria-label` from `Expand panel` to `Restore panel width`.
- If the Browser device selector opens with a white native dropdown and low-contrast text, keep the fix in Linux visual-compat CSS, not in the installed `app.asar`: `#browser-device-preset` and its `option` rows need `color-scheme:dark`, dark token background, and foreground token text. Installed verification should inspect computed colors for the select and first option after reinstall.
- If Chrome helper scripts look for `google-chrome` but the distro only ships `google-chrome-stable`, keep the user-level launcher shim in `~/.local/bin/google-chrome -> /usr/bin/google-chrome-stable` and make sure `~/.local/bin` is on `PATH`.

## Validation

Before handing off repack changes, run:

```bash
npm test
```
