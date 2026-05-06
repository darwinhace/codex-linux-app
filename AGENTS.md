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

## Validation

Before handing off pet overlay changes, run:

```bash
npm test
```
