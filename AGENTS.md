# Codex Linux App Agent Notes

## Pet Overlay Defaults

Every desktop repackage must preserve the Linux `/pet` overlay customizations in `src/repack.js`.

- Keep the pixel pet usage UI as a yapping speech bubble, not neon rings.
- The bubble polls Codex usage every 10 seconds through the app usage API.
- Bubble text must stay in English:
  - `5-hour usage left: N%`
  - `Weekly usage left: N%`
- The hover info under the pet must show both values in one pixel square:
  - `5H left N% | Weekly left N%`
- The bubble should be pixelated, compact, close to the pet head, and should fade out instead of disappearing instantly.
- Keep the transparent overlay footprint only as large as needed for the pet, bubble, and hover info. `.codex-usage-yap-wrap` is intentionally used as the avatar layout measurement target so the speech bubble and hover info are not clipped, but do not add extra unused transparent padding beyond those visible elements.
- Do not add a glow ring, aura, halo, or external usage ring around the pet unless the user explicitly asks to bring that design back.

Reference implementation:

- Renderer JS patch: `patchRendererLinuxPetYappingUsage`, `injectLinuxPetYappingUsagePatch`, and `buildLinuxPetYappingUsageComponent` in `src/repack.js`.
- Renderer CSS patch: `injectLinuxPetYappingUsageCssPatch` and `buildLinuxPetYappingUsageCss` in `src/repack.js`.
- Tests: `injectLinuxPetYappingUsagePatch adds yapping usage bubble to avatar overlay renderer` and `injectLinuxPetYappingUsageCssPatch adds pixel yapping styles` in `test/repack.test.js`.

Reference behavior shape:

```js
codexLinuxUseQuery({
  queryKey: ['codex-pet-rate-limit-status'],
  queryFn: async () => codexLinuxFetchUsage(),
  staleTime: 0,
  refetchInterval: 10_000,
  refetchIntervalInBackground: true,
  refetchOnMount: 'always',
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
  gcTime: 0
});
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

## Browser Use Permissions

The generated Linux `node_repl` must respect Browser Use approval config.

- If `~/.codex/browser/config.toml` or `$CODEX_HOME/browser/config.toml` has `approval_mode = "never_ask"`, Browser Use origin elicitations should auto-accept unless the origin is explicitly denied.
- If `history_approval_mode = "never_ask"`, browsing-history elicitations should auto-accept.
- Preserve the native prompt path for normal `always_ask` mode; do not bypass prompts by default.
- Keep generated `node_repl` tests for `never_ask`, local origins, allow-all preferences, and native-pipe fallback.
- Local Browser Use approval settings do not override upstream Browser Use site policy. If a domain is denied by the policy response, do not add a local bypass.

## Linux Browser Install Repair

When Chrome or Browser Use breaks after an upstream Codex app update, fix the repack pipeline first. Do not rely on manual edits to the installed `app.asar`.

- Run `npm test` before reinstalling.
- Reinstall with `./install-desktop` for stable, or `./install-desktop --beta` for beta.
- The install must write Browser Use runtime files into the channel app resources: `node`, `node_repl`, and `node_repl.mjs`.
- The install must write Chrome extension host files into the channel app resources: `chrome-extension-host` and `chrome-extension-host.mjs`.
- The install must write the Chrome native messaging manifest at `~/.config/google-chrome/NativeMessagingHosts/com.openai.codexextension.json`.
- After install, check the channel diagnostic manifest at `~/.local/share/codex-linux-app/channels/<stable-or-beta>/install-diagnostic-manifest.json` for `browserUseRuntime`, `browserUseNodeRepl`, `browserUseNode`, `chromeExtensionHost`, and `chromeNativeMessagingHost`.
- If Chrome helper scripts look for `google-chrome` but the distro only ships `google-chrome-stable`, keep the user-level launcher shim in `~/.local/bin/google-chrome -> /usr/bin/google-chrome-stable` and make sure `~/.local/bin` is on `PATH`.

## Validation

Before handing off repack changes, run:

```bash
npm test
```
