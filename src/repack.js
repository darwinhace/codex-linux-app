import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPackage, extractAll } from 'asar';
import { rebuild } from '@electron/rebuild';
import {
  CHANNELS,
  FALLBACK_ELECTRON_VERSION,
  NATIVE_MODULE_HINTS,
  SUPPORTED_ARCH,
  getPaths
} from './constants.js';
import {
  copyDir,
  copyFile,
  createTempDir,
  downloadFile,
  ensureDir,
  fileExists,
  parseJsonFile,
  removeIfExists,
  retryForever,
  runCommand,
  writeExecutable
} from './utils.js';
import { fetchAppcastReleases, resolveRelease } from './appcast.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INSTALL_DIAGNOSTIC_MANIFEST_FILE_NAME = 'install-diagnostic-manifest.json';
const PINNED_INSTALL_VERSION_FILE_NAME = 'VERSION';
const PINNED_INSTALL_VERSION_FILE_PATH = path.join(PROJECT_ROOT, PINNED_INSTALL_VERSION_FILE_NAME);
const BROWSER_USE_NODE_REPL_ENV = 'CODEX_BROWSER_USE_NODE_REPL_PATH';
const BROWSER_USE_NODE_ENV = 'CODEX_BROWSER_USE_NODE_PATH';
const CHROME_EXTENSION_ID = 'hehggadaopoacecdllhhajmbjkdcmajg';
const CHROME_EXTENSION_HOST_NAME = 'com.openai.codexextension';
const CHROME_EXTENSION_HOST_FILE_NAME = 'chrome-extension-host';
const CHROME_EXTENSION_HOST_MODULE_FILE_NAME = 'chrome-extension-host.mjs';
const NODE_REPL_MCP_SERVER_NAME = 'node_repl';
const COMPUTER_USE_PLUGIN_NAME = 'computer-use';
const COMPUTER_USE_MCP_SERVER_NAME = 'computer-use';
const COMPUTER_USE_BACKEND_FILE_NAME = 'codex-computer-use-linux';
const COMPUTER_USE_BACKEND_MODULE_FILE_NAME = 'codex-computer-use-linux.mjs';
const BROWSER_USE_PRIMARY_RUNTIME_RELATIVE_PATH = path.join(
  'codex-runtimes',
  'codex-primary-runtime',
  'dependencies'
);
const NEW_THREAD_MODEL_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch the renderer new-thread model bundle for Linux.';
const TODO_PROGRESS_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch the renderer todo progress bundle for Linux.';
const LINUX_VISUAL_COMPAT_CSS_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch the renderer Linux visual-compat stylesheet.';
const LINUX_VISUAL_COMPAT_JS_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch the renderer Linux visual-compat script.';
const LINUX_BROWSER_VIEWPORT_SURFACE_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch the renderer Browser viewport surface for Linux.';
const LINUX_BROWSER_WEBVIEW_STACKING_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch the renderer Browser webview stacking for Linux.';
const LINUX_RIGHT_PANEL_PANE_TABS_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch the renderer right panel pane tabs for Linux.';
const LINUX_BROWSER_COMMENT_POSITION_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch the renderer browser comment positioning bundle for Linux.';
const LINUX_BROWSER_COMMENT_SUBMIT_MODE_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch the renderer browser comment submit mode bundle for Linux.';
const LINUX_BACKGROUND_SUBAGENTS_PANEL_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch the renderer background subagents panel bundle for Linux.';
const LINUX_LATEST_AGENT_TURN_EXPANSION_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch the renderer latest agent turn expansion bundle for Linux.';
const COMPACT_SLASH_COMMAND_VERIFICATION_BASE_ERROR_MESSAGE =
  'Could not verify compact slash command support in renderer bundle for Linux.';
const LINUX_WORKTREE_ENVIRONMENT_MAIN_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch the Electron main bundle worktree environment propagation for Linux.';
const LINUX_WORKTREE_ENVIRONMENT_WORKER_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch the Electron worker bundle worktree environment handling for Linux.';
const LINUX_TITLE_BAR_OVERLAY_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch Linux title-bar overlay colors in the Electron main bundle.';
const LINUX_NATIVE_WINDOW_FRAME_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch Linux native window frame behavior in the Electron main bundle.';
const LINUX_PRIMARY_WINDOW_MODE_CONTROLS_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch Linux primary window mode controls in the Electron main bundle.';
const LINUX_WINDOW_FOCUSABLE_OPTION_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch Linux BrowserWindow focusable option in the Electron main bundle.';
const LINUX_WINDOW_ICON_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch Linux BrowserWindow icon in the Electron main bundle.';
const LINUX_NOTIFICATION_SOUND_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch Linux notification sound playback in the Electron main bundle.';
const LINUX_BROWSER_USE_HOST_FETCH_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch Linux Browser Use authenticated host fetch into the Electron main bundle.';
const LINUX_BROWSER_USE_RUNTIME_PATHS_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch Linux Browser Use runtime paths into the Electron main bundle.';
const LINUX_BUNDLED_BROWSER_CHROME_PLUGINS_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch bundled Browser/Chrome/Computer Use plugin reconciliation for Linux.';
const LINUX_CHROME_EXTENSION_SETTINGS_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch Linux Chrome extension settings detection into the Electron main bundle.';
const LINUX_CHROME_NATIVE_HOST_RUNTIME_PATHS_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch Linux Chrome native host runtime paths into the Electron bundle.';
const LINUX_OWL_FEATURE_BINDING_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch Linux Owl feature binding fallback into the Electron bundle.';
const LINUX_REMOTE_CONTROL_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch Linux remote-control feature availability into the Electron main bundle.';
const LINUX_REMOTE_CONTROL_VISIBILITY_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch Linux remote-control settings visibility into the renderer bundle.';
const LINUX_COMPUTER_USE_UI_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch Linux Computer Use UI availability into the renderer bundle.';
const LINUX_POWER_SAVE_BLOCKER_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch Linux system sleep inhibition into the Electron main bundle.';
const LINUX_REMOTE_CONTROL_KEEP_AWAKE_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch Linux remote-control keep-awake setting dispatch into the renderer bundle.';
const LINUX_AVATAR_OVERLAY_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch Linux avatar overlay window behavior into the Electron main bundle.';
const LINUX_AVATAR_OVERLAY_RENDERER_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch Linux avatar overlay drag coordinates into the renderer bundle.';
const LINUX_PET_YAPPING_USAGE_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch the renderer pet yapping usage bubble into the avatar overlay bundle.';
const LINUX_PET_YAPPING_USAGE_MAIN_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch the main-process pet yapping usage provider into the Electron main bundle.';

export function parseArgs(argv) {
  const options = {
    dev: false,
    help: false,
    skipOpenTargetsPatch: false,
    skipTerminalPatch: false,
    skipTodoProgressPatch: false,
    diagnosticManifest: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dev') {
      options.dev = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--skip-open-targets-patch') {
      options.skipOpenTargetsPatch = true;
      continue;
    }
    if (arg === '--skip-terminal-patch') {
      options.skipTerminalPatch = true;
      continue;
    }
    if (arg === '--skip-todo-progress-patch') {
      options.skipTodoProgressPatch = true;
      continue;
    }
    if (arg === '--diagnostic-manifest') {
      options.diagnosticManifest = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

export function renderHelp() {
  return [
    'Usage:',
    '  install-desktop',
    '  install-desktop --dev',
    '',
    'Options:',
    `  --dev        install the latest stable release instead of the version pinned in ${PINNED_INSTALL_VERSION_FILE_NAME}`,
    '  -h, --help           show this help'
  ].join('\n');
}

export async function readPinnedInstallVersion(versionFilePath = PINNED_INSTALL_VERSION_FILE_PATH) {
  let contents;
  try {
    contents = await fs.promises.readFile(versionFilePath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      throw new Error(
        `Pinned install version file ${versionFilePath} does not exist. Create ${PINNED_INSTALL_VERSION_FILE_NAME} or run install-desktop --dev to install the latest stable release.`
      );
    }
    throw error;
  }

  const version = contents.trim();
  if (!version) {
    throw new Error(`Pinned install version file ${versionFilePath} is empty.`);
  }
  return version;
}

export async function resolveInstallRelease(releases, options, config = {}) {
  const version = options.dev
    ? null
    : await readPinnedInstallVersion(config.versionFilePath ?? PINNED_INSTALL_VERSION_FILE_PATH);
  return resolveRelease(releases, version);
}

export async function installDesktop(options, logger) {
  const paths = getPaths();
  await ensureDir(paths.cacheHome);
  await ensureDir(paths.dataHome);
  await ensureDir(paths.desktopApplications);
  await ensureDir(paths.stateHome);

  if (process.platform !== 'linux') {
    throw new Error(`This installer only supports Linux. Current platform: ${process.platform}`);
  }
  if (process.arch !== SUPPORTED_ARCH) {
    throw new Error(
      `This installer currently supports Linux ${SUPPORTED_ARCH} only. Current arch: ${process.arch}`
    );
  }

  const channel = CHANNELS.stable;
  logger.info(`Selected channel: ${channel.id}`);
  logger.info(`Selected feed: ${channel.feedUrl}`);

  const releases = await fetchAppcastReleases(channel.feedUrl);
  const release = await resolveInstallRelease(releases, options);
  if (options.dev) {
    logger.info('Version mode: latest stable appcast (--dev)');
  } else {
    logger.info(`Version mode: pinned stable version from ${PINNED_INSTALL_VERSION_FILE_PATH}`);
  }
  logger.info(
    `Selected release: version=${release.version} build=${release.buildNumber} published=${release.pubDate}`
  );

  const downloadDir = path.join(paths.cacheHome, 'downloads', channel.id);
  const workDir = await createTempDir(`codex-${channel.id}-`);
  const installRoot = path.join(paths.dataHome, 'channels', channel.id);
  const channelAppDir = path.join(installRoot, 'app');
  const channelBinDir = path.join(installRoot, 'bin');
  const channelIconDir = path.join(installRoot, 'icons');
  const channelStateDir = path.join(paths.stateHome, channel.id);
  const channelLogDir = path.join(channelStateDir, 'logs');
  const runtimeLogDir = path.join(paths.stateHome, 'logs');
  const diagnosticManifestPath = path.join(installRoot, INSTALL_DIAGNOSTIC_MANIFEST_FILE_NAME);
  const installedAt = new Date().toISOString();

  await ensureDir(downloadDir);
  await ensureDir(channelLogDir);
  await ensureDir(runtimeLogDir);
  await stopRunningChannelProcesses({
    channelAppDir,
    executableName: channel.executableName,
    logger
  });

  const codexCliPath = await resolveCodexCliPath();
  const rgPath = await resolveRipgrepPath();
  logger.info(`Validated Codex CLI at ${codexCliPath}`);
  logger.info(`Using ripgrep at ${rgPath}`);

  const zipPath = path.join(downloadDir, `${release.version}.zip`);
  const downloadStage = `download-${channel.id}-${release.version}`;
  await retryForever(downloadStage, logger, async () => {
    if (await fileExists(zipPath)) {
      logger.info(`Using cached archive ${zipPath}`);
      return;
    }
    await downloadFile(release.enclosureUrl, zipPath);
  });

  const extractDir = path.join(workDir, 'extract');
  const appSourceDir = path.join(workDir, 'app-source');

  await retryForever(`extract-${channel.id}-${release.version}`, logger, async () => {
    await removeIfExists(extractDir);
    await ensureDir(extractDir);
    await runCommand('unzip', ['-q', zipPath, '-d', extractDir], { logger });
  });

  const appBundlePath = await findAppBundle(extractDir);
  const upstreamResourcesDir = path.join(appBundlePath, 'Contents', 'Resources');
  const upstreamAsarPath = path.join(upstreamResourcesDir, 'app.asar');
  const extractedAppDir = path.join(appSourceDir, 'extracted');
  await ensureDir(appSourceDir);

  await retryForever(`unpack-asar-${channel.id}-${release.version}`, logger, async () => {
    await removeIfExists(extractedAppDir);
    extractAll(upstreamAsarPath, extractedAppDir);
  });

  const appPackagePath = path.join(extractedAppDir, 'package.json');
  const appPackage = await parseJsonFile(appPackagePath);
  const electronVersion = extractElectronVersion(appPackage);
  const nativeModules = detectNativeModules(extractedAppDir);
  const nativeModuleVersions = await getNativeModuleVersions({
    extractedAppDir,
    nativeModules
  });
  logger.info(
    `Upstream packaged app: ${appPackage.productName} ${appPackage.version} (flavor=${appPackage.codexBuildFlavor}, electron=${electronVersion})`
  );

  patchPackageJson(appPackage, channel);
  await fs.promises.writeFile(appPackagePath, JSON.stringify(appPackage, null, 2), 'utf8');
  const bootstrapPatch = await patchBootstrap(extractedAppDir);
  const openTargetsPatch = options.skipOpenTargetsPatch
    ? buildSkippedPatchResult('cli-option-disabled')
    : await patchMainProcessBundle(extractedAppDir, logger);
  const linuxMenuBarPatch = await patchMainProcessLinuxMenuBar(extractedAppDir, logger);
  const linuxTitleBarOverlayPatch = await patchMainProcessLinuxTitleBarOverlay(
    extractedAppDir,
    logger
  );
  assertRequiredPatchApplied('Linux title-bar overlay colors', linuxTitleBarOverlayPatch);
  const linuxNativeWindowFramePatch = await patchMainProcessLinuxNativeWindowFrame(
    extractedAppDir,
    logger
  );
  assertRequiredPatchApplied('Linux native window frame', linuxNativeWindowFramePatch);
  const linuxPrimaryWindowModeControlsPatch =
    await patchMainProcessLinuxPrimaryWindowModeControls(extractedAppDir, logger);
  assertRequiredPatchApplied(
    'Linux primary window mode controls',
    linuxPrimaryWindowModeControlsPatch
  );
  const linuxWindowFocusableOptionPatch = await patchMainProcessLinuxWindowFocusableOption(
    extractedAppDir,
    logger
  );
  assertRequiredPatchApplied('Linux BrowserWindow focusable option', linuxWindowFocusableOptionPatch);
  const linuxWindowIconPatch = await patchMainProcessLinuxWindowIcon(extractedAppDir, logger);
  assertRequiredPatchApplied('Linux window icon', linuxWindowIconPatch);
  const linuxCloseCancelPatch = await patchMainProcessLinuxCloseCancel(extractedAppDir, logger);
  const linuxNotificationSoundPatch = await patchMainProcessLinuxNotificationSound(
    extractedAppDir,
    logger
  );
  assertRequiredPatchApplied('Linux notification sound', linuxNotificationSoundPatch);
  const linuxWorktreeEnvironmentMainPatch = await patchMainProcessLinuxWorktreeEnvironment(
    extractedAppDir,
    logger
  );
  assertRequiredPatchApplied('worktree environment main', linuxWorktreeEnvironmentMainPatch);
  const linuxWorktreeEnvironmentWorkerPatch = await patchWorkerLinuxWorktreeEnvironment(
    extractedAppDir,
    logger
  );
  assertRequiredPatchApplied('worktree environment worker', linuxWorktreeEnvironmentWorkerPatch);
  const linuxOwlFeatureBindingPatch = await patchElectronLinuxOwlFeatureBinding(
    extractedAppDir,
    logger
  );
  assertRequiredPatchApplied('Linux Owl feature binding fallback', linuxOwlFeatureBindingPatch);
  const linuxBrowserUseHostFetchPatch = await patchMainProcessLinuxBrowserUseHostFetch(
    extractedAppDir,
    logger
  );
  assertRequiredPatchApplied('Browser Use authenticated host fetch', linuxBrowserUseHostFetchPatch);
  const linuxBrowserUseRuntimePathsPatch = await patchMainProcessLinuxBrowserUseRuntimePaths(
    extractedAppDir,
    logger
  );
  assertRequiredPatchApplied('Browser Use Linux runtime paths', linuxBrowserUseRuntimePathsPatch);
  const linuxBundledBrowserChromePluginsPatch =
    await patchMainProcessLinuxBundledBrowserChromePlugins(extractedAppDir, logger);
  assertRequiredPatchApplied(
    'Linux bundled Browser/Chrome plugins',
    linuxBundledBrowserChromePluginsPatch
  );
  const linuxChromeExtensionSettingsPatch = await patchMainProcessLinuxChromeExtensionSettings(
    extractedAppDir,
    logger
  );
  assertRequiredPatchApplied(
    'Linux Chrome extension settings',
    linuxChromeExtensionSettingsPatch
  );
  const linuxChromeNativeHostRuntimePathsPatch =
    await patchElectronLinuxChromeNativeHostRuntimePaths(extractedAppDir, logger);
  assertRequiredPatchApplied(
    'Linux Chrome native host runtime paths',
    linuxChromeNativeHostRuntimePathsPatch
  );
  const linuxRemoteControlPatch = await patchMainProcessLinuxRemoteControl(extractedAppDir, logger);
  assertRequiredPatchApplied('Linux remote control feature availability', linuxRemoteControlPatch);
  const linuxRemoteControlVisibilityPatch = await patchRendererLinuxRemoteControlVisibility(
    extractedAppDir,
    logger
  );
  assertRequiredPatchApplied(
    'Linux remote control settings visibility',
    linuxRemoteControlVisibilityPatch
  );
  const linuxComputerUseUiPatch = await patchRendererLinuxComputerUseUi(
    extractedAppDir,
    logger
  );
  assertRequiredPatchApplied('Linux Computer Use UI availability', linuxComputerUseUiPatch);
  const linuxPowerSaveBlockerPatch = await patchMainProcessLinuxPowerSaveBlocker(
    extractedAppDir,
    logger
  );
  assertRequiredPatchApplied('Linux power save blocker', linuxPowerSaveBlockerPatch);
  const linuxRemoteControlKeepAwakePatch = await patchRendererLinuxRemoteControlKeepAwake(
    extractedAppDir,
    logger
  );
  assertRequiredPatchApplied('Linux remote control keep-awake', linuxRemoteControlKeepAwakePatch);
  const linuxAvatarOverlayPatch = await patchMainProcessLinuxAvatarOverlay(extractedAppDir, logger);
  assertRequiredPatchApplied('Linux avatar overlay', linuxAvatarOverlayPatch);
  const linuxAvatarOverlayRendererPatch = await patchRendererLinuxAvatarOverlay(
    extractedAppDir,
    logger
  );
  assertRequiredPatchApplied('Linux avatar overlay renderer', linuxAvatarOverlayRendererPatch);
  const linuxPetYappingUsageMainPatch = await patchMainProcessLinuxPetYappingUsage(
    extractedAppDir,
    logger
  );
  assertRequiredPatchApplied('Linux pet yapping usage main', linuxPetYappingUsageMainPatch);
  const linuxPetYappingUsagePatch = await patchRendererLinuxPetYappingUsage(
    extractedAppDir,
    logger
  );
  assertRequiredPatchApplied('Linux pet yapping usage', linuxPetYappingUsagePatch);
  const terminalPatch = options.skipTerminalPatch
    ? buildSkippedPatchResult('cli-option-disabled')
    : await patchRendererTerminalBundle(extractedAppDir, logger);
  const newThreadModelPatch = await patchRendererNewThreadModelBundle(extractedAppDir, logger);
  if (newThreadModelPatch.status !== 'applied' && newThreadModelPatch.status !== 'already-applied') {
    logger.warn(
      `Continuing without Linux new-thread model patch because upstream renderer anchors changed: ${newThreadModelPatch.reason ?? newThreadModelPatch.status}`
    );
  }
  const todoProgressPatch = options.skipTodoProgressPatch
    ? buildSkippedPatchResult('cli-option-disabled')
    : await patchRendererTodoProgressBundle(extractedAppDir, logger);
  const linuxVisualCompatPatch = await patchRendererLinuxVisualCompat(extractedAppDir, logger);
  const linuxBrowserViewportSurfacePatch = await patchRendererLinuxBrowserViewportSurfaceBundle(
    extractedAppDir,
    logger
  );
  const linuxBrowserWebviewStackingPatch = await patchRendererLinuxBrowserWebviewStackingBundle(
    extractedAppDir,
    logger
  );
  const linuxRightPanelPaneTabsPatch = await patchRendererLinuxRightPanelPaneTabsBundle(
    extractedAppDir,
    logger
  );
  const linuxBrowserCommentPositionPatch = await patchRendererLinuxBrowserCommentPositionBundle(
    extractedAppDir,
    logger
  );
  const linuxBrowserCommentSubmitModePatch =
    await patchRendererLinuxBrowserCommentSubmitModeBundle(extractedAppDir, logger);
  const linuxBrowserCommentSubmitCleanupPatch =
    await patchRendererLinuxBrowserCommentSubmitCleanupBundle(extractedAppDir, logger);
  const backgroundSubagentsPanelPatch = await patchRendererBackgroundSubagentsPanelBundle(
    extractedAppDir,
    logger
  );
  const latestAgentTurnExpansionPatch = await patchRendererLatestAgentTurnExpansionBundle(
    extractedAppDir,
    logger
  );
  const compactSlashCommandPatch = await patchRendererCompactSlashCommandBundle(
    extractedAppDir,
    logger
  );
  assertRequiredPatchApplied('compact slash command', compactSlashCommandPatch);
  if (options.skipOpenTargetsPatch) {
    logger.warn('Skipping Linux open-in-targets patch because --skip-open-targets-patch was set');
  }
  if (options.skipTerminalPatch) {
    logger.warn('Skipping Linux terminal lifecycle patch because --skip-terminal-patch was set');
  }
  if (options.skipTodoProgressPatch) {
    logger.warn('Skipping Linux todo progress patch because --skip-todo-progress-patch was set');
  }
  await replaceNativeModules({
    cacheHome: paths.cacheHome,
    extractedAppDir,
    electronVersion,
    nativeModules,
    nativeModuleVersions,
    logger
  });

  const packagedAsarDir = path.join(workDir, 'packaged');
  const packagedAsarPath = path.join(packagedAsarDir, 'app.asar');
  await ensureDir(packagedAsarDir);

  await retryForever(`pack-asar-${channel.id}-${release.version}`, logger, async () => {
    await removeIfExists(packagedAsarPath);
    await createPackage(extractedAppDir, packagedAsarPath);
  });

  const runtime = await resolveRuntimeSourceDir({
    cacheHome: paths.cacheHome,
    electronVersion,
    logger
  });

  const patchSummary = summarizePatchStates({
    bootstrap: bootstrapPatch,
    openTargets: openTargetsPatch,
    linuxMenuBar: linuxMenuBarPatch,
    linuxTitleBarOverlay: linuxTitleBarOverlayPatch,
    linuxNativeWindowFrame: linuxNativeWindowFramePatch,
    linuxPrimaryWindowModeControls: linuxPrimaryWindowModeControlsPatch,
    linuxWindowFocusableOption: linuxWindowFocusableOptionPatch,
    linuxWindowIcon: linuxWindowIconPatch,
    linuxCloseCancel: linuxCloseCancelPatch,
    linuxNotificationSound: linuxNotificationSoundPatch,
    linuxWorktreeEnvironmentMain: linuxWorktreeEnvironmentMainPatch,
    linuxWorktreeEnvironmentWorker: linuxWorktreeEnvironmentWorkerPatch,
    linuxOwlFeatureBinding: linuxOwlFeatureBindingPatch,
    linuxBrowserUseHostFetch: linuxBrowserUseHostFetchPatch,
    linuxBrowserUseRuntimePaths: linuxBrowserUseRuntimePathsPatch,
    linuxBundledBrowserChromePlugins: linuxBundledBrowserChromePluginsPatch,
    linuxChromeExtensionSettings: linuxChromeExtensionSettingsPatch,
    linuxChromeNativeHostRuntimePaths: linuxChromeNativeHostRuntimePathsPatch,
    linuxRemoteControl: linuxRemoteControlPatch,
    linuxRemoteControlVisibility: linuxRemoteControlVisibilityPatch,
    linuxComputerUseUi: linuxComputerUseUiPatch,
    linuxPowerSaveBlocker: linuxPowerSaveBlockerPatch,
    linuxRemoteControlKeepAwake: linuxRemoteControlKeepAwakePatch,
    linuxAvatarOverlay: linuxAvatarOverlayPatch,
    linuxAvatarOverlayRenderer: linuxAvatarOverlayRendererPatch,
    linuxPetYappingUsageMain: linuxPetYappingUsageMainPatch,
    linuxPetYappingUsage: linuxPetYappingUsagePatch,
    terminalLifecycle: terminalPatch,
    newThreadModel: newThreadModelPatch,
    todoProgress: todoProgressPatch,
    linuxVisualCompat: linuxVisualCompatPatch,
    linuxBrowserViewportSurface: linuxBrowserViewportSurfacePatch,
    linuxBrowserWebviewStacking: linuxBrowserWebviewStackingPatch,
    linuxRightPanelPaneTabs: linuxRightPanelPaneTabsPatch,
    linuxBrowserCommentPosition: linuxBrowserCommentPositionPatch,
    linuxBrowserCommentSubmitMode: linuxBrowserCommentSubmitModePatch,
    linuxBrowserCommentSubmitCleanup: linuxBrowserCommentSubmitCleanupPatch,
    backgroundSubagentsPanel: backgroundSubagentsPanelPatch,
    latestAgentTurnExpansion: latestAgentTurnExpansionPatch,
    compactSlashCommand: compactSlashCommandPatch
  });
  const installResult = await installChannelRuntime({
    channel,
    channelAppDir,
    channelBinDir,
    channelIconDir,
    channelStateDir,
    homeDir: paths.home,
    runtimeSourceDir: runtime.runtimeSourceDir,
    packagedAsarPath,
    upstreamResourcesDir,
    unpackedSourceRoot: extractedAppDir,
    rgPath,
    nativeModules,
    runtimeLogDir,
    diagnosticManifestPath,
    patchSummary,
    releaseVersion: release.version,
    appBuildFlavor: appPackage.codexBuildFlavor,
    logger
  });
  const {
    iconPath,
    browserUseRuntime,
    browserUseNodeRepl,
    browserUseNode,
    browserUseMcpConfig,
    linuxComputerUse,
    chromeExtensionHost,
    chromeNativeMessagingHost,
    chromeBundledPluginHost,
    chromeNativeHostRuntimeRegistryRepair,
    bundledPlugins,
    chromeExtensionHostCleanup
  } = installResult;

  await writeDesktopEntry({
    channel,
    iconPath,
    desktopApplicationsDir: paths.desktopApplications,
    executablePath: path.join(channelBinDir, channel.executableName),
    installRoot
  });

  const diagnosticManifest = createInstallDiagnosticManifest({
    installedAt,
    channel,
    release,
    flavor: appPackage.codexBuildFlavor,
    electronVersion,
    runtimeSourceKind: runtime.sourceKind,
    nativeModules,
    nativeModuleVersions,
    browserUseRuntime,
    browserUseNodeRepl,
    browserUseNode,
    browserUseMcpConfig,
    linuxComputerUse,
    chromeExtensionHost,
    chromeNativeMessagingHost,
    chromeBundledPluginHost,
    chromeNativeHostRuntimeRegistryRepair,
    bundledPlugins,
    chromeExtensionHostCleanup,
    patches: {
      bootstrap: bootstrapPatch,
      openTargets: openTargetsPatch,
      linuxMenuBar: linuxMenuBarPatch,
      linuxTitleBarOverlay: linuxTitleBarOverlayPatch,
      linuxNativeWindowFrame: linuxNativeWindowFramePatch,
      linuxPrimaryWindowModeControls: linuxPrimaryWindowModeControlsPatch,
      linuxWindowFocusableOption: linuxWindowFocusableOptionPatch,
      linuxWindowIcon: linuxWindowIconPatch,
      linuxCloseCancel: linuxCloseCancelPatch,
      linuxNotificationSound: linuxNotificationSoundPatch,
      linuxWorktreeEnvironmentMain: linuxWorktreeEnvironmentMainPatch,
      linuxWorktreeEnvironmentWorker: linuxWorktreeEnvironmentWorkerPatch,
      linuxOwlFeatureBinding: linuxOwlFeatureBindingPatch,
      linuxBrowserUseHostFetch: linuxBrowserUseHostFetchPatch,
      linuxBrowserUseRuntimePaths: linuxBrowserUseRuntimePathsPatch,
      linuxBundledBrowserChromePlugins: linuxBundledBrowserChromePluginsPatch,
      linuxChromeExtensionSettings: linuxChromeExtensionSettingsPatch,
      linuxChromeNativeHostRuntimePaths: linuxChromeNativeHostRuntimePathsPatch,
      linuxRemoteControl: linuxRemoteControlPatch,
      linuxRemoteControlVisibility: linuxRemoteControlVisibilityPatch,
      linuxComputerUseUi: linuxComputerUseUiPatch,
      linuxPowerSaveBlocker: linuxPowerSaveBlockerPatch,
      linuxRemoteControlKeepAwake: linuxRemoteControlKeepAwakePatch,
      linuxAvatarOverlay: linuxAvatarOverlayPatch,
      linuxAvatarOverlayRenderer: linuxAvatarOverlayRendererPatch,
      linuxPetYappingUsageMain: linuxPetYappingUsageMainPatch,
      linuxPetYappingUsage: linuxPetYappingUsagePatch,
      terminalLifecycle: terminalPatch,
      newThreadModel: newThreadModelPatch,
      todoProgress: todoProgressPatch,
      linuxVisualCompat: linuxVisualCompatPatch,
      linuxBrowserViewportSurface: linuxBrowserViewportSurfacePatch,
      linuxBrowserWebviewStacking: linuxBrowserWebviewStackingPatch,
      linuxRightPanelPaneTabs: linuxRightPanelPaneTabsPatch,
      linuxBrowserCommentPosition: linuxBrowserCommentPositionPatch,
      linuxBrowserCommentSubmitMode: linuxBrowserCommentSubmitModePatch,
      linuxBrowserCommentSubmitCleanup: linuxBrowserCommentSubmitCleanupPatch,
      backgroundSubagentsPanel: backgroundSubagentsPanelPatch,
      latestAgentTurnExpansion: latestAgentTurnExpansionPatch,
      compactSlashCommand: compactSlashCommandPatch
    }
  });
  await writeInstallDiagnosticManifest({
    manifestPath: diagnosticManifestPath,
    manifest: diagnosticManifest
  });
  logger.info(`Diagnostic manifest: ${diagnosticManifestPath}`);
  if (options.diagnosticManifest) {
    logger.info(`Diagnostic manifest contents:\n${JSON.stringify(diagnosticManifest, null, 2)}`);
  }

  logger.info(`Install complete for ${channel.productName} ${release.version}`);
  logger.info(`Desktop file: ${path.join(paths.desktopApplications, channel.desktopFileName)}`);
  logger.info(`Launcher: ${path.join(channelBinDir, channel.executableName)}`);
  logger.info(`Install root: ${installRoot}`);
}

function patchPackageJson(appPackage, channel) {
  appPackage.productName = channel.productName;
  if (channel.id === 'beta') {
    appPackage.name = 'openai-codex-electron-beta';
  } else {
    appPackage.name = 'openai-codex-electron';
  }
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function parseProcCmdline(rawCmdline) {
  const text = Buffer.isBuffer(rawCmdline) ? rawCmdline.toString('utf8') : String(rawCmdline ?? '');
  return text.split('\0').filter(Boolean);
}

export function isChannelAppProcessCommandLine(cmdlineArgs, { channelAppDir, executableName }) {
  if (!Array.isArray(cmdlineArgs) || cmdlineArgs.length === 0) {
    return false;
  }
  const expectedExecutablePath = path.join(path.resolve(channelAppDir), executableName);
  return cmdlineArgs.some((arg) => {
    if (typeof arg !== 'string' || !arg) {
      return false;
    }
    return path.resolve(arg) === expectedExecutablePath;
  });
}

export function isLinuxChromeExtensionHostProcessCommandLine(
  cmdlineArgs,
  { extensionId = CHROME_EXTENSION_ID } = {}
) {
  if (!Array.isArray(cmdlineArgs) || cmdlineArgs.length === 0) {
    return false;
  }
  const expectedOrigin = `chrome-extension://${extensionId}/`;
  const hasHostModule = cmdlineArgs.some((arg) => {
    if (typeof arg !== 'string' || arg.length === 0) {
      return false;
    }
    const basename = path.basename(arg);
    return basename === CHROME_EXTENSION_HOST_MODULE_FILE_NAME;
  });
  const hasExtensionOrigin = cmdlineArgs.some((arg) => arg === expectedOrigin);
  return hasHostModule && hasExtensionOrigin;
}

export async function collectRunningChannelProcesses({
  channelAppDir,
  executableName,
  procRoot = '/proc'
}) {
  let entries;
  try {
    entries = await fs.promises.readdir(procRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const ownPid = process.pid;
  const matches = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) {
      continue;
    }
    const pid = Number(entry.name);
    if (!Number.isSafeInteger(pid) || pid === ownPid) {
      continue;
    }
    let cmdline;
    try {
      cmdline = await fs.promises.readFile(path.join(procRoot, entry.name, 'cmdline'));
    } catch {
      continue;
    }
    const cmdlineArgs = parseProcCmdline(cmdline);
    if (isChannelAppProcessCommandLine(cmdlineArgs, { channelAppDir, executableName })) {
      matches.push({ pid, cmdlineArgs });
    }
  }
  return matches.sort((left, right) => left.pid - right.pid);
}

export async function collectRunningLinuxChromeExtensionHostProcesses({
  extensionId = CHROME_EXTENSION_ID,
  procRoot = '/proc'
} = {}) {
  let entries;
  try {
    entries = await fs.promises.readdir(procRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const ownPid = process.pid;
  const matches = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) {
      continue;
    }
    const pid = Number(entry.name);
    if (!Number.isSafeInteger(pid) || pid === ownPid) {
      continue;
    }
    let cmdline;
    try {
      cmdline = await fs.promises.readFile(path.join(procRoot, entry.name, 'cmdline'));
    } catch {
      continue;
    }
    const cmdlineArgs = parseProcCmdline(cmdline);
    if (isLinuxChromeExtensionHostProcessCommandLine(cmdlineArgs, { extensionId })) {
      matches.push({ pid, cmdlineArgs });
    }
  }
  return matches.sort((left, right) => left.pid - right.pid);
}

async function waitForChannelProcessesToExit({ channelAppDir, executableName, timeoutMs = 5000 }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const running = await collectRunningChannelProcesses({ channelAppDir, executableName });
    if (running.length === 0) {
      return [];
    }
    await delay(100);
  }
  return collectRunningChannelProcesses({ channelAppDir, executableName });
}

async function waitForLinuxChromeExtensionHostProcessesToExit({
  extensionId = CHROME_EXTENSION_ID,
  procRoot = '/proc',
  timeoutMs = 1500
} = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const running = await collectRunningLinuxChromeExtensionHostProcesses({ extensionId, procRoot });
    if (running.length === 0) {
      return [];
    }
    await delay(100);
  }
  return collectRunningLinuxChromeExtensionHostProcesses({ extensionId, procRoot });
}

export async function stopRunningLinuxChromeExtensionHostProcesses({
  extensionId = CHROME_EXTENSION_ID,
  procRoot = '/proc',
  killProcess = process.kill,
  logger = null
} = {}) {
  const running = await collectRunningLinuxChromeExtensionHostProcesses({ extensionId, procRoot });
  if (running.length === 0) {
    return {
      status: 'not-running',
      terminatedPids: [],
      remainingPids: []
    };
  }

  logger?.warn?.(
    `Stopping stale Chrome extension native host processes before install: ${running
      .map((processInfo) => processInfo.pid)
      .join(', ')}`
  );
  const terminatedPids = [];
  for (const processInfo of running) {
    try {
      killProcess(processInfo.pid, 'SIGTERM');
      terminatedPids.push(processInfo.pid);
    } catch (error) {
      if (error?.code !== 'ESRCH') {
        logger?.warn?.(`Failed to send SIGTERM to Chrome extension host ${processInfo.pid}: ${error.message}`);
      }
    }
  }

  const remaining = await waitForLinuxChromeExtensionHostProcessesToExit({
    extensionId,
    procRoot
  });
  return {
    status: remaining.length === 0 ? 'terminated' : 'partial',
    terminatedPids,
    remainingPids: remaining.map((processInfo) => processInfo.pid)
  };
}

async function stopRunningChannelProcesses({ channelAppDir, executableName, logger }) {
  const running = await collectRunningChannelProcesses({ channelAppDir, executableName });
  if (running.length === 0) {
    return;
  }

  logger.warn(
    `Stopping running Codex Desktop processes before replacing app files: ${running
      .map((processInfo) => processInfo.pid)
      .join(', ')}`
  );
  for (const processInfo of running) {
    try {
      process.kill(processInfo.pid, 'SIGTERM');
    } catch (error) {
      if (error?.code !== 'ESRCH') {
        logger.warn(`Failed to send SIGTERM to process ${processInfo.pid}: ${error.message}`);
      }
    }
  }

  const stillRunning = await waitForChannelProcessesToExit({ channelAppDir, executableName });
  if (stillRunning.length === 0) {
    return;
  }

  logger.warn(
    `Forcing remaining Codex Desktop processes to stop before install: ${stillRunning
      .map((processInfo) => processInfo.pid)
      .join(', ')}`
  );
  for (const processInfo of stillRunning) {
    try {
      process.kill(processInfo.pid, 'SIGKILL');
    } catch (error) {
      if (error?.code !== 'ESRCH') {
        logger.warn(`Failed to send SIGKILL to process ${processInfo.pid}: ${error.message}`);
      }
    }
  }

  const survivors = await waitForChannelProcessesToExit({
    channelAppDir,
    executableName,
    timeoutMs: 2000
  });
  if (survivors.length > 0) {
    throw new Error(
      `Could not stop running Codex Desktop processes before install: ${survivors
        .map((processInfo) => processInfo.pid)
        .join(', ')}`
    );
  }
}

function extractElectronVersion(appPackage) {
  const rawVersion =
    appPackage?.devDependencies?.electron ??
    appPackage?.dependencies?.electron ??
    FALLBACK_ELECTRON_VERSION;
  const normalizedVersion = String(rawVersion).replace(/^[^\d]*/, '');
  if (!/^\d+\.\d+\.\d+/.test(normalizedVersion)) {
    throw new Error(`Could not determine the upstream Electron version from package metadata: ${rawVersion}`);
  }
  return normalizedVersion.match(/^\d+\.\d+\.\d+/)[0];
}

async function patchBootstrap(extractedAppDir) {
  const bootstrapDir = path.join(extractedAppDir, '.vite', 'build');
  const files = await fs.promises.readdir(bootstrapDir);
  const bootstrapFile = files.find(
    (name) => /^bootstrap[-.].+\.js$/.test(name) || name === 'bootstrap.js'
  );
  if (!bootstrapFile) {
    throw new Error('Could not locate bootstrap.js inside the extracted app bundle.');
  }
  const bootstrapPath = path.join(bootstrapDir, bootstrapFile);
  const original = await fs.promises.readFile(bootstrapPath, 'utf8');
  if (original.includes('if(process.platform===`darwin`){await a.initialize();}')) {
    return {
      status: 'already-applied',
      sourceName: bootstrapFile
    };
  }
  const updated = original.replace(
    /await\s+([A-Za-z_$][\w$]*)\.initialize\(\);/,
    'if(process.platform===`darwin`){await $1.initialize();}'
  );
  if (updated === original) {
    throw new Error('Could not patch bootstrap updater initialization for Linux.');
  }
  await fs.promises.writeFile(bootstrapPath, updated, 'utf8');
  return {
    status: 'applied',
    sourceName: bootstrapFile
  };
}

const LINUX_OPEN_TARGETS_PATCH_MARKER = 'codexLinuxTargets';
const LINUX_MENU_BAR_PATCH_MARKER = 'codexLinuxMenuBarAutoHide';
const LINUX_ABOUT_DIALOG_PATCH_MARKER = 'codexLinuxAboutDialogFallback';
const LINUX_TITLE_BAR_OVERLAY_PATCH_MARKER = 'codexLinuxTitleBarOverlayColors';
const LINUX_TITLE_BAR_OVERLAY_THEME_SYNC_PATCH_MARKER =
  'codexLinuxTitleBarOverlayThemeSync';
const LINUX_NATIVE_WINDOW_FRAME_PATCH_MARKER = 'codexLinuxNativeWindowFrame';
const LINUX_PRIMARY_WINDOW_MODE_CONTROLS_PATCH_MARKER =
  'codexLinuxPrimaryWindowModeControls';
const LINUX_WINDOW_FOCUSABLE_OPTION_PATCH_MARKER = 'codexLinuxWindowFocusableOption';
const LINUX_WINDOW_ICON_PATCH_MARKER = 'codexLinuxWindowIcon';
const LINUX_CLOSE_CANCEL_PATCH_MARKER = 'codexLinuxCloseCancel';
const LINUX_NOTIFICATION_SOUND_PATCH_MARKER = 'codexLinuxNotificationSound';
const LINUX_WORKTREE_ENVIRONMENT_MAIN_PATCH_MARKER = 'codexLinuxWorktreeEnvironmentMain';
const LINUX_WORKTREE_ENVIRONMENT_WORKER_PATCH_MARKER = 'codexLinuxWorktreeEnvironmentWorker';
const LINUX_BROWSER_USE_HOST_FETCH_PATCH_MARKER = 'codexLinuxBrowserUseHostFetch';
const LINUX_BROWSER_USE_RUNTIME_PATHS_PATCH_MARKER = 'codexLinuxBrowserUseRuntimePaths';
const LINUX_BUNDLED_BROWSER_CHROME_PLUGINS_PATCH_MARKER =
  'codexLinuxBundledBrowserChromePlugins';
const LINUX_CHROME_EXTENSION_SETTINGS_PATCH_MARKER = 'codexLinuxChromeExtensionSettings';
const LINUX_CHROME_NATIVE_HOST_RUNTIME_PATHS_PATCH_MARKER =
  'codexLinuxChromeNativeHostRuntimePaths';
const LINUX_OWL_FEATURE_BINDING_PATCH_MARKER = 'codexLinuxOwlFeatureBindingFallback';
const LINUX_REMOTE_CONTROL_PATCH_MARKER = 'codexLinuxRemoteControlFeatureAvailability';
const LINUX_REMOTE_CONTROL_VISIBILITY_PATCH_MARKER =
  'codexLinuxRemoteControlSettingsVisibility';
const LINUX_COMPUTER_USE_UI_PATCH_MARKER = 'codexLinuxComputerUseUiAvailability';
const LINUX_POWER_SAVE_BLOCKER_PATCH_MARKER = 'codexLinuxSystemSleepInhibitor';
const LINUX_REMOTE_CONTROL_KEEP_AWAKE_PATCH_MARKER = 'codexLinuxRemoteControlKeepAwakeSetting';
const LINUX_AVATAR_OVERLAY_PATCH_MARKER = 'codexLinuxAvatarOverlay';
const LINUX_AVATAR_OVERLAY_DRAG_COORDS_PATCH_MARKER =
  'codexLinuxAvatarOverlayScreenPointDrag';
const LINUX_AVATAR_OVERLAY_AUTO_CLOSE_PATCH_MARKER = 'codexLinuxAvatarOverlayAutoClose';
const LINUX_AVATAR_OVERLAY_VISIBILITY_PATCH_MARKER =
  'codexLinuxAvatarOverlayVisibilityRecovery';
const LINUX_PET_YAPPING_USAGE_MAIN_PATCH_MARKER = 'codexLinuxPetYappingUsageProvider';
const LINUX_PET_YAPPING_USAGE_PATCH_MARKER = 'codexLinuxPetYappingUsage';
const OPEN_TARGETS_BLOCK_PATTERN =
  /var (?<targetVar>[A-Za-z_$][\w$]*)=\[(?<targetList>[A-Za-z0-9_$,]+)\],(?<loggerVar>[A-Za-z_$][\w$]*)=(?<loggerObject>[A-Za-z_$][\w$]*)\.(?<loggerFactory>[A-Za-z_$][\w$]*)\(`open-in-targets`\);function (?<platformFn>[A-Za-z_$][\w$]*)\(e\)\{return \k<targetVar>\.flatMap\(t=>\{let n=t\.platforms\[e\];return n\?\[\{id:t\.id,\.\.\.n\}\]:\[\]\}\)\}var (?<platformTargetsVar>[A-Za-z_$][\w$]*)=\k<platformFn>\(process\.platform\),(?<normalizedTargetsVar>[A-Za-z_$][\w$]*)=(?<normalizeFn>[A-Za-z_$][\w$]*)\(\k<platformTargetsVar>\),(?<editorTargetIdsVar>[A-Za-z_$][\w$]*)=new Set\(\k<platformTargetsVar>\.filter\(e=>e\.kind===`editor`\)\.map\(e=>e\.id\)\),(?<stateVar1>[A-Za-z_$][\w$]*)=null,(?<stateVar2>[A-Za-z_$][\w$]*)=null;/;
const OPEN_TARGETS_BLOCK_WEAKMAP_PATTERN =
  /var (?<targetVar>[A-Za-z_$][\w$]*)=\[(?<targetList>[A-Za-z0-9_$,]+)\],(?<loggerVar>[A-Za-z_$][\w$]*)=(?<loggerObject>[A-Za-z_$][\w$]*)\.(?<loggerFactory>[A-Za-z_$][\w$]*)\(`open-in-targets`\);function (?<platformFn>[A-Za-z_$][\w$]*)\(e\)\{return \k<targetVar>\.flatMap\(t=>\{let n=t\.platforms\[e\];return n\?\[\{id:t\.id,\.\.\.n\}\]:\[\]\}\)\}var (?<platformTargetsVar>[A-Za-z_$][\w$]*)=\k<platformFn>\(process\.platform\),(?<normalizedTargetsVar>[A-Za-z_$][\w$]*)=(?<normalizeFn>[A-Za-z_$][\w$]*)\(\k<platformTargetsVar>\),(?<stateVar1>[A-Za-z_$][\w$]*)=new WeakMap,(?<stateVar2>[A-Za-z_$][\w$]*)=new WeakMap,(?<shortcutReaderVar>[A-Za-z_$][\w$]*)=async e=>(?<shortcutReaderObject>[A-Za-z_$][\w$]*)\.shell\.readShortcutLink\(e\);/;
const OPEN_TARGETS_WORKER_REGISTRY_PATTERN =
  /var (?<registryVar>[A-Za-z_$][\w$]*)=new Map\(\[(?<targetList>[A-Za-z0-9_$,]+)\]\.flatMap\(e=>\{let t=e\.platforms\[process\.platform\];return t==null\?\[\]:\[\[e\.id,\{id:e\.id,\.\.\.t\}\]\]\}\)\);/;
const OPEN_TARGETS_DYNAMIC_REGISTRY_PATTERN =
  /var (?<targetVar>[A-Za-z_$][\w$]*)=\[(?<targetList>[A-Za-z0-9_$,]+)\];(?<loggerStatement>[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*\(`open-in-targets`\);)function (?<platformFn>[A-Za-z_$][\w$]*)\(e\)\{return \k<targetVar>\.flatMap\(t=>\{let n=t\.platforms\[e\];return n\?\[\{id:t\.id,\.\.\.n\}\]:\[\]\}\)\}var (?<platformTargetsVar>[A-Za-z_$][\w$]*)=\k<platformFn>\(process\.platform\),(?<shortcutReaderVar>[A-Za-z_$][\w$]*)=async e=>(?<shortcutReaderObject>[A-Za-z_$][\w$]*)\.shell\.readShortcutLink\(e\);/;
const LINUX_CHROME_EXTENSION_PROFILE_DIR_PATTERN =
  /function (?<fn>[A-Za-z_$][\w$]*)\(\{homeDir:(?<homeDirVar>[A-Za-z_$][\w$]*),localAppDataDir:(?<localAppDataVar>[A-Za-z_$][\w$]*),platform:(?<platformVar>[A-Za-z_$][\w$]*)\}\)\{return \k<platformVar>===`darwin`\?(?<joinCall>(?:\(0,[A-Za-z_$][\w$]*\.join\)|join))\(\k<homeDirVar>,`Library`,`Application Support`,`Google`,`Chrome`\):\k<platformVar>===`win32`\?\k<joinCall>\(\k<localAppDataVar>\?\?\k<joinCall>\(\k<homeDirVar>,`AppData`,`Local`\),`Google`,`Chrome`,`User Data`\):null\}/;
const LINUX_CHROME_EXTENSION_URL_HELPER_PATTERN =
  /function (?<urlFn>[A-Za-z_$][\w$]*)\(e\)\{return`(?:chrome:\/\/extensions\/\?id=\$\{[A-Za-z_$][\w$]*\(e\)\}|https:\/\/chromewebstore\.google\.com\/detail\/\$\{e\})`\}/;
const LINUX_CHROME_EXTENSION_OPEN_SETTINGS_PATTERN =
  /async function (?<fn>[A-Za-z_$][\w$]*)\(\{extensionId:(?<extensionIdVar>[A-Za-z_$][\w$]*),platform:(?<platformVar>[A-Za-z_$][\w$]*)=process\.platform,detectChromeCommand:(?<detectVar>[A-Za-z_$][\w$]*)=(?<defaultDetectVar>[A-Za-z_$][\w$]*),runCommand:(?<runVar>[A-Za-z_$][\w$]*)=(?<defaultRunVar>[A-Za-z_$][\w$]*)\}\)\{(?<body>if\(\k<platformVar>===`darwin`\)\{.*?\}if\(\k<platformVar>===`win32`\)\{.*?\})throw Error\(`Opening Chrome extension settings is only supported on macOS and Windows`\)\}/;
const LINUX_OWL_FEATURE_BINDING_PATTERN =
  /function (?<helperFn>[A-Za-z_$][\w$]*)\(\)\{let (?<bindingVar>[A-Za-z_$][\w$]*)=process\._linkedBinding;if\(typeof \k<bindingVar>!=`function`\)throw Error\(`Owl feature binding is unavailable`\);return (?<schemaVar>[A-Za-z_$][\w$]*)\.parse\(\k<bindingVar>\.call\(process,`electron_common_owl_features`\)\)\}/;
const LINUX_OWL_FEATURE_BINDING_NULLABLE_PATTERN =
  /function (?<helperFn>[A-Za-z_$][\w$]*)\(\)\{let (?<bindingVar>[A-Za-z_$][\w$]*)=process\._linkedBinding;if\(typeof \k<bindingVar>!=`function`\)return null;let (?<nativeFeaturesVar>[A-Za-z_$][\w$]*);try\{\k<nativeFeaturesVar>=\k<bindingVar>\.call\(process,(?<featureBindingNameVar>[A-Za-z_$][\w$]*)\)\}catch\((?<errorVar>[A-Za-z_$][\w$]*)\)\{if\((?<missingBindingFn>[A-Za-z_$][\w$]*)\(\k<errorVar>\)\)return null;throw \k<errorVar>\}return (?<schemaVar>[A-Za-z_$][\w$]*)\.parse\(\k<nativeFeaturesVar>\)\}/;
const LINUX_MENU_BAR_AUTO_HIDE_SNIPPET_CURRENT = 'process.platform===`win32`?{autoHideMenuBar:!0}:{}';
const LINUX_MENU_BAR_AUTO_HIDE_SNIPPET_26_609 =
  'process.platform===`win32`||process.platform===`linux`?{autoHideMenuBar:!0}:{}';
const LINUX_MENU_BAR_AUTO_HIDE_REPLACEMENT_CURRENT =
  'process.platform===`win32`?{autoHideMenuBar:!0}:process.platform===`linux`&&process?.env?.CODEX_DESKTOP_DISABLE_LINUX_AUTO_HIDE_MENU_BAR!==`1`?{/* codexLinuxMenuBarAutoHide */autoHideMenuBar:!0}:{}';
const LINUX_ABOUT_DIALOG_CLICK_PATTERN =
  /click:\((?<menuItemVar>[A-Za-z_$][\w$]*),(?<windowVar>[A-Za-z_$][\w$]*)\)=>\{(?<aboutFn>[A-Za-z_$][\w$]*)\(\{buildFlavor:(?<buildFlavorVar>[A-Za-z_$][\w$]*),parent:\k<windowVar> instanceof (?<electronVar>[A-Za-z_$][\w$]*)\.BrowserWindow&&!\k<windowVar>\.isDestroyed\(\)\?\k<windowVar>:null\}\)\}/;
const LINUX_TITLE_BAR_OVERLAY_OPTIONS_PATTERN =
  /function (?<fnName>[A-Za-z_$][\w$]*)\((?<scaleVar>[A-Za-z_$][\w$]*)=1\)\{return\{color:(?<colorVar>[A-Za-z_$][\w$]*),symbolColor:(?<electronVar>[A-Za-z_$][\w$]*)\.nativeTheme\.shouldUseDarkColors\?(?<darkColorVar>[A-Za-z_$][\w$]*):(?<lightColorVar>[A-Za-z_$][\w$]*),height:Math\.round\((?<heightVar>[A-Za-z_$][\w$]*)\*\k<scaleVar>\)\}\}/;
const LINUX_TITLE_BAR_OVERLAY_PATCHED_OPTIONS_PATTERN =
  /function (?<fnName>[A-Za-z_$][\w$]*)\((?<scaleVar>[A-Za-z_$][\w$]*)=1\)\{let codexLinuxTitleBarOverlayEnabled=process\.platform===`linux`&&process\?\.env\?\.CODEX_DESKTOP_DISABLE_LINUX_TITLE_BAR_OVERLAY_PATCH!==`1`,codexLinuxTitleBarOverlayColor=(?<electronVar>[A-Za-z_$][\w$]*)\.nativeTheme\.shouldUseDarkColors\?`#272c36`:`#f9f9f9`,codexLinuxTitleBarOverlaySymbolColor=\k<electronVar>\.nativeTheme\.shouldUseDarkColors\?`#aab2bf`:`#4b5563`;return\{color:codexLinuxTitleBarOverlayEnabled\?codexLinuxTitleBarOverlayColor:(?<colorVar>[A-Za-z_$][\w$]*),symbolColor:codexLinuxTitleBarOverlayEnabled\?codexLinuxTitleBarOverlaySymbolColor:\k<electronVar>\.nativeTheme\.shouldUseDarkColors\?(?<darkColorVar>[A-Za-z_$][\w$]*):(?<lightColorVar>[A-Za-z_$][\w$]*),height:Math\.round\((?<heightVar>[A-Za-z_$][\w$]*)\*\k<scaleVar>\)\}\}\/\* codexLinuxTitleBarOverlayColors \*\//;
const LINUX_TITLE_BAR_OVERLAY_CURRENT_PATCHED_OPTIONS_PATTERN =
  /function (?<fnName>[A-Za-z_$][\w$]*)\((?<scaleVar>[A-Za-z_$][\w$]*)=1,codexLinuxTitleBarOverlayTheme=null\)\{let codexLinuxTitleBarOverlayEnabled=process\.platform===`linux`&&process\?\.env\?\.CODEX_DESKTOP_DISABLE_LINUX_TITLE_BAR_OVERLAY_PATCH!==`1`,codexLinuxTitleBarOverlayColor=codexLinuxTitleBarOverlayTheme\?\.color\?\?\((?<electronVar>[A-Za-z_$][\w$]*)\.nativeTheme\.shouldUseDarkColors\?`#(?:272c36|222222)`:`#f9f9f9`\),codexLinuxTitleBarOverlaySymbolColor=codexLinuxTitleBarOverlayTheme\?\.symbolColor\?\?\(\k<electronVar>\.nativeTheme\.shouldUseDarkColors\?`#(?:aab2bf|c7c7c7)`:`#4b5563`\);return\{color:codexLinuxTitleBarOverlayEnabled\?codexLinuxTitleBarOverlayColor:(?<colorVar>[A-Za-z_$][\w$]*),symbolColor:codexLinuxTitleBarOverlayEnabled\?codexLinuxTitleBarOverlaySymbolColor:\k<electronVar>\.nativeTheme\.shouldUseDarkColors\?(?<darkColorVar>[A-Za-z_$][\w$]*):(?<lightColorVar>[A-Za-z_$][\w$]*),height:Math\.round\((?<heightVar>[A-Za-z_$][\w$]*)\*\k<scaleVar>\)\}\}\/\* codexLinuxTitleBarOverlayColors codexLinuxTitleBarOverlayThemeSync \*\//;
const LINUX_TITLE_BAR_OVERLAY_TRANSPARENT_PATCHED_OPTIONS_PATTERN =
  /function (?<fnName>[A-Za-z_$][\w$]*)\((?<scaleVar>[A-Za-z_$][\w$]*)=1,codexLinuxTitleBarOverlayTheme=null\)\{let codexLinuxTitleBarOverlayEnabled=process\.platform===`linux`&&process\?\.env\?\.CODEX_DESKTOP_DISABLE_LINUX_TITLE_BAR_OVERLAY_PATCH!==`1`,codexLinuxTitleBarOverlaySymbolColor=codexLinuxTitleBarOverlayTheme\?\.symbolColor\?\?\((?<electronVar>[A-Za-z_$][\w$]*)\.nativeTheme\.shouldUseDarkColors\?`#c7c7c7`:`#4b5563`\);return\{color:(?<colorVar>[A-Za-z_$][\w$]*),symbolColor:codexLinuxTitleBarOverlayEnabled\?codexLinuxTitleBarOverlaySymbolColor:\k<electronVar>\.nativeTheme\.shouldUseDarkColors\?(?<darkColorVar>[A-Za-z_$][\w$]*):(?<lightColorVar>[A-Za-z_$][\w$]*),height:Math\.round\((?<heightVar>[A-Za-z_$][\w$]*)\*\k<scaleVar>\)\}\}\/\* codexLinuxTitleBarOverlayColors codexLinuxTitleBarOverlayThemeSync \*\//;
const LINUX_TITLE_BAR_OVERLAY_WINDOW_ZOOM_PATTERN =
  /setWindowZoom\((?<webContentsVar>[A-Za-z_$][\w$]*),(?<zoomVar>[A-Za-z_$][\w$]*)\)\{let (?<windowVar>[A-Za-z_$][\w$]*)=(?<electronVar>[A-Za-z_$][\w$]*)\.BrowserWindow\.fromWebContents\(\k<webContentsVar>\);\k<windowVar>==null\|\|this\.windowAppearances\.get\(\k<windowVar>\.id\)!==`primary`\|\|\(process\.platform===`darwin`\?\k<windowVar>\.setWindowButtonPosition\((?<buttonPositionFn>[A-Za-z_$][\w$]*)\(\k<zoomVar>\)\):\(process\.platform===`win32`\|\|process\.platform===`linux`\)&&\(this\.windowZooms\.set\(\k<windowVar>\.id,\k<zoomVar>\),\k<windowVar>\.setTitleBarOverlay\((?<overlayFn>[A-Za-z_$][\w$]*)\(\k<zoomVar>\)\)\)\)\}/;
const LINUX_TITLE_BAR_OVERLAY_APP_SYNC_PATTERN =
  /installApplicationMenuTitleBarOverlaySync\((?<windowVar>[A-Za-z_$][\w$]*),(?<appearanceVar>[A-Za-z_$][\w$]*)\)\{if\(process\.platform!==`win32`&&process\.platform!==`linux`\|\|\k<appearanceVar>!==`primary`\)return;let (?<handlerVar>[A-Za-z_$][\w$]*)=\(\)=>\{\k<windowVar>\.isDestroyed\(\)\|\|\k<windowVar>\.setTitleBarOverlay\((?<overlayFn>[A-Za-z_$][\w$]*)\(this\.windowZooms\.get\(\k<windowVar>\.id\)\)\)\};return (?<electronVar>[A-Za-z_$][\w$]*)\.nativeTheme\.on\(`updated`,\k<handlerVar>\),\k<handlerVar>\(\),\(\)=>\{\k<electronVar>\.nativeTheme\.off\(`updated`,\k<handlerVar>\)\}\}/;
const LINUX_TITLE_BAR_OVERLAY_MESSAGE_CASE_PATTERN =
  /case`power-save-blocker-set`:this\.updatePowerSaveBlocker\((?<webContentsVar>[A-Za-z_$][\w$]*),(?<messageVar>[A-Za-z_$][\w$]*)\.shouldBlock,\k<messageVar>\.keepRemoteControlAwakeWhilePluggedIn\);break;/;
const LINUX_TITLE_BAR_OVERLAY_EXISTING_MESSAGE_CASE_PATTERN =
  /case`codex-linux-title-bar-overlay-theme-set`:this(?:\.windowManager)?\.codexLinuxSetTitleBarOverlayTheme\((?<webContentsVar>[A-Za-z_$][\w$]*),(?<messageVar>[A-Za-z_$][\w$]*)\);break;(?<powerCase>case`power-save-blocker-set`:this\.updatePowerSaveBlocker\(\k<webContentsVar>,\k<messageVar>\.shouldBlock,\k<messageVar>\.keepRemoteControlAwakeWhilePluggedIn\);break;)/;
const LINUX_NATIVE_WINDOW_FRAME_PRIMARY_BRANCH_PATTERN =
  /(?<platformVar>[A-Za-z_$][\w$]*)===`win32`\|\|\k<platformVar>===`linux`\?\{titleBarStyle:`hidden`,titleBarOverlay:(?<overlayFn>[A-Za-z_$][\w$]*)\((?<zoomVar>[A-Za-z_$][\w$]*)\)\}:\{titleBarStyle:`default`\}/;
const LINUX_PRIMARY_WINDOW_MODE_DISABLE_CONTROLS_PATTERN =
  /(?<windowVar>[A-Za-z_$][\w$]*)\.setResizable\(!1\),\k<windowVar>\.setMaximizable\(!1\),\k<windowVar>\.setFullScreenable\(!1\)/;
const LINUX_WINDOW_FOCUSABLE_OPTION_PATTERN =
  /show:(?<showVar>[A-Za-z_$][\w$]*),parent:(?<parentVar>[A-Za-z_$][\w$]*),focusable:(?<focusableVar>[A-Za-z_$][\w$]*),\.\.\.process\.platform/;
const LINUX_WINDOW_ICON_BROWSER_WINDOW_PATTERN =
  /new (?<electronVar>[A-Za-z_$][\w$]*)\.BrowserWindow\(\{(?<options>width:[\s\S]{0,3000}?)(?<webPreferences>webPreferences:(?:[A-Za-z_$][\w$]*|\{[^}]*\}))\}\);this\.applyWindowBackdrop/;
const LINUX_CLOSE_CANCEL_BEFORE_QUIT_SNIPPET_CURRENT =
  't.app.on(`before-quit`,a=>{if(e||r.canQuitWithoutPrompt()||n){m=!0,i.markAppQuitting();return}let o=t.app.getName();if(t.dialog.showMessageBoxSync({type:`warning`,buttons:[`Quit`,`Cancel`],defaultId:0,cancelId:1,noLink:!0,title:`Quit ${o}?`,message:`Quit ${o}?`,detail:`Any local threads running on this machine will be interrupted and scheduled automations won\'t run`})!==0){a.preventDefault();return}r.markQuitApproved(),m=!0,i.markAppQuitting()})';
const LINUX_CLOSE_CANCEL_BEFORE_QUIT_REPLACEMENT_CURRENT =
  't.app.on(`before-quit`,s=>{if(e||r.canQuitWithoutPrompt()||n){m=!0,i.markAppQuitting();return}let c=t.app.getName();if(t.dialog.showMessageBoxSync({type:`warning`,buttons:[`Quit`,`Cancel`],defaultId:0,cancelId:1,noLink:!0,title:`Quit ${c}?`,message:`Quit ${c}?`,detail:`Any local threads running on this machine will be interrupted and scheduled automations won\'t run`})!==0){s.preventDefault();if(process.platform===`linux`&&process?.env?.CODEX_DESKTOP_DISABLE_LINUX_CLOSE_CANCEL_PATCH!==`1`){let e=i.showLastActivePrimaryWindow();e?a.refresh():Promise.resolve(o(`local`)).then(e=>{e&&!e.isDestroyed()&&(e.isMinimized()&&e.restore(),e.show(),e.focus()),a.refresh()})}return}r.markQuitApproved(),m=!0,i.markAppQuitting()})';
const LINUX_CLOSE_CANCEL_BEFORE_QUIT_SNIPPET_26_422 =
  'n.app.on(`before-quit`,o=>{let s=y_(),c=t.Wn().some(e=>e.status===`ACTIVE`);if(e||i.canQuitWithoutPrompt()||r||!s&&!c){g=!0,a.markAppQuitting();return}let l=n.app.getName();if(n.dialog.showMessageBoxSync({type:`warning`,buttons:[`Quit`,`Cancel`],defaultId:0,cancelId:1,noLink:!0,title:`Quit ${l}?`,message:`Quit ${l}?`,detail:Mb({hasInProgressLocalConversation:s,hasEnabledAutomations:c})})!==0){o.preventDefault();return}i.markQuitApproved(),g=!0,a.markAppQuitting()})';
const LINUX_CLOSE_CANCEL_BEFORE_QUIT_REPLACEMENT_26_422 =
  'n.app.on(`before-quit`,o=>{let s=y_(),c=t.Wn().some(e=>e.status===`ACTIVE`);if(e||i.canQuitWithoutPrompt()||r||!s&&!c){g=!0,a.markAppQuitting();return}let l=n.app.getName();if(n.dialog.showMessageBoxSync({type:`warning`,buttons:[`Quit`,`Cancel`],defaultId:0,cancelId:1,noLink:!0,title:`Quit ${l}?`,message:`Quit ${l}?`,detail:Mb({hasInProgressLocalConversation:s,hasEnabledAutomations:c})})!==0){o.preventDefault();if(process.platform===`linux`&&process?.env?.CODEX_DESKTOP_DISABLE_LINUX_CLOSE_CANCEL_PATCH!==`1`){let e=a.showLastActivePrimaryWindow();e?o.refresh():Promise.resolve(s(`local`)).then(e=>{e&&!e.isDestroyed()&&(e.isMinimized()&&e.restore(),e.show(),e.focus()),o.refresh()})}return}i.markQuitApproved(),g=!0,a.markAppQuitting()})';
const LINUX_CLOSE_CANCEL_BEFORE_QUIT_SNIPPET_26_422_STABLE =
  'n.app.on(`before-quit`,o=>{let s=b_(),c=t.Gn().some(e=>e.status===`ACTIVE`);if(e||i.canQuitWithoutPrompt()||r||!s&&!c){g=!0,a.markAppQuitting();return}let l=n.app.getName();if(n.dialog.showMessageBoxSync({type:`warning`,buttons:[`Quit`,`Cancel`],defaultId:0,cancelId:1,noLink:!0,title:`Quit ${l}?`,message:`Quit ${l}?`,detail:Nb({hasInProgressLocalConversation:s,hasEnabledAutomations:c})})!==0){o.preventDefault();return}i.markQuitApproved(),g=!0,a.markAppQuitting()})';
const LINUX_CLOSE_CANCEL_BEFORE_QUIT_REPLACEMENT_26_422_STABLE =
  'n.app.on(`before-quit`,o=>{let s=b_(),c=t.Gn().some(e=>e.status===`ACTIVE`);if(e||i.canQuitWithoutPrompt()||r||!s&&!c){g=!0,a.markAppQuitting();return}let l=n.app.getName();if(n.dialog.showMessageBoxSync({type:`warning`,buttons:[`Quit`,`Cancel`],defaultId:0,cancelId:1,noLink:!0,title:`Quit ${l}?`,message:`Quit ${l}?`,detail:Nb({hasInProgressLocalConversation:s,hasEnabledAutomations:c})})!==0){o.preventDefault();if(process.platform===`linux`&&process?.env?.CODEX_DESKTOP_DISABLE_LINUX_CLOSE_CANCEL_PATCH!==`1`){let e=a.showLastActivePrimaryWindow();e?o.refresh():Promise.resolve(s(`local`)).then(e=>{e&&!e.isDestroyed()&&(e.isMinimized()&&e.restore(),e.show(),e.focus()),o.refresh()})}return}i.markQuitApproved(),g=!0,a.markAppQuitting()})';
const LINUX_CLOSE_CANCEL_BEFORE_QUIT_SNIPPET_26_429 =
  'n.app.on(`before-quit`,o=>{let s=Pw(),c=t.Yn().some(e=>e.status===`ACTIVE`);if(e||i.canQuitWithoutPrompt()||r||!s&&!c){g=!0,a.markAppQuitting();return}let l=n.app.getName();if(n.dialog.showMessageBoxSync({type:`warning`,buttons:[`Quit`,`Cancel`],defaultId:0,cancelId:1,noLink:!0,title:`Quit ${l}?`,message:`Quit ${l}?`,detail:ED({hasInProgressLocalConversation:s,hasEnabledAutomations:c})})!==0){o.preventDefault();return}i.markQuitApproved(),g=!0,a.markAppQuitting()})';
const LINUX_CLOSE_CANCEL_BEFORE_QUIT_REPLACEMENT_26_429 =
  'n.app.on(`before-quit`,o=>{let s=Pw(),c=t.Yn().some(e=>e.status===`ACTIVE`);if(e||i.canQuitWithoutPrompt()||r||!s&&!c){g=!0,a.markAppQuitting();return}let l=n.app.getName();if(n.dialog.showMessageBoxSync({type:`warning`,buttons:[`Quit`,`Cancel`],defaultId:0,cancelId:1,noLink:!0,title:`Quit ${l}?`,message:`Quit ${l}?`,detail:ED({hasInProgressLocalConversation:s,hasEnabledAutomations:c})})!==0){o.preventDefault();if(process.platform===`linux`&&process?.env?.CODEX_DESKTOP_DISABLE_LINUX_CLOSE_CANCEL_PATCH!==`1`){let e=a.showLastActivePrimaryWindow();e?(e.isMinimized()&&e.restore(),e.show(),e.focus()):Promise.resolve(s(`local`)).then(e=>{e&&!e.isDestroyed()&&(e.isMinimized()&&e.restore(),e.show(),e.focus())})}return}i.markQuitApproved(),g=!0,a.markAppQuitting()})';
const LINUX_CLOSE_CANCEL_BEFORE_QUIT_GENERIC_PATTERN =
  /(?<prefix>[A-Za-z_$][\w$]*\.app\.on\(`before-quit`,(?<eventVar>[A-Za-z_$][\w$]*)=>\{[\s\S]*?buttons:\[`Quit`,`Cancel`\][\s\S]*?\{)\k<eventVar>\.preventDefault\(\);return(?<suffix>\}[\s\S]*?,[A-Za-z_$][\w$]*\.app\.on\(`activate`,\(\)=>\{[A-Za-z_$][\w$]*\|\|\((?<windowsVar>[A-Za-z_$][\w$]*)\.showLastActivePrimaryWindow\(\)\|\|(?<ensureWindowCall>[A-Za-z_$][\w$]*\((?:`local`)?\)),[A-Za-z_$][\w$]*\.refresh\(\)\)\}\))/;
const LINUX_NOTIFICATION_SOUND_SHOW_PATTERN =
  /(?<showVar>[A-Za-z_$][\w$]*)\.show\(\)\}stageNotificationSoundIfNeeded\(\)\{/;
const LINUX_NOTIFICATION_SOUND_CHILD_PROCESS_PATTERN =
  /(?<childProcessVar>[A-Za-z_$][\w$]*)=require\(`node:child_process`\)/;
const LINUX_WORKTREE_ENVIRONMENT_MAIN_HELPER_PATTERN =
  /var (?<thresholdVar>[A-Za-z_$][\w$]*)=32e3,(?<loggerVar>[A-Za-z_$][\w$]*)=(?<loggerObject>[A-Za-z_$][\w$]*)\.(?<loggerFactory>[A-Za-z_$][\w$]*)\(`worktree-service`\),(?<classVar>[A-Za-z_$][\w$]*)=class\{/;
const LINUX_WORKTREE_ENVIRONMENT_PENDING_REQUEST_PATTERN =
  /let (?<resultVar>[A-Za-z_$][\w$]*)=await this\.requestGitWorker\(\{method:`create-worktree`,params:\{hostConfig:this\.options\.hostConfig,(?<operationSource>operationSource:`[^`]+`,)?cwd:(?<pathModuleVar>[A-Za-z_$][\w$]*)\.(?<pathResolver>[A-Za-z_$][\w$]*)\((?<entryVar>[A-Za-z_$][\w$]*)\.sourceWorkspaceRoot\),startingState:\k<entryVar>\.startingState,localEnvironmentConfigPath:\k<entryVar>\.localEnvironmentConfigPath,streamId:(?<runtimeVar>[A-Za-z_$][\w$]*)\.streamId,(?<allowSetupFailure>allowSetupFailure:!0,)?setUpSyncedBranch:\k<entryVar>\.launchMode===`create-stable-worktree`\?!1:void 0\},signal:\k<runtimeVar>\.abortController\.signal\}\);/;
const LINUX_WORKTREE_ENVIRONMENT_PENDING_READY_LOG_REPLACEMENT_CURRENT =
  'hasLocalEnvironment:codexLinuxResolvedLocalEnvironmentPath!=null&&codexLinuxResolvedLocalEnvironmentPath!==`__none__`';
const LINUX_WORKTREE_ENVIRONMENT_MANAGED_REQUEST_PATTERN =
  /let (?<resultVar>[A-Za-z_$][\w$]*)=await this\.requestGitWorker\(\{method:`create-worktree`,params:\{hostConfig:this\.options\.getHostConfigForHostId\((?<hostVar>[A-Za-z_$][\w$]*)\),(?<operationSource>operationSource:`[^`]+`,)?cwd:(?<pathModuleVar>[A-Za-z_$][\w$]*)\.(?<pathResolver>[A-Za-z_$][\w$]*)\((?<cwdVar>[A-Za-z_$][\w$]*)\),startingState:(?<startingStateVar>[A-Za-z_$][\w$]*),localEnvironmentConfigPath:(?<envVar>[A-Za-z_$][\w$]*),streamId:(?<streamVar>[A-Za-z_$][\w$]*)\}\}\),(?<newbornVar>[A-Za-z_$][\w$]*)=this\.newbornWorktreeRoots\.has\(\k<resultVar>\.worktreeGitRoot\);/;
const LINUX_WORKTREE_ENVIRONMENT_MANAGED_READY_LOG_REPLACEMENT_CURRENT =
  'hasLocalEnvironment:codexLinuxResolvedLocalEnvironmentPath!=null&&codexLinuxResolvedLocalEnvironmentPath!==`__none__`';
const LINUX_WORKTREE_ENVIRONMENT_WORKER_HELPER_PATTERN =
  /async function (?<createWorktreeFn>[A-Za-z_$][\w$]*)\(\{gitManager:e,workspaceRoot:t,startingState:n,localEnvironmentConfigPath:r,(?<allowSetupFailureParam>allowSetupFailure:[A-Za-z_$][\w$]*=!1,)?setUpSyncedBranch:(?<setUpSyncedBranchVar>[A-Za-z_$][\w$]*)=!0,(?<clientParamName>appServerClient|host):(?<appServerClientVar>[A-Za-z_$][\w$]*),signal:(?<signalVar>[A-Za-z_$][\w$]*),onLog:(?<onLogVar>[A-Za-z_$][\w$]*),onWorktreePathAllocated:(?<onWorktreePathAllocatedVar>[A-Za-z_$][\w$]*)(?<onSetupStartParam>,onSetupStart:[A-Za-z_$][\w$]*)?\}\)\{/;
const LINUX_WORKTREE_ENVIRONMENT_WORKER_CLEANUP_HELPER_PATTERN =
  /async function (?<cleanupFn>[A-Za-z_$][\w$]*)\(e,t,n,r,i\)\{return\(await (?<environmentRunnerFn>[A-Za-z_$][\w$]*)\(\{workspaceRoot:e,localEnvironment:t,scriptType:`cleanup`,(?<clientParamName>appServerClient|host):i,onLog:n,signal:r\}\)\)\?\.setupResult\?\?null\}/;
const LINUX_WORKTREE_ENVIRONMENT_WORKER_CREATE_PATTERN =
  /if\((?<onLogVar>[A-Za-z_$][\w$]*)\?\.\(`info`,(?<logEncodeFn>[A-Za-z_$][\w$]*(?:\.Buffer\.from|\.encode))\(`Worktree created at \$\{(?<worktreeWorkspaceRootVar>[A-Za-z_$][\w$]*)\}(?:\\n|\n)`(?:,`utf8`)?\)\),await (?<storeEnvFn>[A-Za-z_$][\w$]*)\(\k<worktreeWorkspaceRootVar>,(?<selectedVar>[A-Za-z_$][\w$]*)\?\?`__none__`,(?<appServerClientVar>[A-Za-z_$][\w$]*),`worktree`,(?<signalVar>[A-Za-z_$][\w$]*)\)\|\|\k<onLogVar>\?\.\(`stderr`,[A-Za-z_$][\w$]*(?:\.Buffer\.from|\.encode)\(`Failed to store selected environment in git config(?:\\n|\n)`(?:,`utf8`)?\)\),\k<selectedVar>==null\)return \k<onLogVar>\?\.\(`info`,[A-Za-z_$][\w$]*(?:\.Buffer\.from|\.encode)\(`No local environment selected(?:\\n|\n)`(?:,`utf8`)?\)\),\{success:!0,worktreeGitRoot:(?<worktreeGitRootVar>[A-Za-z_$][\w$]*),worktreeWorkspaceRoot:\k<worktreeWorkspaceRootVar>,setupResult:null(?<emptySetupError>,setupError:null)?\};(?<preReadSetupStartCall>[A-Za-z_$][\w$]*\?\.\(\);)?let (?<environmentVar>[A-Za-z_$][\w$]*)=await (?<readEnvironmentFn>[A-Za-z_$][\w$]*)\(\k<selectedVar>,\k<appServerClientVar>\);/;
const LINUX_WORKTREE_ENVIRONMENT_WORKER_CLEANUP_CALL_PATTERN =
  /let (?<cleanupResultVar>[A-Za-z_$][\w$]*)=await (?<cleanupFn>[A-Za-z_$][\w$]*)\(e,a,void 0,r,n\);/;
const LINUX_WORKTREE_ENVIRONMENT_WORKER_DELETE_CLEANUP_FUNCTION_PATTERN =
  /async function (?<deleteCleanupFn>[A-Za-z_$][\w$]*)\(e,t,n,r\)\{let i=await [A-Za-z_$][\w$]*\(e,n,`worktree`,r\);[\s\S]*?let [A-Za-z_$][\w$]*=await (?<cleanupFn>[A-Za-z_$][\w$]*)\(e,a,void 0,r,n\);/;
const LINUX_WORKTREE_ENVIRONMENT_WORKER_MOVE_TO_LOCAL_SUCCESS_PATTERN =
  /else (?<progressVar>[A-Za-z_$][\w$]*)\?\.\(`apply-changes-to-local`,`skipped`\);return (?<resultFactory>[A-Za-z_$][\w$]*)\(\{status:`success`,warnings:(?<warningsVar>[A-Za-z_$][\w$]*)\}\)/;
const LINUX_WORKTREE_ENVIRONMENT_WORKER_CLEANUP_SKIP_SNIPPET_CURRENT =
  'if(i==null||i===`__none__`)return;';
const BROWSER_USE_HOST_FETCH_HELPER_ANCHOR_PATTERN =
  /function (?<stateFactory>[A-Za-z_$][\w$]*)\(\)\{return\{apiImpl:null,server:null,starting:null\}\}var (?<registryClass>[A-Za-z_$][\w$]*)=class\{/;
const BROWSER_USE_HOST_FETCH_INLINE_STATE_PATTERN =
  /backendState=\{apiImpl:null,server:null,starting:null\}/;
const BROWSER_USE_AUTH_HEADER_HELPER_PATTERN =
  /(?:async )?function (?<authHeaderFn>[A-Za-z_$][\w$]*)\(\{action:e,appServerClient:t,desktopOriginator:n,headers:[A-Za-z_$][\w$]*=\{\},refreshToken:[A-Za-z_$][\w$]*=!1\}\)\{(?=[\s\S]*?getAuthToken)[\s\S]*?\}(?=function|var)/;
const BROWSER_USE_ELECTRON_REQUIRE_PATTERN =
  /let (?<electronVar>[A-Za-z_$][\w$]*)=require\(`electron`\);/;
const BROWSER_USE_DESKTOP_ORIGINATOR_OPTIONS_PATTERN =
  /desktopOriginator:(?<desktopOriginatorVar>[A-Za-z_$][\w$]*),devApiBaseUrl:/;
const BROWSER_USE_DESKTOP_ORIGINATOR_LEGACY_PATTERN =
  /var (?<desktopOriginatorVar>[A-Za-z_$][\w$]*)=`desktop`/;
const BROWSER_USE_IAB_API_PING_ANCHOR_PATTERN =
  /(?<className>[A-Za-z_$][\w$]*)=class\{(?<fields>[\s\S]*?constructor\(e,t,n=\{\}\)\{[\s\S]*?\})ping\(\)\{return`pong`\}/;
const BROWSER_USE_IAB_REGISTRY_OPTIONS_PATTERN =
  /new (?<className>[A-Za-z_$][\w$]*)\((?<getHostArg>t=>this\.canServeTurnForBrowserRoute\(t,e\)\?this\.getBrowserUseHost\(t\):null),(?<blockedArg>e=>this\.getDelegate\(\)\.addBrowserUseNavigationBlockedListener\(e\)),\{(?<options>appSessionId:this\.options\.appSessionId,browserRoute:e,buildFlavor:this\.options\.buildFlavor,canServeRoute:t=>this\.canServeTurnForBrowserRoute\(t,e\))\}\)/;
const BROWSER_USE_IAB_REGISTRY_OPTIONS_26_527_PATTERN =
  /new (?<className>[A-Za-z_$][\w$]*)\((?<getHostArg>e=>this\.ensureSessionRoute\(e\)\?this\.getBrowserUseHost\(e\):null),(?<blockedArg>e=>this\.getDelegate\(\)\.addBrowserUseNavigationBlockedListener\(e\)),\{(?<options>appSessionId:this\.options\.appSessionId,buildFlavor:this\.options\.buildFlavor,ensureSessionRoute:e=>this\.ensureSessionRoute\(e\)(?:,getTabMode:e=>this\.getRouteTabMode\(this\.resolveBrowserRoute\(e\)\))?)\}\)/;
const BROWSER_USE_IAB_REGISTRY_OPTIONS_26_616_PATTERN =
  /new (?<className>[A-Za-z_$][\w$]*)\((?<getHostArg>(?<routeVar>[A-Za-z_$][\w$]*)=>this\.canServeSession\(\k<routeVar>,(?<sessionVar>[A-Za-z_$][\w$]*),(?<stateVar>[A-Za-z_$][\w$]*)\)\?this\.getBrowserUseHost\(\k<routeVar>\):null),(?<blockedArg>[A-Za-z_$][\w$]*=>this\.getDelegate\(\)\.addBrowserUseNavigationBlockedListener\([A-Za-z_$][\w$]*\)),\{(?<options>appSessionId:this\.options\.appSessionId,buildFlavor:this\.options\.buildFlavor,ensureSessionRoute:[A-Za-z_$][\w$]*=>this\.canServeSession\([A-Za-z_$][\w$]*,\k<sessionVar>,\k<stateVar>\),getTabMode:[A-Za-z_$][\w$]*=>this\.tabModesByRouteKey\.get\([A-Za-z_$][\w$]*\)\?\?`singleTab`)\}\)/;
const BROWSER_SESSION_REGISTRY_INSTANTIATION_PATTERN =
  /this\.browserSessionRegistry=new (?<registryClass>[A-Za-z_$][\w$]*)\(\{appSessionId:(?<appSessionId>[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?),buildFlavor:(?<buildFlavor>[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?),errorReporter:this\.errorReporter\}\)/;
const BROWSER_USE_RUNTIME_PATHS_FUNCTION_PATTERN =
  /function (?<fn>[A-Za-z_$][\w$]*)\(\{env:[A-Za-z_$][\w$]*=process\.env,isPackaged:[A-Za-z_$][\w$]*=!0,platform:[A-Za-z_$][\w$]*=process\.platform,repoRoot:[A-Za-z_$][\w$]*=process\.cwd\(\),resolveCodexPath:[A-Za-z_$][\w$]*=[^,]+,resolveNodePath:[A-Za-z_$][\w$]*=[^,]+,resolveNodeReplPath:[A-Za-z_$][\w$]*=[^,]+,resolvePrimaryRuntimeNodePath:[A-Za-z_$][\w$]*=[^,]+,resourcesPath:(?<resourcesArg>[A-Za-z_$][\w$]*)\}\)\{let (?<resourcesVar>[A-Za-z_$][\w$]*)=\k<resourcesArg>\?\?/;
const BROWSER_USE_RUNTIME_PATHS_RETURN_PATTERN =
  /return\{codexCliPath:(?<codexCliPath>[^,]+),codexCliPathSource:(?<codexCliPathSource>[^,]+),nodeModuleDirs:(?<nodeModuleDirs>[^,]+),nodePath:(?<nodePath>[^,]+),nodePathSource:(?<nodePathSource>[^,]+),nodeReplPath:(?<nodeReplPath>[^,]+),nodeReplPathSource:(?<nodeReplPathSource>[^,]+),platform:(?<platform>[^}]+)\}\}/;
const BUNDLED_PLUGIN_RECONCILER_ANCHOR_PATTERN =
  /var (?<loggerVar>[A-Za-z_$][\w$]*)=(?<loggerObject>[A-Za-z_$][\w$]*)\.(?<loggerFactory>[A-Za-z_$][\w$]*)\(`bundled-plugins`\),(?<devFlagVar>[A-Za-z_$][\w$]*)=`CODEX_ENABLE_DEV_BUNDLED_PLUGINS`(?<extraDeclarations>(?:,[^;]+)?);function (?<fn>[A-Za-z_$][\w$]*)\(e\)\{/;
const BUNDLED_PLUGIN_RECONCILER_CONTEXT_PATTERN =
  /function [A-Za-z_$][\w$]*\(e\)\{let (?<envVar>[A-Za-z_$][\w$]*)=e\.env\?\?process\.env,(?<resourcesVar>[A-Za-z_$][\w$]*)=e\.resourcesPath\?\?[A-Za-z_$][\w$]*\(\{env:\k<envVar>\}\)[\s\S]{0,3000}?,(?<platformVar>[A-Za-z_$][\w$]*)=e\.platform\?\?process\.platform;/;
const BUNDLED_PLUGIN_DESCRIPTOR_SELECTOR_PATTERN =
  /(?<selectorVar>[A-Za-z_$][\w$]*)=(?<featuresVar>[A-Za-z_$][\w$]*)=>(?<descriptorsVar>[A-Za-z_$][\w$]*)\.filter\((?<itemVar>[A-Za-z_$][\w$]*)=>\k<itemVar>\.isAvailable\(\{buildFlavor:e\.buildFlavor,env:(?<envVar>[A-Za-z_$][\w$]*),features:\k<featuresVar>,platform:(?<platformVar>[A-Za-z_$][\w$]*)\}\)\)/;
const BUNDLED_PLUGIN_MARKETPLACE_FILTER_26_609_PATTERN =
  /async function (?<fn>[A-Za-z_$][\w$]*)\(e\)\{let (?<marketplaceVar>[A-Za-z_$][\w$]*)=\{\.\.\.(?<filterFn>[A-Za-z_$][\w$]*)\(\{marketplacePluginNames:e\.marketplacePluginNames,marketplace:await (?<readMarketplaceFn>[A-Za-z_$][\w$]*)\(e\.sourceMarketplaceRoot\)\}\),name:e\.marketplaceName\},(?<stagingVar>[A-Za-z_$][\w$]*)=/;
const CHROME_NATIVE_HOST_RUNTIME_PATHS_REGISTRATION_PATTERN =
  /async function (?<fn>[A-Za-z_$][\w$]*)\((?<arg>[A-Za-z_$][\w$]*)\)\{let (?<targetVar>[A-Za-z_$][\w$]*)=(?<targetFn>[A-Za-z_$][\w$]*)\(\),(?<runtimeVar>[A-Za-z_$][\w$]*)=(?<runtimeFn>[A-Za-z_$][\w$]*)\(\{devRuntimeRepoRoot:\k<arg>\.devRuntimeRepoRoot,nativeHostName:\k<arg>\.nativeHostName,resourcesPath:\k<arg>\.resourcesPath\}\),(?<hostVar>[A-Za-z_$][\w$]*)=await (?<installFn>[A-Za-z_$][\w$]*)\(/;
const CHROME_NATIVE_HOST_RUNTIME_PATHS_RETURN_26_616_PATTERN =
  /return\{codexCliPath:await (?<copyCliFn>[A-Za-z_$][\w$]*)\(\{codexCliPath:(?<codexCliVar>[A-Za-z_$][\w$]*),codexHome:(?<arg>[A-Za-z_$][\w$]*)\.codexHome,nativeHostName:\k<arg>\.nativeHostName\}\),nodePath:(?<nodeVar>[A-Za-z_$][\w$]*),nodeModuleDirs:(?<nodeModuleDirsFn>[A-Za-z_$][\w$]*)\(\k<arg>\.resourcesPath\),nodeReplPath:(?<nodeReplVar>[A-Za-z_$][\w$]*)\}/;
const LINUX_REMOTE_CONTROL_FEATURE_AVAILABILITY_PATTERN =
  /function (?<fnName>[A-Za-z_$][\w$]*)\((?<featuresVar>[A-Za-z_$][\w$]*),\{env:(?<envVar>[A-Za-z_$][\w$]*)=process\.env,platform:(?<platformVar>[A-Za-z_$][\w$]*)=process\.platform\}=\{\}\)\{return \k<platformVar>!==`win32`\|\|\k<envVar>\.CODEX_ELECTRON_ENABLE_WINDOWS_COMPUTER_USE!==`1`\?\k<featuresVar>:\{\.\.\.\k<featuresVar>,computerUse:!0,computerUseNodeRepl:!0\}\}/;
const LINUX_REMOTE_CONTROL_FEATURE_AVAILABILITY_WITH_OVERRIDES_PATTERN =
  /function (?<fnName>[A-Za-z_$][\w$]*)\((?<featuresVar>[A-Za-z_$][\w$]*),\{buildFlavor:(?<buildFlavorVar>[A-Za-z_$][\w$]*)=(?<buildFlavorDefault>[^,]+),env:(?<envVar>[A-Za-z_$][\w$]*)=(?<envDefault>[^,]+),platform:(?<platformVar>[A-Za-z_$][\w$]*)=(?<platformDefault>[^}]+)\}=\{\}\)\{let (?<computedVar>[A-Za-z_$][\w$]*)=\k<platformVar>===`win32`&&\k<envVar>\.CODEX_ELECTRON_ENABLE_WINDOWS_COMPUTER_USE===`1`\?\{\.\.\.\k<featuresVar>,computerUse:!0,computerUseNodeRepl:!0\}:\k<featuresVar>,(?<overridesVar>[A-Za-z_$][\w$]*)=(?<overrideExpr>[^;]+);return \k<overridesVar>==null\?\k<computedVar>:\{\.\.\.\k<computedVar>,\.\.\.\k<overridesVar>\}\}/;
const LINUX_REMOTE_CONTROL_FEATURE_AVAILABILITY_WITH_DEVICE_ATTESTATION_PATTERN =
  /function (?<fnName>[A-Za-z_$][\w$]*)\((?<featuresVar>[A-Za-z_$][\w$]*),\{buildFlavor:(?<buildFlavorVar>[A-Za-z_$][\w$]*)=(?<buildFlavorDefault>[^,]+),env:(?<envVar>[A-Za-z_$][\w$]*)=(?<envDefault>[^,]+),platform:(?<platformVar>[A-Za-z_$][\w$]*)=(?<platformDefault>[^}]+)\}=\{\}\)\{let (?<computedVar>[A-Za-z_$][\w$]*)=\k<platformVar>===`win32`&&\k<envVar>\.CODEX_ELECTRON_ENABLE_WINDOWS_COMPUTER_USE===`1`\?\{\.\.\.\k<featuresVar>,computerUse:!0,computerUseNodeRepl:!0\}:\k<featuresVar>,(?<overridesVar>[A-Za-z_$][\w$]*)=(?<overrideExpr>[^;]+);return \k<overridesVar>==null\?\{\.\.\.\k<computedVar>,deviceAttestation:(?<deviceFn>[A-Za-z_$][\w$]*)\(\{platform:\k<platformVar>\}\)\}:\{\.\.\.\k<computedVar>,\.\.\.\k<overridesVar>,deviceAttestation:\k<deviceFn>\(\{platform:\k<platformVar>\}\)\}\}/;
const LINUX_REMOTE_CONTROL_FEATURE_AVAILABILITY_WITH_MAC_NODE_REPL_PATTERN =
  /function (?<fnName>[A-Za-z_$][\w$]*)\((?<featuresVar>[A-Za-z_$][\w$]*),\{buildFlavor:(?<buildFlavorVar>[A-Za-z_$][\w$]*)=(?<buildFlavorDefault>[^,]+),env:(?<envVar>[A-Za-z_$][\w$]*)=(?<envDefault>[^,]+),platform:(?<platformVar>[A-Za-z_$][\w$]*)=(?<platformDefault>[^}]+)\}=\{\}\)\{let (?<macVar>[A-Za-z_$][\w$]*)=\k<platformVar>===`darwin`&&!(?<internalFn>[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\(\k<buildFlavorVar>\)&&\k<featuresVar>\.computerUseNodeRepl!=null\?\{\.\.\.\k<featuresVar>,computerUseNodeRepl:!1\}:\k<featuresVar>,(?<windowsNodeReplVar>[A-Za-z_$][\w$]*)=\k<platformVar>===`win32`&&\k<featuresVar>\.computerUse===!0\?\{\.\.\.\k<macVar>,computerUseNodeRepl:!0\}:\k<macVar>,(?<computedVar>[A-Za-z_$][\w$]*)=\k<platformVar>===`win32`&&\k<envVar>\.CODEX_ELECTRON_ENABLE_WINDOWS_COMPUTER_USE===`1`\?\{\.\.\.\k<windowsNodeReplVar>,computerUse:!0,computerUseNodeRepl:!0\}:\k<windowsNodeReplVar>,(?<overridesVar>[A-Za-z_$][\w$]*)=(?<overrideExpr>[^;]+);return \k<overridesVar>==null\?\{\.\.\.\k<computedVar>,deviceAttestation:(?<deviceFn>[A-Za-z_$][\w$]*)\(\{platform:\k<platformVar>\}\)\}:\{\.\.\.\k<computedVar>,\.\.\.\k<overridesVar>,deviceAttestation:\k<deviceFn>\(\{platform:\k<platformVar>\}\)\}\}/;
const LINUX_REMOTE_CONTROL_VISIBILITY_PATTERN =
  /function (?<fnName>[A-Za-z_$][\w$]*)\(\{remoteControlConnectionsState:(?<stateVar>[A-Za-z_$][\w$]*),slingshotEnabled:(?<flagVar>[A-Za-z_$][\w$]*)\}\)\{return \k<flagVar>&&\(\k<stateVar>\?\.available\?\?!0\)&&\k<stateVar>\?\.accessRequired!==!0\}/;
const LINUX_POWER_SAVE_BLOCKER_SYNC_PATTERN =
  /syncPowerSaveBlocker\(\)\{let (?<activeVar>[A-Za-z_$][\w$]*)=this\.powerSaveBlockingWebContentsIds\.size>0\|\|!(?<electronVar>[A-Za-z_$][\w$]*)\.powerMonitor\.isOnBatteryPower\(\)&&this\.pluggedInRemoteControlPowerSaveWebContentsIds\.size>0;if\(\k<activeVar>&&this\.powerSaveBlockerId==null\)\{this\.powerSaveBlockerId=\k<electronVar>\.powerSaveBlocker\.start\(`prevent-app-suspension`\);return\}!\k<activeVar>&&this\.powerSaveBlockerId!=null&&\(\k<electronVar>\.powerSaveBlocker\.stop\(this\.powerSaveBlockerId\),this\.powerSaveBlockerId=null\)\}/;
const LINUX_REMOTE_CONTROL_KEEP_AWAKE_DISPATCH_PATTERN =
  /(?<prefix>\{data:(?<preventVar>[A-Za-z_$][\w$]*)\}=[A-Za-z_$][\w$]*\([A-Za-z_$][\w$]*\.PREVENT_SLEEP_WHILE_RUNNING\),\{data:(?<keepVar>[A-Za-z_$][\w$]*)\}=[A-Za-z_$][\w$]*\([A-Za-z_$][\w$]*\.KEEP_REMOTE_CONTROL_AWAKE_WHILE_PLUGGED_IN\)[\s\S]*?keepRemoteControlAwakeWhilePluggedIn:)!!\k<keepVar>&&(?<enabledVar>[A-Za-z_$][\w$]*)/;
const LINUX_REMOTE_CONTROL_KEEP_AWAKE_CURRENT_DISPATCH_PATTERN =
  /power-save-blocker-set`[\s\S]*?shouldBlock:!![A-Za-z_$][\w$]*&&[A-Za-z_$][\w$]*\([A-Za-z_$][\w$]*\)[\s\S]*?keepRemoteControlAwakeWhilePluggedIn:!![A-Za-z_$][\w$]*&&[A-Za-z_$][\w$]*/;
const LINUX_COMPUTER_USE_UI_HOST_PLATFORM_PATTERN =
  /function (?<fnName>[A-Za-z_$][\w$]*)\((?<platformVar>[A-Za-z_$][\w$]*)\)\{return \k<platformVar>===`macOS`\|\|\k<platformVar>===`windows`\}/;
const LINUX_COMPUTER_USE_UI_AVAILABILITY_CALL_PATTERN =
  /(?<assignmentVar>[A-Za-z_$][\w$]*)=(?<availabilityFn>[A-Za-z_$][\w$]*)\(\{areRequiredFeaturesEnabled:(?<requiredVar>[A-Za-z_$][\w$]*),enabled:(?<enabledVar>[A-Za-z_$][\w$]*),isAnyFeatureLoading:(?<loadingVar>[A-Za-z_$][\w$]*),isComputerUseGateEnabled:(?<gateVar>[A-Za-z_$][\w$]*),isHostCompatiblePlatform:(?<platformFn>[A-Za-z_$][\w$]*)\((?<platformVar>[A-Za-z_$][\w$]*)\),isPlatformLoading:(?<platformLoadingVar>[A-Za-z_$][\w$]*),windowType:`electron`\}\)/;
const LINUX_AVATAR_OVERLAY_CREATE_FRONTMOST_PATTERN =
  /process\.platform===`darwin`\?(?<windowVar>[A-Za-z_$][\w$]*)\.setVisibleOnAllWorkspaces\(!0,\{visibleOnFullScreen:!0,skipTransformProcessType:!0\}\):\k<windowVar>\.setVisibleOnAllWorkspaces\(!0\),\k<windowVar>\.setAlwaysOnTop\(!0,`floating`\),\k<windowVar>\.setMenuBarVisibility\(!1\)/;
const LINUX_AVATAR_OVERLAY_CREATE_WINDOW_END_PATTERN =
  /\}\),(?<windowVar>[A-Za-z_$][\w$]*)\}positionWindow\((?<positionArgs>[A-Za-z_$][\w$]*,[A-Za-z_$][\w$]*)\)\{/;
const LINUX_AVATAR_OVERLAY_SHOW_WINDOW_PATTERN =
  /showWindow\((?<windowVar>[A-Za-z_$][\w$]*)\)\{if\(\k<windowVar>\.isDestroyed\(\)\)return;let (?<wasOpenVar>[A-Za-z_$][\w$]*)=this\.isOpen\(\);(?<revealExpr>this\.[A-Za-z_$][\w$]*&&=\(\k<windowVar>\.setOpacity\(1\),!1\),)?\k<windowVar>\.moveTop\(\),\k<windowVar>\.showInactive\(\),!\k<wasOpenVar>&&this\.isOpen\(\)&&(?<openStateExpr>(?:\(this\.finishPendingPresentation\(\),this\.broadcastOpenState\(\)\)|this\.broadcastOpenState\(\)))(?<postOpenExpr>;let (?<pendingPresentationVar>[A-Za-z_$][\w$]*)=this\.pendingPresentation;\k<pendingPresentationVar>!=null&&\(this\.pendingPresentation=null,\k<pendingPresentationVar>\.velocity==null\?\(this\.dockRestoreAnchor=\k<pendingPresentationVar>\.target,this\.animatePresentationTo\(\k<pendingPresentationVar>\.target,[A-Za-z_$][\w$]*\(this\.anchor,\k<pendingPresentationVar>\.target\),\(\)=>\{this\.dockRestoreAnchor===\k<pendingPresentationVar>\.target&&\(this\.dockRestoreAnchor=null\)\}\)\):this\.startMomentum\(\k<pendingPresentationVar>\.velocity\.x,\k<pendingPresentationVar>\.velocity\.y,!0\)\))?\}/;
const LINUX_AVATAR_OVERLAY_OPEN_METHOD_PATTERN =
  /async open\((?<openerVar>[A-Za-z_$][\w$]*)\)\{let (?<windowVar>[A-Za-z_$][\w$]*)=await this\.ensureWindow\((?<ensureWindowArg>[A-Za-z_$][\w$]*)?\);this\.globalState\.set\((?<openStateVar>[A-Za-z_$][\w$]*),!0\),this\.positionWindow\(\k<windowVar>,\k<openerVar>\),this\.rendererReady&&\(this\.showWindow\(\k<windowVar>\),this\.applyPointerInteractivityPolicy\(\)\)\}/;
const LINUX_AVATAR_OVERLAY_OPEN_METHOD_26_608_PATTERN =
  /async open\((?<openerVar>[A-Za-z_$][\w$]*)\)\{let (?<windowVar>[A-Za-z_$][\w$]*)=await this\.ensureWindow\((?<ensureWindowArg>[A-Za-z_$][\w$]*)?\);this\.globalState\.set\((?<openStateVar>[A-Za-z_$][\w$]*),!0\),this\.positionWindow\(\k<windowVar>,\k<openerVar>\),this\.showWindowIfReady\(\k<windowVar>\)\}/;
const LINUX_AVATAR_OVERLAY_OPEN_METHOD_26_616_PATTERN =
  /async open\((?<openerVar>[A-Za-z_$][\w$]*),\{forcePetView:(?<forcePetViewVar>[A-Za-z_$][\w$]*)=!1\}=\{\}\)\{let (?<windowVar>[A-Za-z_$][\w$]*)=await this\.ensureWindow\((?<ensureWindowArg>[A-Za-z_$][\w$]*)?\);this\.globalState\.set\((?<openStateExpr>[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?),!0\),this\.windowOpenIntent=!0,this\.positionWindow\(\k<windowVar>,\k<openerVar>\),(?<nativePresentationExpr>this\.nativeCompositionSupported&&this\.compositionHost\.isEnabled\(\)&&\(this\.initialPresentationState=`waiting-for-native`\),this\.stageWindowForNativePresentation\(\k<windowVar>\),this\.compositionHost\.wake\(\),)this\.showWindowIfReady\(\k<windowVar>\),\k<forcePetViewVar>&&this\.windowManager\.sendMessageToWebContents\(\k<windowVar>\.webContents,\{type:`avatar-overlay-explicit-pet-opened`\}\)\}/;
const LINUX_AVATAR_OVERLAY_OPEN_METHOD_26_623_PATTERN =
  /async open\((?<openerVar>[A-Za-z_$][\w$]*),\{forcePetView:(?<forcePetViewVar>[A-Za-z_$][\w$]*)=!1,persistPetIntent:(?<persistIntentVar>[A-Za-z_$][\w$]*)=!0\}=\{\}\)\{\k<persistIntentVar>&&\(this\.globalState\.set\((?<openStateExpr>[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?),!0\),this\.petOpenIntent=!0\);let (?<sequenceVar>[A-Za-z_$][\w$]*)=\+\+this\.windowVisibilitySequence,(?<windowVar>[A-Za-z_$][\w$]*)=await this\.ensureWindow\((?<ensureWindowArg>[A-Za-z_$][\w$]*)?\);\k<sequenceVar>===this\.windowVisibilitySequence&&\(this\.positionWindow\(\k<windowVar>,\k<openerVar>\),this\.pendingPresentation!=null&&\(this\.pendingPresentation\.target=\{\.\.\.this\.anchor\},this\.positionPresentationAtOrigin\(\k<windowVar>,this\.pendingPresentation\.origin\)\),this\.presentWindow\(\k<windowVar>\),\k<forcePetViewVar>&&this\.windowManager\.sendMessageToWebContents\(\k<windowVar>\.webContents,\{type:`avatar-overlay-explicit-pet-opened`\}\)\)\}/;
const LINUX_AVATAR_OVERLAY_SET_WINDOW_BOUNDS_PATTERN =
  /setWindowBounds\((?<windowVar>[A-Za-z_$][\w$]*),(?<boundsVar>[A-Za-z_$][\w$]*)(?:,(?<animateVar>[A-Za-z_$][\w$]*))?\)\{\k<windowVar>\.isDestroyed\(\)\|\|(?<equalFn>[A-Za-z_$][\w$]*)\(\k<windowVar>\.(?<getBoundsMethod>get(?:Content)?Bounds)\(\),\k<boundsVar>\)\|\|\k<windowVar>\.(?<setBoundsMethod>set(?:Content)?Bounds)\(\k<boundsVar>,(?<animateArg>!1|\k<animateVar>)\)\}/;
const LINUX_AVATAR_OVERLAY_SET_WINDOW_BOUNDS_NATIVE_COMPOSITION_PATTERN =
  /setWindowBounds\((?<windowVar>[A-Za-z_$][\w$]*),(?<boundsVar>[A-Za-z_$][\w$]*),(?<animateVar>[A-Za-z_$][\w$]*),(?<nativeMoveVar>[A-Za-z_$][\w$]*)\)\{if\(\k<windowVar>\.isDestroyed\(\)\)return;let (?<currentBoundsVar>[A-Za-z_$][\w$]*)=\k<windowVar>\.getContentBounds\(\);if\((?<equalFn>[A-Za-z_$][\w$]*)\(\k<currentBoundsVar>,\k<boundsVar>\)\)return;let (?<sameSizeVar>[A-Za-z_$][\w$]*)=\k<currentBoundsVar>\.width===\k<boundsVar>\.width&&\k<currentBoundsVar>\.height===\k<boundsVar>\.height;\k<sameSizeVar>&&!\k<nativeMoveVar>&&this\.compositionHost\.prepareDragFollowForOverlayMove\(\k<boundsVar>\),\k<windowVar>\.setContentBounds\(\k<boundsVar>,\k<animateVar>\),\(\k<nativeMoveVar>\|\|!\k<sameSizeVar>\)&&this\.compositionHost\.moveBackingCanvases\(\)\}/;
const LINUX_AVATAR_OVERLAY_SET_WINDOW_BOUNDS_NATIVE_COMPOSITION_26_611_PATTERN =
  /setWindowBounds\((?<windowVar>[A-Za-z_$][\w$]*),(?<boundsVar>[A-Za-z_$][\w$]*),(?<animateVar>[A-Za-z_$][\w$]*),(?<nativeMoveVar>[A-Za-z_$][\w$]*)\)\{if\(\k<windowVar>\.isDestroyed\(\)\)return;let (?<currentBoundsVar>[A-Za-z_$][\w$]*)=\k<windowVar>\.getContentBounds\(\);if\((?<equalFn>[A-Za-z_$][\w$]*)\(\k<currentBoundsVar>,\k<boundsVar>\)\)\{this\.(?<positionControllerVar>[A-Za-z_$][\w$]*)\.position\(\k<windowVar>,\k<boundsVar>\);return\}let (?<sameSizeVar>[A-Za-z_$][\w$]*)=\k<currentBoundsVar>\.width===\k<boundsVar>\.width&&\k<currentBoundsVar>\.height===\k<boundsVar>\.height;\k<sameSizeVar>&&!\k<nativeMoveVar>&&this\.compositionHost\.prepareDragFollowForOverlayMove\(\k<boundsVar>\),\k<windowVar>\.setContentBounds\(\k<boundsVar>,\k<animateVar>&&!this\.nativeCompositionSupported\),this\.\k<positionControllerVar>\.position\(\k<windowVar>,\k<boundsVar>\),\(\k<nativeMoveVar>\|\|!\k<sameSizeVar>\)&&this\.compositionHost\.moveBackingCanvases\(\)\}/;
const LINUX_AVATAR_OVERLAY_POINTER_POLICY_PATTERN =
  /applyPointerInteractivityPolicy\(\)\{let (?<windowVar>[A-Za-z_$][\w$]*)=this\.window;if\(\k<windowVar>==null\|\|\k<windowVar>\.isDestroyed\(\)\)\{this\.mousePassthroughEnabled=!1;return\}let (?<passthroughVar>[A-Za-z_$][\w$]*)=!this\.pointerInteractive;if\(this\.mousePassthroughEnabled!==\k<passthroughVar>\)\{if\(this\.mousePassthroughEnabled=\k<passthroughVar>,\k<passthroughVar>\)\{\k<windowVar>\.setIgnoreMouseEvents\(!0,\{forward:!0\}\);return\}\k<windowVar>\.setIgnoreMouseEvents\(!1\),this\.refreshCursorAtCurrentMousePosition\(\k<windowVar>\)\}\}/;
const LINUX_AVATAR_OVERLAY_WINDOW_OPTIONS_PATTERN =
  /case`avatarOverlay`:return\{\.\.\.(?<optionsFn>[A-Za-z_$][\w$]*)\(\{alwaysOnTop:!0,platform:(?<platformVar>[A-Za-z_$][\w$]*),resizable:!1,thickFrame:!1\}\),hasShadow:!1\}/;
const LINUX_AVATAR_OVERLAY_DOCK_WINDOW_OPTIONS_PATTERN =
  /case`avatarOverlay`:return\{\.\.\.(?<optionsFn>[A-Za-z_$][\w$]*)\(\{alwaysOnTop:!0,platform:(?<platformVar>[A-Za-z_$][\w$]*),resizable:!1,thickFrame:!1\}\),hasShadow:!1,\.\.\.\k<platformVar>===`linux`&&process\?\.env\?\.CODEX_DESKTOP_DISABLE_LINUX_AVATAR_OVERLAY_PATCH!==`1`\?\{type:`dock`,focusable:!0\}:\{\}\}/;
const LINUX_AVATAR_OVERLAY_DRAG_MOVE_IPC_PATTERN =
  /case`avatar-overlay-drag-move`:this\.avatarOverlayManager\.moveDrag\((?<webContentsId>[A-Za-z_$][\w$]*\.id)\);break;/;
const LINUX_AVATAR_OVERLAY_DRAG_MOVE_IPC_26_611_PATTERN =
  /case`avatar-overlay-drag-move`:\{let (?<pointVar>[A-Za-z_$][\w$]*)=(?<pointFn>[A-Za-z_$][\w$]*)\((?<messageVar>[A-Za-z_$][\w$]*)\);\k<pointVar>\?(?<managerExpr>(?:this\.)?[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\.moveDrag\((?<webContentsId>[A-Za-z_$][\w$]*\.id),\k<pointVar>\):\k<managerExpr>\.moveDrag\(\k<webContentsId>\);return\}/;
const LINUX_AVATAR_OVERLAY_START_DRAG_PATTERN =
  /startDrag\((?<webContentsIdVar>[A-Za-z_$][\w$]*),\{pointerWindowX:(?<pointerXVar>[A-Za-z_$][\w$]*),pointerWindowY:(?<pointerYVar>[A-Za-z_$][\w$]*)\}\)\{let (?<windowVar>[A-Za-z_$][\w$]*)=this\.window;if\(\k<windowVar>==null\|\|\k<windowVar>\.isDestroyed\(\)\|\|\k<windowVar>\.webContents\.id!==\k<webContentsIdVar>\)return;this\.cancelMomentum\(\)(?<clearDetachedCall>,this\.clearDetachedDisplayRestore\(\))?;let (?<layoutVar>[A-Za-z_$][\w$]*)=this\.getLayout\(\k<windowVar>\);this\.dragState=\{pointerAnchorX:\k<pointerXVar>-\k<layoutVar>\.mascot\.left,pointerAnchorY:\k<pointerYVar>-\k<layoutVar>\.mascot\.top,hasMoved:!1,displayBounds:(?<electronVar>[A-Za-z_$][\w$]*)\.screen\.getDisplayNearestPoint\(\k<electronVar>\.screen\.getCursorScreenPoint\(\)\)\.bounds\}\}/;
const LINUX_AVATAR_OVERLAY_START_DRAG_26_611_PATTERN =
  /startDrag\((?<webContentsIdVar>[A-Za-z_$][\w$]*),(?<eventVar>[A-Za-z_$][\w$]*)\)\{let (?<windowVar>[A-Za-z_$][\w$]*)=this\.window;if\(\k<windowVar>==null\|\|\k<windowVar>\.isDestroyed\(\)\|\|\k<windowVar>\.webContents\.id!==\k<webContentsIdVar>\)return;this\.cancelMomentum\(\),this\.(?<suppressVar>[A-Za-z_$][\w$]*)=!1,this\.clearDetachedDisplayRestore\(\);let (?<layoutVar>[A-Za-z_$][\w$]*)=this\.getLayout\(\k<windowVar>\);this\.(?<positionControllerVar>[A-Za-z_$][\w$]*)\.clear\(\);let (?<nativePointVar>[A-Za-z_$][\w$]*)=(?<coercePointFn>[A-Za-z_$][\w$]*)\(this\.compositionHost\.getCursorPosition\(\)\),(?<rendererPointVar>[A-Za-z_$][\w$]*)=\k<eventVar>\.pointerScreenX!=null&&\k<eventVar>\.pointerScreenY!=null\?\{x:\k<eventVar>\.pointerScreenX,y:\k<eventVar>\.pointerScreenY\}:(?<electronVar>[A-Za-z_$][\w$]*)\.screen\.getCursorScreenPoint\(\),(?<sourcePointVar>[A-Za-z_$][\w$]*)=\k<nativePointVar>\?\?\k<rendererPointVar>,(?<pointerAnchorXVar>[A-Za-z_$][\w$]*)=\k<eventVar>\.pointerWindowX-\k<layoutVar>\.mascot\.left,(?<pointerAnchorYVar>[A-Za-z_$][\w$]*)=\k<eventVar>\.pointerWindowY-\k<layoutVar>\.mascot\.top;this\.dragState=new (?<dragStateCtor>[A-Za-z_$][\w$]*)\(\k<nativePointVar>==null\?`renderer`:`native`,\k<pointerAnchorXVar>,\k<pointerAnchorYVar>,\k<electronVar>\.screen\.getDisplayNearestPoint\(\k<sourcePointVar>\)\.bounds\)\}/;
const LINUX_AVATAR_OVERLAY_START_DRAG_26_623_PATTERN =
  /startDrag\((?<webContentsIdVar>[A-Za-z_$][\w$]*),(?<eventVar>[A-Za-z_$][\w$]*),(?<usesOrbPhysicsVar>[A-Za-z_$][\w$]*)=!1\)\{let (?<windowVar>[A-Za-z_$][\w$]*)=this\.window;if\(\k<windowVar>==null\|\|\k<windowVar>\.isDestroyed\(\)\|\|\k<windowVar>\.webContents\.id!==\k<webContentsIdVar>\)return;this\.cancelMomentum\(\),this\.dockRestoreAnchor=null,this\.cancelOrbDragFollow\(\),this\.(?<suppressVar>[A-Za-z_$][\w$]*)=!1,this\.clearDetachedDisplayRestore\(\);let (?<layoutVar>[A-Za-z_$][\w$]*)=this\.getLayout\(\k<windowVar>\);this\.(?<positionControllerVar>[A-Za-z_$][\w$]*)\.clear\(\);let (?<nativePointVar>[A-Za-z_$][\w$]*)=(?<coercePointFn>[A-Za-z_$][\w$]*)\(this\.compositionHost\.getCursorPosition\(\)\),(?<rendererPointVar>[A-Za-z_$][\w$]*)=\k<eventVar>\.pointerScreenX!=null&&\k<eventVar>\.pointerScreenY!=null\?\{x:\k<eventVar>\.pointerScreenX,y:\k<eventVar>\.pointerScreenY\}:(?<electronVar>[A-Za-z_$][\w$]*)\.screen\.getCursorScreenPoint\(\),(?<sourcePointVar>[A-Za-z_$][\w$]*)=\k<nativePointVar>\?\?\k<rendererPointVar>,(?<pointerAnchorXVar>[A-Za-z_$][\w$]*)=\k<eventVar>\.pointerWindowX-\k<layoutVar>\.mascot\.left,(?<pointerAnchorYVar>[A-Za-z_$][\w$]*)=\k<eventVar>\.pointerWindowY-\k<layoutVar>\.mascot\.top;this\.dragState=new (?<dragStateCtor>[A-Za-z_$][\w$]*)\(\k<nativePointVar>==null\?`renderer`:`native`,\k<pointerAnchorXVar>,\k<pointerAnchorYVar>,\k<electronVar>\.screen\.getDisplayNearestPoint\(\k<sourcePointVar>\)\.bounds,\k<usesOrbPhysicsVar>\)\}/;
const LINUX_AVATAR_OVERLAY_MOVE_DRAG_METHOD_PATTERN =
  /moveDrag\((?<webContentsIdVar>[A-Za-z_$][\w$]*)\)\{let (?<windowVar>[A-Za-z_$][\w$]*)=this\.window;\k<windowVar>==null\|\|\k<windowVar>\.isDestroyed\(\)\|\|\k<windowVar>\.webContents\.id!==\k<webContentsIdVar>\|\|this\.dragState==null\|\|\(this\.cancelMomentum\(\),this\.dragState\.hasMoved=!0,this\.moveDragToCurrentCursor\(\k<windowVar>\)\)\}endDrag/;
const LINUX_AVATAR_OVERLAY_MOVE_DRAG_METHOD_26_611_PATTERN =
  /moveDrag\((?<webContentsIdVar>[A-Za-z_$][\w$]*),(?<pointVar>[A-Za-z_$][\w$]*)\)\{let (?<windowVar>[A-Za-z_$][\w$]*)=this\.window;if\(\k<windowVar>==null\|\|\k<windowVar>\.isDestroyed\(\)\|\|\k<windowVar>\.webContents\.id!==\k<webContentsIdVar>\|\|this\.dragState==null\)return;this\.cancelMomentum\(\);let (?<dragStateVar>[A-Za-z_$][\w$]*)=this\.dragState;\k<dragStateVar>\.recordMovementIntent\(\);let (?<cursorVar>[A-Za-z_$][\w$]*)=(?<electronVar>[A-Za-z_$][\w$]*)\.screen\.getCursorScreenPoint\(\),(?<nextPointVar>[A-Za-z_$][\w$]*)=\k<dragStateVar>\.getCursorPointForSource\(\{native:\k<dragStateVar>\.cursorSource===`native`\?(?<coercePointFn>[A-Za-z_$][\w$]*)\(this\.compositionHost\.getCursorPosition\(\)\):null,renderer:\{x:\k<pointVar>\?\.pointerScreenX\?\?\k<cursorVar>\.x,y:\k<pointVar>\?\.pointerScreenY\?\?\k<cursorVar>\.y\}\}\);\k<nextPointVar>!=null&&this\.moveDragToPointer\(\k<windowVar>,\k<nextPointVar>\)\}/;
const LINUX_AVATAR_OVERLAY_MOVE_DRAG_METHOD_26_623_PATTERN =
  /moveDrag\((?<webContentsIdVar>[A-Za-z_$][\w$]*),(?<pointVar>[A-Za-z_$][\w$]*)\)\{let (?<windowVar>[A-Za-z_$][\w$]*)=this\.window;if\(\k<windowVar>==null\|\|\k<windowVar>\.isDestroyed\(\)\|\|\k<windowVar>\.webContents\.id!==\k<webContentsIdVar>\|\|this\.dragState==null\)return;this\.cancelMomentum\(\);let (?<dragStateVar>[A-Za-z_$][\w$]*)=this\.dragState;\k<dragStateVar>\.recordMovementIntent\(\);let (?<cursorVar>[A-Za-z_$][\w$]*)=(?<electronVar>[A-Za-z_$][\w$]*)\.screen\.getCursorScreenPoint\(\),(?<nextPointVar>[A-Za-z_$][\w$]*)=\k<dragStateVar>\.getCursorPointForSource\(\{native:\k<dragStateVar>\.cursorSource===`native`\?(?<coercePointFn>[A-Za-z_$][\w$]*)\(this\.compositionHost\.getCursorPosition\(\)\):null,renderer:\{x:\k<pointVar>\?\.pointerScreenX\?\?\k<cursorVar>\.x,y:\k<pointVar>\?\.pointerScreenY\?\?\k<cursorVar>\.y\}\}\);\k<nextPointVar>!=null&&\(\k<dragStateVar>\.usesOrbPhysics\?\(this\.orbDragFollowTarget=\k<nextPointVar>,this\.scheduleOrbDragFollow\(\k<windowVar>\)\):this\.moveDragToPointer\(\k<windowVar>,\k<nextPointVar>\)\)\}/;
const LINUX_AVATAR_OVERLAY_MOVE_DRAG_CURSOR_PATTERN =
  /moveDragToCurrentCursor\((?<windowVar>[A-Za-z_$][\w$]*)\)\{let (?<dragStateVar>[A-Za-z_$][\w$]*)=this\.dragState;if\(\k<dragStateVar>==null\)return;let (?<cursorVar>[A-Za-z_$][\w$]*)=n\.screen\.getCursorScreenPoint\(\),(?<displayBoundsVar>[A-Za-z_$][\w$]*)=(?<displayFn>[A-Za-z_$][\w$]*)\(\k<cursorVar>,\k<dragStateVar>\.displayBounds\);\k<dragStateVar>\.displayBounds=\k<displayBoundsVar>(?:,this\.resolutionKey=[^,}]+)?,this\.anchor=\{\.\.\.this\.anchor,x:\k<cursorVar>\.x-\k<dragStateVar>\.pointerAnchorX,y:\k<cursorVar>\.y-\k<dragStateVar>\.pointerAnchorY\},this\.applyLayout\(\k<windowVar>,\k<displayBoundsVar>\)\}/;
const LINUX_AVATAR_OVERLAY_MOVE_DRAG_CURSOR_26_527_PATTERN =
  /moveDragToCurrentCursor\((?<windowVar>[A-Za-z_$][\w$]*)\)\{let (?<dragStateVar>[A-Za-z_$][\w$]*)=this\.dragState;if\(\k<dragStateVar>==null\)return;let (?<cursorVar>[A-Za-z_$][\w$]*)=(?<electronVar>[A-Za-z_$][\w$]*)\.screen\.getCursorScreenPoint\(\),(?<displayBoundsVar>[A-Za-z_$][\w$]*)=(?<displayFn>[A-Za-z_$][\w$]*)\(\k<cursorVar>,\k<dragStateVar>\.displayBounds\),(?<displayVar>[A-Za-z_$][\w$]*)=\k<electronVar>\.screen\.getDisplayMatching\(\k<displayBoundsVar>\);\k<dragStateVar>\.displayBounds=\k<displayVar>\.bounds(?:,this\.resolutionKey=[^,}]+)?[,;]this\.anchor=\{\.\.\.this\.anchor,x:\k<cursorVar>\.x-\k<dragStateVar>\.pointerAnchorX,y:\k<cursorVar>\.y-\k<dragStateVar>\.pointerAnchorY\},this\.applyLayout\(\k<windowVar>,\k<displayVar>\)\}/;
const LINUX_AVATAR_OVERLAY_MOVE_DRAG_CURSOR_26_608_PATTERN =
  /moveDragToCurrentCursor\((?<windowVar>[A-Za-z_$][\w$]*)\)\{let (?<dragStateVar>[A-Za-z_$][\w$]*)=this\.dragState;if\(\k<dragStateVar>==null\)return;let (?<cursorVar>[A-Za-z_$][\w$]*)=(?<electronVar>[A-Za-z_$][\w$]*)\.screen\.getCursorScreenPoint\(\),(?<displayBoundsVar>[A-Za-z_$][\w$]*)=(?<displayFn>[A-Za-z_$][\w$]*)\(\k<cursorVar>,\k<dragStateVar>\.displayBounds\),(?<displayVar>[A-Za-z_$][\w$]*)=\k<electronVar>\.screen\.getDisplayMatching\(\k<displayBoundsVar>\);\k<dragStateVar>\.displayBounds=\k<displayVar>\.bounds,this\.anchor=\{\.\.\.this\.anchor,x:\k<cursorVar>\.x-\k<dragStateVar>\.pointerAnchorX,y:\k<cursorVar>\.y-\k<dragStateVar>\.pointerAnchorY\},this\.applyLayout\(\k<windowVar>,\k<displayVar>,!1,!1\)\}/;
const LINUX_AVATAR_OVERLAY_MOVE_DRAG_POINTER_26_611_PATTERN =
  /moveDragToPointer\((?<windowVar>[A-Za-z_$][\w$]*),(?<cursorVar>[A-Za-z_$][\w$]*)\)\{let (?<dragStateVar>[A-Za-z_$][\w$]*)=this\.dragState;if\(\k<dragStateVar>==null\)return;let (?<displayBoundsVar>[A-Za-z_$][\w$]*)=(?<displayFn>[A-Za-z_$][\w$]*)\(\k<cursorVar>,\k<dragStateVar>\.displayBounds\),(?<displayVar>[A-Za-z_$][\w$]*)=(?<electronVar>[A-Za-z_$][\w$]*)\.screen\.getDisplayMatching\(\k<displayBoundsVar>\);\k<dragStateVar>\.recordMove\(\k<displayVar>\.bounds\),this\.anchor=\{\.\.\.this\.anchor,x:\k<cursorVar>\.x-\k<dragStateVar>\.pointerAnchorX,y:\k<cursorVar>\.y-\k<dragStateVar>\.pointerAnchorY\},this\.applyLayout\(\k<windowVar>,\k<displayVar>,!1,!1\)\}/;
const LINUX_AVATAR_OVERLAY_MOVE_DRAG_POINTER_26_623_PATTERN =
  /moveDragToPointer\((?<windowVar>[A-Za-z_$][\w$]*),(?<cursorVar>[A-Za-z_$][\w$]*)\)\{let (?<dragStateVar>[A-Za-z_$][\w$]*)=this\.dragState;if\(\k<dragStateVar>==null\)return;let (?<displayBoundsVar>[A-Za-z_$][\w$]*)=(?<displayFn>[A-Za-z_$][\w$]*)\(\k<cursorVar>,\k<dragStateVar>\.displayBounds\),(?<displayVar>[A-Za-z_$][\w$]*)=(?<electronVar>[A-Za-z_$][\w$]*)\.screen\.getDisplayMatching\(\k<displayBoundsVar>\);\k<dragStateVar>\.recordMove\(\k<displayVar>\.bounds\);let (?<targetXVar>[A-Za-z_$][\w$]*)=\k<cursorVar>\.x-\k<dragStateVar>\.pointerAnchorX,(?<targetYVar>[A-Za-z_$][\w$]*)=\k<cursorVar>\.y-\k<dragStateVar>\.pointerAnchorY,(?<easeVar>[A-Za-z_$][\w$]*)=\k<dragStateVar>\.usesOrbPhysics\?(?<orbEaseVar>[A-Za-z_$][\w$]*):1,(?<nextAnchorVar>[A-Za-z_$][\w$]*)=\{\.\.\.this\.anchor,x:this\.anchor\.x\+\(\k<targetXVar>-this\.anchor\.x\)\*\k<easeVar>,y:this\.anchor\.y\+\(\k<targetYVar>-this\.anchor\.y\)\*\k<easeVar>\},(?<currentBoundsVar>[A-Za-z_$][\w$]*)=\k<windowVar>\.getContentBounds\(\);this\.anchor=\k<nextAnchorVar>,this\.applyLayout\(\k<windowVar>,\k<displayVar>,!1,!1\),this\.layout!=null&&(?<equalFn>[A-Za-z_$][\w$]*)\(\k<currentBoundsVar>,this\.layout\.windowBounds\)&&\(this\.anchor\.x!==Math\.round\(\k<nextAnchorVar>\.x\)\|\|this\.anchor\.y!==Math\.round\(\k<nextAnchorVar>\.y\)\)&&this\.compositionHost\.settleDragFollowSurfaces\(\)\}/;
const LINUX_AVATAR_OVERLAY_END_DRAG_PATTERN =
  /endDrag\((?<webContentsIdVar>[A-Za-z_$][\w$]*)\)\{let (?<windowVar>[A-Za-z_$][\w$]*)=this\.window;\k<windowVar>==null\|\|\k<windowVar>\.isDestroyed\(\)\|\|\k<windowVar>\.webContents\.id!==\k<webContentsIdVar>\|\|\(this\.dragState\?\.hasMoved&&this\.moveDragToCurrentCursor\(\k<windowVar>\),this\.dragState=null,this\.reclampWindowToVisibleDisplay\(\{shouldPersist:!0\}\)\)\}/;
const LINUX_AVATAR_OVERLAY_END_DRAG_26_611_PATTERN =
  /endDrag\((?<webContentsIdVar>[A-Za-z_$][\w$]*),(?<pointVar>[A-Za-z_$][\w$]*)\)\{let (?<windowVar>[A-Za-z_$][\w$]*)=this\.window;if\(\k<windowVar>==null\|\|\k<windowVar>\.isDestroyed\(\)\|\|\k<windowVar>\.webContents\.id!==\k<webContentsIdVar>\)return;let (?<dragStateVar>[A-Za-z_$][\w$]*)=this\.dragState;if\(\k<dragStateVar>\?\.hasMovementIntent\)\{let (?<cursorVar>[A-Za-z_$][\w$]*)=(?<electronVar>[A-Za-z_$][\w$]*)\.screen\.getCursorScreenPoint\(\),(?<nextPointVar>[A-Za-z_$][\w$]*)=\k<dragStateVar>\.getCursorPointForSource\(\{native:\k<dragStateVar>\.cursorSource===`native`\?(?<coercePointFn>[A-Za-z_$][\w$]*)\(this\.compositionHost\.getCursorPosition\(\)\):null,renderer:\{x:\k<pointVar>\?\.pointerScreenX\?\?\k<cursorVar>\.x,y:\k<pointVar>\?\.pointerScreenY\?\?\k<cursorVar>\.y\}\}\);\k<nextPointVar>!=null&&this\.moveDragToPointer\(\k<windowVar>,\k<nextPointVar>\)\}this\.(?<suppressVar>[A-Za-z_$][\w$]*)=\k<dragStateVar>\?\.shouldSuppressRendererThrow\(\)\?\?!1,this\.dragState=null,this\.reclampWindowToVisibleDisplay\(\{shouldPersist:!0\}\)\}/;
const LINUX_AVATAR_OVERLAY_END_DRAG_26_623_PATTERN =
  /endDrag\((?<webContentsIdVar>[A-Za-z_$][\w$]*),(?<pointVar>[A-Za-z_$][\w$]*)\)\{let (?<windowVar>[A-Za-z_$][\w$]*)=this\.window;if\(\k<windowVar>==null\|\|\k<windowVar>\.isDestroyed\(\)\|\|\k<windowVar>\.webContents\.id!==\k<webContentsIdVar>\)return;this\.cancelOrbDragFollow\(\);let (?<dragStateVar>[A-Za-z_$][\w$]*)=this\.dragState;if\(\k<dragStateVar>\?\.hasMovementIntent\)\{let (?<cursorVar>[A-Za-z_$][\w$]*)=(?<electronVar>[A-Za-z_$][\w$]*)\.screen\.getCursorScreenPoint\(\),(?<nextPointVar>[A-Za-z_$][\w$]*)=\k<dragStateVar>\.getCursorPointForSource\(\{native:\k<dragStateVar>\.cursorSource===`native`\?(?<coercePointFn>[A-Za-z_$][\w$]*)\(this\.compositionHost\.getCursorPosition\(\)\):null,renderer:\{x:\k<pointVar>\?\.pointerScreenX\?\?\k<cursorVar>\.x,y:\k<pointVar>\?\.pointerScreenY\?\?\k<cursorVar>\.y\}\}\);\k<nextPointVar>!=null&&this\.moveDragToPointer\(\k<windowVar>,\k<nextPointVar>\)\}this\.(?<suppressVar>[A-Za-z_$][\w$]*)=\k<dragStateVar>\?\.shouldSuppressRendererThrow\(\)\?\?!1,this\.dragState=null,this\.reclampWindowToVisibleDisplay\(\{shouldPersist:!0\}\);let (?<dockTargetVar>[A-Za-z_$][\w$]*)=this\.dockTarget,(?<currentAnchorVar>[A-Za-z_$][\w$]*)=(?<anchorFn>[A-Za-z_$][\w$]*)\(this\.anchor,this\.presentationOffset\);\k<dockTargetVar>!=null&&(?<dockCheckFn>[A-Za-z_$][\w$]*)\(\{current:\k<currentAnchorVar>,next:\k<currentAnchorVar>,target:\{x:\k<dockTargetVar>\.anchor\.centerX,y:\k<dockTargetVar>\.anchor\.centerY\}\}\)\.shouldDock&&this\.dockPresentation\(\k<dockTargetVar>\.anchor,\k<dockTargetVar>\.onDock\)\}/;
const LINUX_AVATAR_OVERLAY_THROW_WITH_VELOCITY_PATTERN =
  /throwWithVelocity\((?<webContentsIdVar>[A-Za-z_$][\w$]*),(?<velocityXVar>[A-Za-z_$][\w$]*),(?<velocityYVar>[A-Za-z_$][\w$]*)\)\{let (?<windowVar>[A-Za-z_$][\w$]*)=this\.window;if\(\k<windowVar>==null\|\|\k<windowVar>\.isDestroyed\(\)\|\|\k<windowVar>\.webContents\.id!==\k<webContentsIdVar>\|\|!Number\.isFinite\(\k<velocityXVar>\)\|\|!Number\.isFinite\(\k<velocityYVar>\)\|\|\k<velocityXVar>===0&&\k<velocityYVar>===0\)return;/;
const LINUX_AVATAR_OVERLAY_THROW_WITH_VELOCITY_26_623_PATTERN =
  /throwWithVelocity\((?<webContentsIdVar>[A-Za-z_$][\w$]*),(?<velocityXVar>[A-Za-z_$][\w$]*),(?<velocityYVar>[A-Za-z_$][\w$]*),(?<shouldBounceVar>[A-Za-z_$][\w$]*)=!1\)\{let (?<windowVar>[A-Za-z_$][\w$]*)=this\.window;if\(\k<windowVar>==null\|\|\k<windowVar>\.isDestroyed\(\)\|\|\k<windowVar>\.webContents\.id!==\k<webContentsIdVar>\|\|!Number\.isFinite\(\k<velocityXVar>\)\|\|!Number\.isFinite\(\k<velocityYVar>\)\|\|\k<velocityXVar>===0&&\k<velocityYVar>===0\)return;let (?<suppressVar>[A-Za-z_$][\w$]*)=this\.suppressNextRendererThrow;this\.suppressNextRendererThrow=!1,!\(\k<suppressVar>&&!\k<shouldBounceVar>\)&&this\.startMomentum\(\k<velocityXVar>,\k<velocityYVar>,\k<shouldBounceVar>\)\}/;
const LINUX_AVATAR_OVERLAY_RENDERER_DRAG_MOVE_PATTERN =
  /let (?<sampleVar>[A-Za-z_$][\w$]*)=(?<sampleFn>[A-Za-z_$][\w$]*)\((?<eventVar>[A-Za-z_$][\w$]*)\);(?<body>[\s\S]*?\.dispatchMessage\(`avatar-overlay-drag-move`,)\{\}\)/;
const LINUX_AVATAR_OVERLAY_RENDERER_DRAG_MOVE_POINTER_PATTERN =
  /let (?<sampleVar>[A-Za-z_$][\w$]*)=(?<sampleFn>[A-Za-z_$][\w$]*)\((?<eventVar>[A-Za-z_$][\w$]*)\);(?<body>[\s\S]*?\.dispatchMessage\(`avatar-overlay-drag-move`,)\{pointerScreenX:\k<sampleVar>\.screenX,pointerScreenY:\k<sampleVar>\.screenY\}\)/;
const LINUX_PET_YAPPING_USAGE_MAIN_HANDLER_PATTERN =
  /(?<anchor>"fast-mode-rollout-metrics":async (?<paramsVar>[A-Za-z_$][\w$]*)=>(?:[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*\(this\.hostConfig\)\?null:)?[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*\(\{codexHome:[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*\(\{preferWsl:[A-Za-z_$][\w$]*(?:,hostConfig:(?:this\.hostConfig|[A-Za-z_$][\w$]*))?\}\),params:\k<paramsVar>\}\),)/;
const LINUX_PET_YAPPING_USAGE_REACT_VAR_PATTERN =
  /(?:^|[;,]|\bvar\s+)(?<reactVar>[A-Za-z_$][\w$]*)=[A-Za-z_$][\w$]*\([A-Za-z_$][\w$]*\(\),1\)/;
const LINUX_PET_YAPPING_USAGE_VSCODE_API_IMPORT_PATTERN =
  /import\{(?<imports>[^}]*)\}from"(?<module>\.\/vscode-api-[^"]+\.js)";/;
const LINUX_PET_YAPPING_USAGE_SETTING_STORAGE_IMPORT_PATTERN =
  /import\{(?<imports>[^}]*)\}from"(?<module>\.\/setting-storage-[^"]+\.js)";/;
const LINUX_PET_YAPPING_USAGE_ROLLDOWN_APP_IMPORT_PATTERN =
  /import\{(?<imports>[^}]*)\}from"(?<module>\.\/app-initial~app-main~[^"]+\.js)";/g;
const LINUX_PET_YAPPING_USAGE_JSX_RUNTIME_IMPORT_PATTERN =
  /import\{(?<imports>[^}]*)\}from"\.\/jsx-runtime-[^"]+\.js";/;
const LINUX_PET_YAPPING_USAGE_MASCOT_HIT_REGION_PATTERN =
  /(?<prefix>"data-avatar-overlay-hit-region":`mascot`[\s\S]*?children:\[?)(?<mascotCall>\(0,(?<jsxVar>[A-Za-z_$][\w$]*)\.jsx\)\([A-Za-z_$][\w$]*,\{ariaLabel:[\s\S]*?transientState:[A-Za-z_$][\w$]*\}\))/;
const LINUX_PET_YAPPING_USAGE_MASCOT_HIT_REGION_26_611_PATTERN =
  /(?<prefix>"data-avatar-overlay-hit-region":`mascot`[\s\S]*?children:\[)(?<mascotContent>[\s\S]*?notificationBadge:[\s\S]*?transientState:[A-Za-z_$][\w$]*\}\)),(?<realtimeButton>\(0,(?<jsxVar>[A-Za-z_$][\w$]*)\.jsx\)\([A-Za-z_$][\w$]*,\{[\s\S]*?canStart:[\s\S]*?onStop:[A-Za-z_$][\w$]*[\s\S]*?\}\))\]\}/;
const LINUX_PET_YAPPING_USAGE_MASCOT_HIT_REGION_26_623_PATTERN =
  /(?<prefix>"data-avatar-overlay-hit-region":[A-Za-z_$][\w$]*\?void 0:`mascot`[\s\S]*?children:)(?<mascotContent>[A-Za-z_$][\w$]*)(?<suffix>\}\)\})/;
const LINUX_PET_YAPPING_USAGE_MASCOT_CHILDREN_PATTERN =
  /children:\[(?<avatar>[A-Za-z_$][\w$]*),(?<badge>[A-Za-z_$][\w$]*)\]\}/;
const LINUX_PET_YAPPING_USAGE_LAYOUT_QUERY_PATTERN =
  /(?<layoutQuery>(?:[A-Za-z_$][\w$]*\(e\.querySelector\(`\[data-avatar-overlay-hit-region="mascot"\]`\)\)\?\?)?[A-Za-z_$][\w$]*\(e\.querySelector\((?:[A-Za-z_$][\w$]*|`[^`]+`)\)\))(?=,n=[A-Za-z_$][\w$]*\(e\.querySelector\([A-Za-z_$][\w$]*\)\);return [A-Za-z_$][\w$]*==null\?null:\{mascot:[A-Za-z_$][\w$]*,tray:[A-Za-z_$][\w$]*\})/;
const BROWSER_USE_VIEW_MENU_INSERTION_ANCHOR =
  'Ce,Te,{type:`separator`},Ee,De,Pe,Fe,...o?[Se]:[]],He=[';
const BROWSER_USE_VIEW_MENU_INSERTION_REPLACEMENT =
  'Ce,Te,{type:`separator`},Ee,De,Pe,Fe,{type:`separator`},codexLinuxBrowserUseAllowAllOriginsMenuItem(),codexLinuxBrowserUseResetSitePermissionsMenuItem(),...o?[Se]:[]],He=[';
const LINUX_TERMINAL_PATCH_MARKER = 'codexLinuxTerminalMounts';

function buildLinuxWorktreeEnvironmentMainHelperReplacement({
  thresholdVar,
  loggerVar,
  loggerObject,
  loggerFactory,
  classVar
}) {
  return `var codexLinuxWorktreeEnvironmentBuiltins=typeof process.getBuiltinModule===\`function\`?{fs:process.getBuiltinModule(\`node:fs\`),path:process.getBuiltinModule(\`node:path\`)}:{fs:null,path:null};function codexLinuxListEnvironmentConfigPaths(e){let t=codexLinuxWorktreeEnvironmentBuiltins.fs,n=codexLinuxWorktreeEnvironmentBuiltins.path;if(!e||!t||!n)return[];let r=n.join(e,\`.codex\`,\`environments\`),i;try{i=t.readdirSync(r,{withFileTypes:!0})}catch{return[]}return i.filter(e=>e.isFile()&&e.name.endsWith(\`.toml\`)).map(e=>n.join(r,e.name)).sort()}function codexLinuxResolveWorktreeLocalEnvironmentPath(e,t){if(t===\`__none__\`||t!=null)return t;let n=codexLinuxListEnvironmentConfigPaths(e);return n.length===1?n[0]:null}/* ${LINUX_WORKTREE_ENVIRONMENT_MAIN_PATCH_MARKER} */var ${thresholdVar}=32e3,${loggerVar}=${loggerObject}.${loggerFactory}(\`worktree-service\`),${classVar}=class{`;
}

function buildLinuxWorktreeEnvironmentPendingRequestReplacement(
  {
    resultVar,
    pathModuleVar,
    pathResolver,
    entryVar,
    runtimeVar,
    operationSource,
    allowSetupFailure
  },
  { loggerVar }
) {
  return `let codexLinuxResolvedLocalEnvironmentPath=codexLinuxResolveWorktreeLocalEnvironmentPath(${pathModuleVar}.${pathResolver}(${entryVar}.sourceWorkspaceRoot),${entryVar}.localEnvironmentConfigPath);codexLinuxResolvedLocalEnvironmentPath===\`__none__\`?${loggerVar}().info(\`[worktree-create] explicit-no-environment\`,{safe:{flow:\`pending\`,launchMode:${entryVar}.launchMode},sensitive:{sourceWorkspaceRoot:${entryVar}.sourceWorkspaceRoot}}):${entryVar}.localEnvironmentConfigPath==null&&codexLinuxResolvedLocalEnvironmentPath!=null&&${loggerVar}().info(\`[worktree-create] auto-selected-single-environment\`,{safe:{flow:\`pending\`,launchMode:${entryVar}.launchMode},sensitive:{sourceWorkspaceRoot:${entryVar}.sourceWorkspaceRoot,configPath:codexLinuxResolvedLocalEnvironmentPath}});let ${resultVar}=await this.requestGitWorker({method:\`create-worktree\`,params:{hostConfig:this.options.hostConfig,${operationSource ?? ''}cwd:${pathModuleVar}.${pathResolver}(${entryVar}.sourceWorkspaceRoot),startingState:${entryVar}.startingState,localEnvironmentConfigPath:codexLinuxResolvedLocalEnvironmentPath,streamId:${runtimeVar}.streamId,${allowSetupFailure ?? ''}setUpSyncedBranch:${entryVar}.launchMode===\`create-stable-worktree\`?!1:void 0},signal:${runtimeVar}.abortController.signal});`;
}

function buildLinuxWorktreeEnvironmentManagedRequestReplacement(
  {
    resultVar,
    newbornVar,
    pathModuleVar,
    pathResolver,
    hostVar,
    cwdVar,
    startingStateVar,
    envVar,
    streamVar,
    operationSource
  },
  { loggerVar }
) {
  return `let codexLinuxResolvedLocalEnvironmentPath=codexLinuxResolveWorktreeLocalEnvironmentPath(${pathModuleVar}.${pathResolver}(${cwdVar}),${envVar});codexLinuxResolvedLocalEnvironmentPath===\`__none__\`?${loggerVar}().info(\`[worktree-create] explicit-no-environment\`,{safe:{flow:\`managed\`},sensitive:{cwd:${cwdVar}}}):${envVar}==null&&codexLinuxResolvedLocalEnvironmentPath!=null&&${loggerVar}().info(\`[worktree-create] auto-selected-single-environment\`,{safe:{flow:\`managed\`},sensitive:{cwd:${cwdVar},configPath:codexLinuxResolvedLocalEnvironmentPath}});let ${resultVar}=await this.requestGitWorker({method:\`create-worktree\`,params:{hostConfig:this.options.getHostConfigForHostId(${hostVar}),${operationSource ?? ''}cwd:${pathModuleVar}.${pathResolver}(${cwdVar}),startingState:${startingStateVar},localEnvironmentConfigPath:codexLinuxResolvedLocalEnvironmentPath,streamId:${streamVar}}}),${newbornVar}=this.newbornWorktreeRoots.has(${resultVar}.worktreeGitRoot);`;
}

function buildLinuxWorktreeEnvironmentWorkerHelperReplacement(
  {
    createWorktreeFn,
    allowSetupFailureParam,
    setUpSyncedBranchVar,
    clientParamName = 'appServerClient',
    appServerClientVar,
    signalVar,
    onLogVar,
    onWorktreePathAllocatedVar,
    onSetupStartParam = ''
  },
  { fsApiVar }
) {
  return `var codexLinuxWorktreeEnvironmentWorkerBuiltins=typeof process.getBuiltinModule===\`function\`?{fs:process.getBuiltinModule(\`node:fs\`),path:process.getBuiltinModule(\`node:path\`)}:{fs:null,path:null};async function codexLinuxListEnvironmentConfigPaths(e,t){let n=await t.platformPath(),r=n.join(e,\`.codex\`,\`environments\`),i;try{i=typeof t?.readDirectory===\`function\`?await t.readDirectory(r):typeof ${fsApiVar}!==\`undefined\`&&${fsApiVar}?.readdir?await ${fsApiVar}.readdir(r,t):[]}catch{return[]}return i.filter(e=>typeof e===\`string\`&&e.endsWith(\`.toml\`)).map(e=>n.join(r,e)).sort()}async function codexLinuxResolveWorktreeEnvironmentConfigPath(e,t,n){if(t===\`__none__\`)return{configPath:t,source:\`explicit-none\`};if(t!=null)return{configPath:t,source:\`explicit-selection\`};let r=await codexLinuxListEnvironmentConfigPaths(e,n);return r.length===1?{configPath:r[0],source:\`single-environment-fallback\`}:{configPath:null,source:\`missing\`}}function codexLinuxResolveWorktreeSourceWorkspaceRoot(e){let t=codexLinuxWorktreeEnvironmentWorkerBuiltins.fs,n=codexLinuxWorktreeEnvironmentWorkerBuiltins.path;if(!e||!t||!n)return null;let r=n.join(e,\`.git\`),i;try{i=t.readFileSync(r,\`utf8\`)}catch{return null}let a=i.match(/^gitdir:\\s*(.+)$/m)?.[1]?.trim();if(!a)return null;let o=n.normalize(n.isAbsolute(a)?a:n.resolve(e,a)),s=n.dirname(o),c=n.dirname(s);return n.basename(s)!==\`worktrees\`||n.basename(c)!==\`.git\`?null:n.dirname(c)}/* ${LINUX_WORKTREE_ENVIRONMENT_WORKER_PATCH_MARKER} */async function ${createWorktreeFn}({gitManager:e,workspaceRoot:t,startingState:n,localEnvironmentConfigPath:r,${allowSetupFailureParam ?? ''}setUpSyncedBranch:${setUpSyncedBranchVar}=!0,${clientParamName}:${appServerClientVar},signal:${signalVar},onLog:${onLogVar},onWorktreePathAllocated:${onWorktreePathAllocatedVar}${onSetupStartParam}}){`;
}

function buildLinuxWorktreeEnvironmentWorkerCleanupHelperReplacement({
  cleanupFn,
  environmentRunnerFn,
  clientParamName = 'appServerClient'
}) {
  return `async function ${cleanupFn}(e,t,n,r,i,a){return(await ${environmentRunnerFn}({workspaceRoot:e,localEnvironment:t,scriptType:\`cleanup\`,${clientParamName}:a,injectedEnvironment:i,onLog:n,signal:r}))?.setupResult??null}`;
}

function buildLinuxSystemSleepInhibitorMethods() {
  return `codexLinuxSyncSystemSleepInhibitor(e){/* ${LINUX_POWER_SAVE_BLOCKER_PATCH_MARKER} */if(process.platform!==\`linux\`||process?.env?.CODEX_DESKTOP_DISABLE_LINUX_SYSTEM_SLEEP_INHIBITOR===\`1\`)return;e?this.codexLinuxStartSystemSleepInhibitor():this.codexLinuxStopSystemSleepInhibitor()}codexLinuxStartSystemSleepInhibitor(){if(this.codexLinuxSystemSleepInhibitorProcess!=null)return;let e=typeof process.getBuiltinModule===\`function\`?process.getBuiltinModule(\`node:child_process\`):null;if(e?.spawn==null)return;try{let t=e.spawn(\`systemd-inhibit\`,[\`--what=sleep:idle\`,\`--mode=block\`,\`--who=codex\`,\`--why=Codex remote access keep awake\`,\`sleep\`,\`infinity\`],{stdio:\`ignore\`}),n=()=>{try{t.kill()}catch{}};this.codexLinuxSystemSleepInhibitorProcess=t,process.once?.(\`exit\`,n),t.once(\`error\`,()=>{process.off?.(\`exit\`,n),this.codexLinuxSystemSleepInhibitorProcess===t&&(this.codexLinuxSystemSleepInhibitorProcess=null)}),t.once(\`exit\`,()=>{process.off?.(\`exit\`,n),this.codexLinuxSystemSleepInhibitorProcess===t&&(this.codexLinuxSystemSleepInhibitorProcess=null)}),t.unref?.()}catch{this.codexLinuxSystemSleepInhibitorProcess=null}}codexLinuxStopSystemSleepInhibitor(){let e=this.codexLinuxSystemSleepInhibitorProcess;if(e==null)return;this.codexLinuxSystemSleepInhibitorProcess=null;try{e.kill()}catch{}}`;
}

function buildLinuxPetYappingUsageMainHandler() {
  return `"codex-linux-pet-usage":async()=>{/* ${LINUX_PET_YAPPING_USAGE_MAIN_PATCH_MARKER} */
let e=typeof process.getBuiltinModule===\`function\`?process.getBuiltinModule(\`node:fs\`):null,t=typeof process.getBuiltinModule===\`function\`?process.getBuiltinModule(\`node:path\`):null,n=typeof process.getBuiltinModule===\`function\`?process.getBuiltinModule(\`node:os\`):null,r=null;try{r=typeof require===\`function\`?require(\`electron\`):null}catch{}function i(e){return e==null?null:{used_percent:e.used_percent??0,limit_window_seconds:e.limit_window_seconds??(e.window_minutes??0)*60,resets_at:e.resets_at??e.reset_at??null}}function a(e){return e==null?null:{rate_limit:{primary_window:i(e.primary_window??e.primary),secondary_window:i(e.secondary_window??e.secondary)},rate_limits:e}}function o(e){let t=e.split(\`.\`);if(t.length<2)return null;try{let e=JSON.parse(Buffer.from(t[1],\`base64url\`).toString(\`utf8\`))[\`https://api.openai.com/auth\`],n=e&&typeof e===\`object\`?e.chatgpt_account_id:null;return typeof n===\`string\`?n:null}catch{return null}}function s(e){let t=process.env.CODEX_API_BASE_URL;if(t&&t.trim().length>0)return t.replace(/\\/+$/,\`\`);return(process.env.CODEX_API_ENDPOINT??\`\`).toLowerCase()===\`localhost\`?\`http://localhost:8000/api\`:\`https://chatgpt.com/backend-api\`}function c(){let e={darwin:\`Macintosh; Intel Mac OS X\`,linux:\`X11; Linux\`,win32:\`Windows NT 10.0\`}[process.platform]??process.platform,t=r?.app?.getVersion?.()??\`unknown\`;return\`Codex Desktop/\${t} (\${e}; \${process.arch})\`}async function l(){try{let e=this.appServerClient?.getAuthToken?this.appServerClient:this.appServerConnectionRegistry?.getConnection?.(typeof L!==\`undefined\`?L:void 0),t=await e?.getAuthToken?.({refreshToken:!1});if(!t)return null;let n=\`\${s()}/wham/usage\`,i={Authorization:\`Bearer \${t}\`,originator:\`Codex Desktop\`,[\`User-Agent\`]:c()},l=o(t);l&&(i[\`ChatGPT-Account-Id\`]=l);let u=async e=>r?.net?.fetch?r.net.fetch(n,{method:\`GET\`,headers:e}):fetch(n,{method:\`GET\`,headers:e}),d=await u(i);if(d.status===401){let n=await e?.getAuthToken?.({refreshToken:!0});n&&n!==t&&(i.Authorization=\`Bearer \${n}\`,l=o(n),l&&(i[\`ChatGPT-Account-Id\`]=l),d=await u(i))}if(!d.ok)return null;let f=await d.json();return a(f?.rate_limit??f)}catch{return null}}let u=await l.call(this);if(u)return u;if(e?.readdirSync==null||e?.readFileSync==null||e?.statSync==null||t==null||n==null)return null;let d=t.join(n.homedir(),\`.codex\`,\`sessions\`),f=[];function p(n){let r;try{r=e.readdirSync(n,{withFileTypes:!0})}catch{return}for(let i of r){let r=t.join(n,i.name);if(i.isDirectory())p(r);else i.isFile()&&i.name.endsWith(\`.jsonl\`)&&f.push(r)}}try{p(d);let t=f.map(t=>{try{return{path:t,mtime:e.statSync(t).mtimeMs}}catch{return null}}).filter(Boolean).sort((e,t)=>t.mtime-e.mtime).slice(0,200);for(let n of t){let t;try{t=e.readFileSync(n.path,\`utf8\`).trim().split(/\\r?\\n/).reverse()}catch{continue}for(let e of t){if(!e.includes(\`rate_limits\`))continue;try{let t=JSON.parse(e),n=t?.payload?.rate_limits??t?.payload?.info?.rate_limits,r=a(n);if(r)return r}catch{}}}}catch{}return null},`;
}

function buildLinuxWorktreeEnvironmentWorkerCreateReplacement(
  {
    storeEnvFn,
    readEnvironmentFn,
    logEncodeFn,
    onLogVar,
    selectedVar,
    appServerClientVar,
    signalVar,
    worktreeGitRootVar,
    worktreeWorkspaceRootVar,
    emptySetupError,
    environmentVar,
    preReadSetupStartCall = ''
  },
  { loggerFn }
) {
  const createdLog = buildLinuxWorktreeEnvironmentLogEncode(
    logEncodeFn,
    `Worktree created at ${'${'}${worktreeWorkspaceRootVar}}\\n`
  );
  const storeFailedLog = buildLinuxWorktreeEnvironmentLogEncode(
    logEncodeFn,
    'Failed to store selected environment in git config\\n'
  );
  const noEnvironmentLog = buildLinuxWorktreeEnvironmentLogEncode(
    logEncodeFn,
    'No local environment selected\\n'
  );
  return `let codexLinuxEnvironmentSelection=await codexLinuxResolveWorktreeEnvironmentConfigPath(t,${selectedVar},${appServerClientVar}),codexLinuxLocalEnvironmentConfigPath=codexLinuxEnvironmentSelection.configPath;codexLinuxEnvironmentSelection.source===\`single-environment-fallback\`?${loggerFn}().info(\`[worktree-create] auto-selected-single-environment\`,{safe:{},sensitive:{workspaceRoot:t,configPath:codexLinuxLocalEnvironmentConfigPath}}):codexLinuxEnvironmentSelection.source===\`explicit-none\`&&${loggerFn}().info(\`[worktree-create] explicit-no-environment\`,{safe:{},sensitive:{workspaceRoot:t}});if(${onLogVar}?.(\`info\`,${createdLog}),await ${storeEnvFn}(${worktreeWorkspaceRootVar},codexLinuxLocalEnvironmentConfigPath??\`__none__\`,${appServerClientVar},\`worktree\`,${signalVar})||(${loggerFn}().warning(\`[worktree-create] failed-to-store-environment-selection\`,{safe:{},sensitive:{workspaceRoot:t,configPath:codexLinuxLocalEnvironmentConfigPath}}),${onLogVar}?.(\`stderr\`,${storeFailedLog})),(codexLinuxLocalEnvironmentConfigPath==null||codexLinuxLocalEnvironmentConfigPath===\`__none__\`))return ${onLogVar}?.(\`info\`,${noEnvironmentLog}),{success:!0,worktreeGitRoot:${worktreeGitRootVar},worktreeWorkspaceRoot:${worktreeWorkspaceRootVar},setupResult:null${emptySetupError ?? ''}};${preReadSetupStartCall}let ${environmentVar}=await ${readEnvironmentFn}(codexLinuxLocalEnvironmentConfigPath,${appServerClientVar});`;
}

function buildLinuxWorktreeEnvironmentLogEncode(logEncodeFn, templateContent) {
  const encodingArg = logEncodeFn.endsWith('.encode') ? '' : ',`utf8`';
  return `${logEncodeFn}(\`${templateContent}\`${encodingArg})`;
}

function buildLinuxWorktreeEnvironmentWorkerCleanupCallReplacement(
  { cleanupResultVar, cleanupFn },
  { loggerFn, sourceRootEnvVar, worktreeRootEnvVar }
) {
  return `let codexLinuxWorktreeSourceWorkspaceRoot=codexLinuxResolveWorktreeSourceWorkspaceRoot(e),codexLinuxInjectedCleanupEnvironment=codexLinuxWorktreeSourceWorkspaceRoot==null?(${loggerFn}().info(\`[worktree-delete] cleanup-source-root-unavailable\`,{safe:{worktreeId:t},sensitive:{workspaceRoot:e}}),{[${worktreeRootEnvVar}]:e}):{[${sourceRootEnvVar}]:codexLinuxWorktreeSourceWorkspaceRoot,[${worktreeRootEnvVar}]:e};let ${cleanupResultVar}=await ${cleanupFn}(e,a,void 0,r,codexLinuxInjectedCleanupEnvironment,n);`;
}

function buildLinuxWorktreeEnvironmentWorkerMoveToLocalReplacement(
  { deleteCleanupFn, loggerFn, worktreeIdExpression },
  { progressVar, resultFactory, warningsVar }
) {
  return `else ${progressVar}?.(\`apply-changes-to-local\`,\`skipped\`);let codexLinuxWorktreeCleanupId=${worktreeIdExpression};try{await ${deleteCleanupFn}(e.sourceWorktreeRoot,codexLinuxWorktreeCleanupId,t,n)}catch(codexLinuxCleanupError){${warningsVar}.push(\`cleanup-source-worktree-failed\`),${loggerFn}().warning(\`[thread-handoff] cleanup-to-local-failed\`,{safe:{worktreeId:codexLinuxWorktreeCleanupId},sensitive:{error:codexLinuxCleanupError,worktree:e.sourceWorktreeRoot}})}return ${resultFactory}({status:\`success\`,warnings:${warningsVar}})`;
}

function buildLinuxWorktreeEnvironmentWorkerCleanupSkipReplacement({ loggerFn }) {
  return `if(i==null||i===\`__none__\`){${loggerFn}().info(\`[worktree-delete] cleanup-skipped-no-environment\`,{safe:{worktreeId:t},sensitive:{configPath:i}});return;}`;
}

function buildLinuxNotificationSoundMethod({ childProcessVar }) {
  return `codexLinuxPlayNotificationSoundIfNeeded(){if(this.options.platform!==\`linux\`||typeof process.resourcesPath!=\`string\`)return;let e=i.default.join(process.resourcesPath,Ii);if(!(0,o.existsSync)(e))return;let t=[\`paplay\`,\`pw-play\`,\`aplay\`,\`ffplay\`],n=t.find(e=>{try{return ${childProcessVar}.spawnSync(\`sh\`,[\`-c\`,\`command -v \${e}\`],{stdio:\`ignore\`}).status===0}catch{return!1}});if(n==null){this.logger.warning(\`no Linux notification sound player found\`,{safe:{players:t},sensitive:{soundPath:e}});return}try{let t=n===\`ffplay\`?[\`-nodisp\`,\`-autoexit\`,\`-loglevel\`,\`quiet\`,e]:[e],r=${childProcessVar}.spawn(n,t,{detached:!0,stdio:\`ignore\`});r.on(\`error\`,e=>{this.logger.warning(\`failed to play Linux notification sound\`,{safe:{player:n},sensitive:{error:e}})}),r.unref()}catch(e){this.logger.warning(\`failed to play Linux notification sound\`,{safe:{player:n},sensitive:{error:e}})}}/* ${LINUX_NOTIFICATION_SOUND_PATCH_MARKER} */`;
}

function buildLinuxAvatarOverlayFrontmostMethod({ electronVar = 'n' } = {}) {
  return `codexLinuxKeepAvatarOverlayFrontmost(e,t=!1){/* ${LINUX_AVATAR_OVERLAY_PATCH_MARKER} */if(e.isDestroyed())return;if(process.platform===\`darwin\`){e.setVisibleOnAllWorkspaces(!0,{visibleOnFullScreen:!0,skipTransformProcessType:!0}),e.setAlwaysOnTop(!0,\`floating\`),t&&e.moveTop();return}e.setVisibleOnAllWorkspaces(!0),e.setAlwaysOnTop(!0,process.platform===\`linux\`&&process?.env?.CODEX_DESKTOP_DISABLE_LINUX_AVATAR_OVERLAY_PATCH!==\`1\`?\`screen-saver\`:\`floating\`),t&&e.moveTop()}codexLinuxRecoverAvatarOverlayVisibility(e){/* ${LINUX_AVATAR_OVERLAY_VISIBILITY_PATCH_MARKER} */if(process.platform!==\`linux\`||process?.env?.CODEX_DESKTOP_DISABLE_LINUX_AVATAR_OVERLAY_PATCH===\`1\`||e.isDestroyed())return;let t=()=>{e.isDestroyed()||(this.codexLinuxKeepAvatarOverlayFrontmost(e,!0),e.isVisible?.()!==!0&&e.showInactive(),this.codexLinuxKeepAvatarOverlayFrontmost(e,!0))};t(),setTimeout(t,50),setTimeout(t,250)}codexLinuxScheduleAvatarOverlayVisibilityRecovery(e){if(process.platform!==\`linux\`||process?.env?.CODEX_DESKTOP_DISABLE_LINUX_AVATAR_OVERLAY_PATCH===\`1\`||e.isDestroyed())return;let t=()=>{e.isDestroyed()||(this.rendererReady||(this.rendererReady=this.windowManager.isWebContentsReady(e.webContents.id)),this.rendererReady&&this.sendLayoutToRenderer(e),this.showWindow(e),this.applyPointerInteractivityPolicy())};setTimeout(t,50),setTimeout(t,250)}codexLinuxRegisterAvatarOverlayAutoClose(e){/* ${LINUX_AVATAR_OVERLAY_AUTO_CLOSE_PATCH_MARKER} */if(process.platform!==\`linux\`||process?.env?.CODEX_DESKTOP_DISABLE_LINUX_AVATAR_OVERLAY_AUTO_CLOSE===\`1\`)return;let t=new WeakSet,r=()=>this.codexLinuxCloseAvatarOverlayIfOnlyWindow(e),i=n=>{n!==e&&!n.isDestroyed?.()&&!t.has(n)&&(t.add(n),n.once(\`closed\`,()=>{setTimeout(r,0)}))};for(let e of ${electronVar}.BrowserWindow.getAllWindows())i(e);let a=(e,t)=>{i(t)};${electronVar}.app.on(\`browser-window-created\`,a),${electronVar}.app.once(\`before-quit\`,()=>{e.isDestroyed()||e.close()}),e.once(\`closed\`,()=>{${electronVar}.app.off(\`browser-window-created\`,a)})}codexLinuxCloseAvatarOverlayIfOnlyWindow(e){if(e.isDestroyed())return;let t=${electronVar}.BrowserWindow.getAllWindows().filter(t=>t!==e&&!t.isDestroyed()&&t.isVisible?.()!==!1);t.length===0&&e.close()}`;
}

function buildLinuxAvatarOverlayShowWindowMethod({
  windowVar,
  wasOpenVar,
  revealExpr = '',
  openStateExpr = 'this.broadcastOpenState()',
  postOpenExpr = ''
}) {
  return `showWindow(${windowVar}){if(${windowVar}.isDestroyed())return;let ${wasOpenVar}=this.isOpen();this.codexLinuxKeepAvatarOverlayFrontmost(${windowVar},!0),${revealExpr}${windowVar}.showInactive(),this.codexLinuxRecoverAvatarOverlayVisibility(${windowVar}),this.codexLinuxKeepAvatarOverlayFrontmost(${windowVar},!0),!${wasOpenVar}&&this.isOpen()&&(${openStateExpr})${postOpenExpr}}`;
}

function appendNamedImportAlias(imports, importedName, aliasName) {
  const parts = imports
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (
    parts.some(
      (part) =>
        part === aliasName ||
        part.endsWith(` as ${aliasName}`) ||
        part.endsWith(` ${aliasName}`)
    )
  ) {
    return imports;
  }
  return [...parts, `${importedName} as ${aliasName}`].join(',');
}

function getNamedImportLocalName(imports, importedName) {
  const parts = imports
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  for (const part of parts) {
    const aliasMatch = new RegExp(`^${escapeRegExp(importedName)}\\s+as\\s+(.+)$`).exec(part);
    if (aliasMatch?.[1]) {
      return aliasMatch[1].trim();
    }
    if (part === importedName) {
      return importedName;
    }
  }
  return null;
}

function findLinuxPetYappingUsageJsxRuntime(bundleSource) {
  const importMatch = bundleSource.match(LINUX_PET_YAPPING_USAGE_JSX_RUNTIME_IMPORT_PATTERN);
  const jsxFactory = importMatch?.groups?.imports
    ? getNamedImportLocalName(importMatch.groups.imports, 't')
    : null;
  if (!jsxFactory) {
    return findLinuxPetYappingUsageRolldownJsxRuntime(bundleSource);
  }
  const declarationPattern = new RegExp(
    `var (?<jsxVar>[A-Za-z_$][\\w$]*)=${escapeRegExp(jsxFactory)}\\(\\)(?<varTail>,[^;]+)?;`
  );
  const declarationMatch = bundleSource.match(declarationPattern);
  if (!declarationMatch?.groups?.jsxVar) {
    return null;
  }
  return {
    declarationPattern,
    jsxFactory,
    kind: 'declaration',
    jsxVar: declarationMatch.groups.jsxVar
  };
}

const LINUX_PET_YAPPING_USAGE_ROLLDOWN_REQUEST_IMPORT_NAMES = ['Ay', 'vD', 'YN', 'a'];
const LINUX_PET_YAPPING_USAGE_ROLLDOWN_JSX_IMPORT_NAMES = [
  'yA',
  'Lz',
  'BV',
  'I',
  'xl',
  'lc'
];
const LINUX_PET_YAPPING_USAGE_ROLLDOWN_SPLIT_REQUEST_IMPORTS = [
  {
    anchorImportNames: ['Ao', 'Fo', 'Io', 'Po'],
    requestImportName: 'a'
  },
  {
    anchorImportNames: ['xl'],
    requestImportName: 'ot'
  }
];

function findLinuxPetYappingUsageRolldownImport(bundleSource, importedNames) {
  for (const match of bundleSource.matchAll(LINUX_PET_YAPPING_USAGE_ROLLDOWN_APP_IMPORT_PATTERN)) {
    const imports = match.groups?.imports;
    if (!imports) {
      continue;
    }
    const importName = importedNames.find((name) =>
      getNamedImportLocalName(imports, name)
    );
    if (!importName) {
      continue;
    }
    return buildLinuxPetYappingUsageRolldownImport(match, importName);
  }
  return null;
}

function buildLinuxPetYappingUsageRolldownImport(match, importName) {
  const imports = match.groups.imports;
  return {
    imports,
    importName,
    localName: getNamedImportLocalName(imports, importName),
    module: match.groups.module,
    pattern: new RegExp(
      `import\\{(?<imports>${escapeRegExp(imports)})\\}from"(?<module>${escapeRegExp(
        match.groups.module
      )})";`
    )
  };
}

function findLinuxPetYappingUsageRolldownRequestImport(bundleSource) {
  const requestImport = findLinuxPetYappingUsageRolldownImport(
    bundleSource,
    LINUX_PET_YAPPING_USAGE_ROLLDOWN_REQUEST_IMPORT_NAMES
  );
  if (requestImport) {
    return {
      ...requestImport,
      requestFn: requestImport.localName,
      requestImportName: requestImport.importName
    };
  }

  for (const { anchorImportNames, requestImportName } of
    LINUX_PET_YAPPING_USAGE_ROLLDOWN_SPLIT_REQUEST_IMPORTS) {
    const splitRequestImport = findLinuxPetYappingUsageRolldownImport(
      bundleSource,
      anchorImportNames
    );
    if (splitRequestImport) {
      return {
        ...splitRequestImport,
        requestFn: getNamedImportLocalName(splitRequestImport.imports, requestImportName),
        requestImportName
      };
    }
  }

  const bvImport = findLinuxPetYappingUsageRolldownImport(bundleSource, ['BV']);
  if (!bvImport) {
    return null;
  }
  return {
    ...bvImport,
    requestFn: getNamedImportLocalName(bvImport.imports, 'YN'),
    requestImportName: 'YN'
  };
}

function findLinuxPetYappingUsageRolldownJsxImport(bundleSource) {
  const jsxImport = findLinuxPetYappingUsageRolldownImport(
    bundleSource,
    LINUX_PET_YAPPING_USAGE_ROLLDOWN_JSX_IMPORT_NAMES
  );
  if (!jsxImport) {
    return null;
  }
  return {
    ...jsxImport,
    jsxFactory: jsxImport.localName,
    jsxFactoryImportName: jsxImport.importName
  };
}

function findLinuxPetYappingUsageRolldownJsxRuntime(bundleSource) {
  const jsxImport = findLinuxPetYappingUsageRolldownJsxImport(bundleSource);
  if (!jsxImport?.jsxFactory) {
    return null;
  }
  const assignmentPattern = new RegExp(
    `(?<jsxVar>[A-Za-z_$][\\w$]*)=${escapeRegExp(jsxImport.jsxFactory)}\\(\\),`
  );
  const assignmentMatch = bundleSource.match(assignmentPattern);
  if (!assignmentMatch?.groups?.jsxVar) {
    return null;
  }
  return {
    declarationPattern: assignmentPattern,
    jsxFactory: jsxImport.jsxFactory,
    kind: 'assignment',
    jsxVar: assignmentMatch.groups.jsxVar
  };
}

function buildLinuxPetYappingUsageComponent({ jsxVar, reactVar }) {
  return `function codexLinuxPetYappingUsage(){let[codexLinuxUsageData,codexLinuxSetUsageData]=${reactVar}.useState(null),[codexLinuxUsageTick,codexLinuxSetUsageTick]=${reactVar}.useState(()=>Date.now()),[codexLinuxAvatarBox,codexLinuxSetAvatarBox]=${reactVar}.useState(()=>({width:112,height:121})),codexLinuxWrapRef=${reactVar}.useRef(null);${reactVar}.useEffect(()=>{let e=!1,t=async()=>{try{let t=await codexLinuxFetchUsage(\`codex-linux-pet-usage\`);e||codexLinuxSetUsageData(t)}catch{e||codexLinuxSetUsageData(null)}};t();let n=setInterval(t,1e4);return()=>{e=!0,clearInterval(n)}},[]),${reactVar}.useEffect(()=>{let e=setInterval(()=>{codexLinuxSetUsageTick(Date.now())},1e4);return()=>{clearInterval(e)}},[]),${reactVar}.useLayoutEffect(()=>{let e=codexLinuxWrapRef.current?.parentElement?.querySelector(\`.codex-avatar-root\`);if(e==null)return;let t=()=>{let t=e.getBoundingClientRect(),n=Math.ceil(t.width),r=Math.ceil(t.height);n>0&&r>0&&codexLinuxSetAvatarBox(e=>e.width===n&&e.height===r?e:{width:n,height:r})};if(t(),typeof ResizeObserver===\`undefined\`)return;let n=new ResizeObserver(t);return n.observe(e),()=>{n.disconnect()}},[]);let e=codexLinuxUsageData?.rate_limit,t=[e?.primary_window,e?.secondary_window].filter(Boolean),n=e=>e==null?null:{used:e.used_percent??0,remaining:Math.min(Math.max(100-(e.used_percent??0),0),100),mins:e.limit_window_seconds==null?null:e.limit_window_seconds/60},r=(e,t)=>e.length===0?null:e.reduce((e,n)=>{let r=Math.abs((e.limit_window_seconds??0)/60-t),i=Math.abs((n.limit_window_seconds??0)/60-t);return i<r?n:i>r?e:(n.limit_window_seconds??0)>(e.limit_window_seconds??0)?n:e}),i=n(r(t.filter(e=>((e.limit_window_seconds??0)/60)<1440),300)),a=n(r(t.filter(e=>((e.limit_window_seconds??0)/60)>=1440),10080)),o=i?.remaining,s=a?.remaining,c=Math.max(0,Math.min(100,o??0)),l=Math.max(0,Math.min(100,s??0)),u=Math.floor(codexLinuxUsageTick/1e4),d=o==null&&s==null,f=u%2===0,p=d?\`Checking usage...\`:f?\`5-hour usage left: \${Math.round(c)}%\`:\`Weekly usage left: \${Math.round(l)}%\`,m=d?\`Usage loading...\`:\`5H left \${Math.round(c)}% | Weekly left \${Math.round(l)}%\`,h={\"--codex-usage-avatar-width\":\`\${codexLinuxAvatarBox.width}px\`,\"--codex-usage-avatar-height\":\`\${codexLinuxAvatarBox.height}px\`};return(0,${jsxVar}.jsxs)(\`div\`,{ref:codexLinuxWrapRef,className:\`codex-usage-yap-wrap\`,\"aria-hidden\":\`true\`,style:h,children:[(0,${jsxVar}.jsxs)(\`div\`,{key:u,className:\`codex-usage-yap-pop \${f?\`codex-usage-yap-five-hour\`:\`codex-usage-yap-weekly\`}\`,children:[(0,${jsxVar}.jsxs)(\`svg\`,{className:\`codex-usage-yap-svg\`,viewBox:\`0 0 220 74\`,preserveAspectRatio:\`none\`,children:[(0,${jsxVar}.jsx)(\`path\`,{className:\`codex-usage-yap-shadow\`,d:\`M43 8H170V14H190V20H204V44H190V50H122V56H98V70H84V56H43V50H24V44H12V20H24V14H43Z\`}),(0,${jsxVar}.jsx)(\`path\`,{className:\`codex-usage-yap-fill\`,d:\`M42 6H168V12H188V18H202V42H188V48H120V54H96V68H86V54H42V48H24V42H14V18H24V12H42Z\`})]}),(0,${jsxVar}.jsx)(\`span\`,{className:\`codex-usage-yap-text\`,children:p})]}),(0,${jsxVar}.jsx)(\`div\`,{className:\`codex-usage-hover-info\`,children:m})]})}`;
}

function buildLinuxPetYappingUsageCss() {
  return `/* ${LINUX_PET_YAPPING_USAGE_PATCH_MARKER} */
.codex-usage-yap-wrap{position:absolute;top:-3.25rem;left:-1.15rem;width:max(12.8rem,calc(var(--codex-usage-avatar-width,112px) + 3.55rem));height:calc(var(--codex-usage-avatar-height,121px) + 3.8rem);z-index:30;pointer-events:none}
.codex-usage-yap-pop{position:absolute;top:.06rem;right:.2rem;width:11.2rem;height:3.75rem;color:#050505;font:600 10px/1 "Press Start 2P","Silkscreen","Pixelify Sans","Pixel Operator",ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:0;text-transform:none;text-rendering:geometricPrecision;image-rendering:pixelated;opacity:0;transform:translateY(5px) scale(.94);animation:codex-usage-yap-pop 10s ease-in-out both}
.codex-usage-yap-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;filter:drop-shadow(4px 4px 0 rgba(0,0,0,.25));shape-rendering:crispEdges}
.codex-usage-yap-shadow{fill:#000}
.codex-usage-yap-fill{fill:#fff;stroke:#000;stroke-width:5px;stroke-linejoin:miter}
.codex-usage-yap-text{position:absolute;top:1.44rem;left:.65rem;right:.65rem;z-index:1;display:block;transform:translateY(-50%);white-space:nowrap;text-align:center;text-shadow:none}
.codex-usage-yap-weekly,.codex-usage-yap-five-hour{color:#050505}
.codex-usage-hover-info{position:absolute;left:.6rem;bottom:.08rem;z-index:2;min-width:10.4rem;border:3px solid #000;background:#fff;color:#050505;box-shadow:3px 3px 0 rgba(0,0,0,.28);padding:5px 7px;font:600 9px/1.2 "Press Start 2P","Silkscreen","Pixelify Sans","Pixel Operator",ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:0;text-align:center;white-space:nowrap;image-rendering:pixelated;opacity:0;transform:translateY(-2px) scale(.96);transition:opacity .12s steps(2,end),transform .12s steps(2,end)}
[data-avatar-overlay-hit-region="mascot"]:hover .codex-usage-hover-info,[data-avatar-mascot="true"]:hover .codex-usage-hover-info{opacity:1;transform:translateY(0) scale(1)}
@keyframes codex-usage-yap-pop{0%{opacity:0;transform:translateY(8px) scale(.9)}3%{opacity:1;transform:translateY(0) scale(1)}5%{transform:translateY(-2px) scale(1.02,.98)}7%{transform:translateY(0) scale(.99,1.02)}9%{transform:translateY(-1px) scale(1.01,.99)}12%{transform:translateY(0) scale(1)}24%{opacity:1;transform:translateY(0) scale(1)}34%{opacity:0;transform:translateY(-4px) scale(.96)}100%{opacity:0;transform:translateY(-4px) scale(.96)}}`;
}

function buildLinuxBrowserUseRuntimePathsHelper() {
  return `function codexLinuxBrowserUseRuntimePaths(e){/* ${LINUX_BROWSER_USE_RUNTIME_PATHS_PATCH_MARKER} */if(e.platform!==\`linux\`||process?.env?.CODEX_DESKTOP_DISABLE_LINUX_BROWSER_USE_RUNTIME_PATH_PATCH===\`1\`||typeof e.resourcesPath!==\`string\`)return e;let t=typeof process.getBuiltinModule===\`function\`?process.getBuiltinModule(\`node:path\`):null,n=typeof process.getBuiltinModule===\`function\`?process.getBuiltinModule(\`node:fs\`):null;if(!t||!n)return e;let r=t.join(e.resourcesPath,\`node\`),i=t.join(e.resourcesPath,\`node_repl\`),a=t.join(e.resourcesPath,\`cua_node\`,\`lib\`,\`node_modules\`);try{n.accessSync(r,n.constants.X_OK),n.accessSync(i,n.constants.X_OK)}catch{return e}let o=Array.isArray(e.nodeModuleDirs)?[...e.nodeModuleDirs]:[];try{n.statSync(a).isDirectory()&&!o.includes(a)&&o.push(a)}catch{}return{...e,nodeModuleDirs:o,nodePath:r,nodePathSource:\`codex-linux-wrapper\`,nodeReplPath:i,nodeReplPathSource:\`codex-linux-wrapper\`}}`;
}

function buildLinuxBundledBrowserChromePluginsHelper() {
  return `function codexLinuxBundledBrowserChromePlugins(e){if(e.platform!==\`linux\`||process?.env?.CODEX_DESKTOP_DISABLE_LINUX_BUNDLED_BROWSER_CHROME_PLUGINS_PATCH===\`1\`||typeof e.resourcesPath!==\`string\`)return e.availableDescriptors;let t=typeof process.getBuiltinModule===\`function\`?process.getBuiltinModule(\`node:path\`):null,n=typeof process.getBuiltinModule===\`function\`?process.getBuiltinModule(\`node:fs\`):null;if(!t||!n)return e.availableDescriptors;let r=new Map(e.availableDescriptors.map(e=>[e.name,e]));for(let i of e.targetPluginNames){if(r.has(i))continue;let a=e.allDescriptors.find(e=>e?.name===i);if(a==null)continue;let o=[t.join(e.resourcesPath,\`plugins\`,\`openai-bundled\`,\`plugins\`,i,\`.codex-plugin\`,\`plugin.json\`),t.join(e.resourcesPath,\`app.asar.unpacked\`,\`plugins\`,\`openai-bundled\`,\`plugins\`,i,\`.codex-plugin\`,\`plugin.json\`)];for(let e of o)try{if(n.existsSync(e)){r.set(i,a);break}}catch{}}return[...r.values()]}`;
}

function buildLinuxBundledBrowserChromeMarketplaceHelper() {
  return `function codexLinuxBundledBrowserChromeMarketplace(e){/* ${LINUX_BUNDLED_BROWSER_CHROME_PLUGINS_PATCH_MARKER} */if(process.platform!==\`linux\`||process?.env?.CODEX_DESKTOP_DISABLE_LINUX_BUNDLED_BROWSER_CHROME_PLUGINS_PATCH===\`1\`||typeof e.sourceMarketplaceRoot!==\`string\`)return e.availableMarketplace;let t=typeof process.getBuiltinModule===\`function\`?process.getBuiltinModule(\`node:path\`):null,n=typeof process.getBuiltinModule===\`function\`?process.getBuiltinModule(\`node:fs\`):null;if(!t||!n)return e.availableMarketplace;let r=new Map((e.availableMarketplace?.plugins??[]).map(e=>[e.name,e]));for(let i of e.targetPluginNames){if(r.has(i))continue;let a=e.allMarketplace?.plugins?.find(e=>e?.name===i);if(a==null)continue;try{n.existsSync(t.join(e.sourceMarketplaceRoot,\`plugins\`,i,\`.codex-plugin\`,\`plugin.json\`))&&r.set(i,a)}catch{}}return{...e.availableMarketplace,plugins:[...r.values()]}}`;
}

function buildLinuxChromeNativeHostRuntimePathsHelper() {
  return `function codexLinuxChromeNativeHostRuntimePaths({runtimePaths:e,resourcesPath:t}){/* ${LINUX_CHROME_NATIVE_HOST_RUNTIME_PATHS_PATCH_MARKER} */if(process.platform!==\`linux\`||process?.env?.CODEX_DESKTOP_DISABLE_LINUX_CHROME_NATIVE_HOST_RUNTIME_PATH_PATCH===\`1\`||typeof t!==\`string\`)return e;let n=typeof process.getBuiltinModule===\`function\`?process.getBuiltinModule(\`node:path\`):null,r=typeof process.getBuiltinModule===\`function\`?process.getBuiltinModule(\`node:fs\`):null;if(!n||!r)return e;let i=n.join(t,\`node\`),a=n.join(t,\`node_repl\`),o=n.join(t,\`cua_node\`,\`lib\`,\`node_modules\`);try{r.accessSync(i,r.constants.X_OK),r.accessSync(a,r.constants.X_OK)}catch{return e}let s=Array.isArray(e.nodeModuleDirs)?[...e.nodeModuleDirs]:[];try{r.statSync(o).isDirectory()&&!s.includes(o)&&s.push(o)}catch{}return{...e,nodePath:i,nodeReplPath:a,nodeModuleDirs:s}}`;
}

function buildLinuxBrowserUseHostFetchHelper({
  authHeaderFn,
  desktopOriginatorVar,
  electronVar = 'n'
}) {
  return `var codexLinuxBrowserUseElectron=${electronVar};function codexLinuxBrowserUseHostFetchSession(e){let t=codexLinuxBrowserUseHostFetchUrl(e),n=t.searchParams.get(\`conversation_id\`),r=t.searchParams.get(\`turn_id\`);if(typeof n!==\`string\`||n.length===0||typeof r!==\`string\`||r.length===0)throw Error(\`Browser Use policy fetch is missing session metadata.\`);return{session_id:n,turn_id:r}}function codexLinuxBrowserUseHostFetchUrl(e){if(e==null||typeof e.url!==\`string\`)throw Error(\`Invalid Browser Use host fetch request.\`);let t=new URL(e.url);if(t.protocol!==\`https:\`||t.hostname!==\`chatgpt.com\`||t.pathname!==\`/backend-api/aura/site_status\`||t.searchParams.get(\`url_request_source\`)!==\`codex_browser_use\`)throw Error(\`Browser Use host fetch only supports authenticated policy checks.\`);return t}async function codexLinuxBrowserUseHostFetch(e,t){let r=codexLinuxBrowserUseHostFetchUrl(e),i=typeof e.method===\`string\`?e.method.toUpperCase():\`GET\`;if(i!==\`GET\`&&i!==\`HEAD\`)throw Error(\`Browser Use policy fetch only supports GET or HEAD.\`);if(e.bodyBase64!=null)throw Error(\`Browser Use policy fetch does not support request bodies.\`);let a=typeof t===\`function\`?t():null;if(a==null)throw Error(\`Browser Use policy fetch requires an authenticated desktop host fetch bridge, but this desktop build does not support nodeRepl/fetch.\`);let o={},s=await ${authHeaderFn}({action:\`load Browser Use policy status\`,appServerClient:a,desktopOriginator:${desktopOriginatorVar},headers:o}),c=await codexLinuxBrowserUseElectron.net.fetch(r.toString(),{method:i,headers:s});if(c.status===401){s=await ${authHeaderFn}({action:\`load Browser Use policy status\`,appServerClient:a,desktopOriginator:${desktopOriginatorVar},headers:o,refreshToken:!0}),c=await codexLinuxBrowserUseElectron.net.fetch(r.toString(),{method:i,headers:s})}let l=Buffer.from(await c.arrayBuffer()).toString(\`base64\`);return{status:c.status,statusText:c.statusText,headers:Object.fromEntries(c.headers.entries()),bodyBase64:l}}function codexLinuxBrowserUseElicitationSession(e){let t=e?.session_id,n=e?.turn_id;if(typeof t!==\`string\`||t.length===0||typeof n!==\`string\`||n.length===0)throw Error(\`Browser Use permission request is missing session metadata.\`);return{session_id:t,turn_id:n}}function codexLinuxBrowserUseElicitationOrigin(e){let t=e?.meta?.origin;if(typeof t!==\`string\`||t.trim().length===0)return null;try{let e=new URL(t);return e.protocol!==\`http:\`&&e.protocol!==\`https:\`?null:e.origin}catch{return null}}function codexLinuxBrowserUseBuiltins(){if(typeof process.getBuiltinModule!==\`function\`)return{fs:null,path:null,os:null};return{fs:process.getBuiltinModule(\`node:fs\`),path:process.getBuiltinModule(\`node:path\`),os:process.getBuiltinModule(\`node:os\`)}}function codexLinuxBrowserUsePreferencesPath(){let e=codexLinuxBrowserUseBuiltins(),t=e.path,n=e.os;if(!t||!n)return null;let r=typeof process.env.XDG_CONFIG_HOME===\`string\`&&process.env.XDG_CONFIG_HOME.trim().length>0?process.env.XDG_CONFIG_HOME.trim():t.join(n.homedir(),\`.config\`);return t.join(r,\`codex-desktop\`,\`browser-use-preferences.json\`)}function codexLinuxBrowserUseReadPreferences(){let e={allowAllOrigins:!1},t=codexLinuxBrowserUseBuiltins(),n=t.fs,r=codexLinuxBrowserUsePreferencesPath();if(!n||r==null)return e;try{let t=JSON.parse(n.readFileSync(r,\`utf8\`));return typeof t==\`object\`&&t!=null&&!Array.isArray(t)?{allowAllOrigins:t.allowAllOrigins===!0}:e}catch{return e}}function codexLinuxBrowserUseWritePreferences(e){let t=codexLinuxBrowserUseBuiltins(),n=t.fs,r=t.path,i=codexLinuxBrowserUsePreferencesPath();if(!n||!r||i==null)return;n.mkdirSync(r.dirname(i),{recursive:!0});n.writeFileSync(i,JSON.stringify({allowAllOrigins:e.allowAllOrigins===!0},null,2)+\`\\n\`,\`utf8\`)}function codexLinuxBrowserUseShouldAutoAcceptAllOrigins(e){let t=e?.meta;if(t?.connector_id!==\`browser-use\`||t?.connector_name!==\`Browser Use\`)return!1;if(t?.persist!==\`always\`||t?.sensitive_data!=null)return!1;let n=t?.origin;if(typeof n!==\`string\`||n.trim().length===0)return!1;let r;try{r=new URL(n)}catch{return!1}if((r.protocol!==\`http:\`&&r.protocol!==\`https:\`)||r.hostname===\`localhost\`||r.hostname.endsWith(\`.localhost\`)||r.hostname===\`127.0.0.1\`||r.hostname===\`::1\`||r.hostname===\`[::1]\`)return!1;return codexLinuxBrowserUseReadPreferences().allowAllOrigins===!0}function codexLinuxBrowserUseAllowAllOriginsMenuItem(){return{id:\`codex-linux-browser-use-allow-all-origins\`,label:\`Allow Browser Use to access all websites without asking\`,type:\`checkbox\`,checked:codexLinuxBrowserUseReadPreferences().allowAllOrigins===!0,click:e=>{codexLinuxBrowserUseWritePreferences({allowAllOrigins:e?.checked===!0})}}}function codexLinuxBrowserUseResetBrowserConfigCandidates(){let e=codexLinuxBrowserUseBuiltins(),t=e.path,n=e.os;if(!t||!n)return[];let r=(process.env.CODEX_HOME??\`\`).trim(),i=t.join(n.homedir(),\`.codex\`,\`browser\`,\`config.toml\`);return[...new Set([r.length>0?t.join(r,\`browser\`,\`config.toml\`):null,i].filter(Boolean))]}function codexLinuxBrowserUseResetSitePermissions(){let e=codexLinuxBrowserUseBuiltins(),t=e.fs;if(!t)return{removedCount:0};let n=0;for(let e of codexLinuxBrowserUseResetBrowserConfigCandidates())try{t.rmSync(e,{force:!0}),n+=1}catch{}return{removedCount:n}}function codexLinuxBrowserUseResetSitePermissionsMenuItem(){return{id:\`codex-linux-browser-use-reset-site-permissions\`,label:\`Reset Browser Use site permissions\`,click:()=>{let e=codexLinuxBrowserUseResetSitePermissions();codexLinuxBrowserUseElectron.dialog.showMessageBox({type:\`info\`,title:\`Browser Use permissions reset\`,message:\`Browser Use site permissions were reset.\`,detail:e.removedCount>0?\`Removed saved Browser Use site permissions.\`:\`No saved Browser Use site permissions were found.\`})}}}async function codexLinuxBrowserUseCreateElicitation(e){if(e?.meta?.connector_id!==\`browser-use\`)throw Error(\`Linux Browser Use permission prompts only support Browser Use elicitations.\`);if(codexLinuxBrowserUseShouldAutoAcceptAllOrigins(e))return{action:\`accept\`};let t=typeof e.message===\`string\`&&e.message.trim().length>0?e.message:\`Allow Browser Use to continue?\`,r=codexLinuxBrowserUseElicitationOrigin(e),i=e?.meta?.sensitive_data===\`browsing_history\`?\`This allows Browser Use to read browsing history for this task.\`:r!=null?\`This allows Browser Use to navigate to and inspect \${r} for this task.\`:\`This allows Browser Use to continue this task.\`,a=await codexLinuxBrowserUseElectron.dialog.showMessageBox({type:\`question\`,buttons:[\`Allow\`,\`Deny\`],defaultId:0,cancelId:1,noLink:!0,title:\`Allow Browser Use?\`,message:t,detail:i});return{action:a.response===0?\`accept\`:\`decline\`}}/* ${LINUX_BROWSER_USE_HOST_FETCH_PATCH_MARKER} */`;
}

const TERMINAL_COMPONENT_FILE_MARKER = 'data-codex-terminal';
const TERMINAL_SESSION_CREATE_PATTERN =
  /(?<createDeclaration>let (?:[A-Za-z_$][\w$]*=[^,;]+,)*)?(?<createdSessionVar>[A-Za-z_$][\w$]*)=(?<resumeSessionVar>[A-Za-z_$][\w$]*)\?\?(?<service>[A-Za-z_$][\w$]*)\.create\(\{conversationId:(?<conversationIdVar>[A-Za-z_$][\w$]*),(?:conversationTitle:(?<conversationTitleVar>[A-Za-z_$][\w$]*),)?hostId:(?<hostIdVar>[A-Za-z_$][\w$]*)\?\?null,cwd:(?<cwdVar>[A-Za-z_$][\w$]*)\?\?null\}\);(?<sessionRef>[A-Za-z_$][\w$]*)\.current=\k<createdSessionVar>,(?<attachStateRef>[A-Za-z_$][\w$]*)\.current=!1;/;
const TERMINAL_ATTACH_WITH_ATTACH_PATTERN =
  /(?<resumeSessionVar>[A-Za-z_$][\w$]*)&&requestAnimationFrame\(\(\)=>\{(?<guardVar>[A-Za-z_$][\w$]*)\|\|(?<service>[A-Za-z_$][\w$]*)\.attach\(\{sessionId:\k<resumeSessionVar>,conversationId:(?<conversationIdVar>[A-Za-z_$][\w$]*),(?:conversationTitle:(?<conversationTitleVar>[A-Za-z_$][\w$]*),)?hostId:(?<hostIdVar>[A-Za-z_$][\w$]*)\?\?null,cwd:(?<cwdVar>[A-Za-z_$][\w$]*)\?\?null,cols:(?<terminalVar>[A-Za-z_$][\w$]*)\.cols,rows:\k<terminalVar>\.rows\}\)\}\);/;
const TERMINAL_ATTACH_WITH_CREATE_PATTERN =
  /(?<resumeSessionVar>[A-Za-z_$][\w$]*)&&requestAnimationFrame\(\(\)=>\{(?<guardVar>[A-Za-z_$][\w$]*)\|\|(?<service>[A-Za-z_$][\w$]*)\.create\(\{sessionId:\k<resumeSessionVar>,conversationId:(?<conversationIdVar>[A-Za-z_$][\w$]*),(?:conversationTitle:(?<conversationTitleVar>[A-Za-z_$][\w$]*),)?hostId:(?<hostIdVar>[A-Za-z_$][\w$]*)\?\?null,cwd:(?<cwdVar>[A-Za-z_$][\w$]*)\?\?null,cols:(?<terminalVar>[A-Za-z_$][\w$]*)\.cols,rows:\k<terminalVar>\.rows\}\)\}\);/;
const TERMINAL_ATTACH_WITH_UNSTARTED_CREATE_PATTERN =
  /(?<resumeSessionVar>[A-Za-z_$][\w$]*)&&!(?<service>[A-Za-z_$][\w$]*)\.isSessionStarted\(\k<resumeSessionVar>\)&&requestAnimationFrame\(\(\)=>\{(?<guardVar>[A-Za-z_$][\w$]*)\|\|\k<service>\.create\(\{sessionId:\k<resumeSessionVar>,conversationId:(?<conversationIdVar>[A-Za-z_$][\w$]*),(?:conversationTitle:(?<conversationTitleVar>[A-Za-z_$][\w$]*),)?hostId:(?<hostIdVar>[A-Za-z_$][\w$]*)\?\?null,cwd:(?<cwdVar>[A-Za-z_$][\w$]*)\?\?null,cols:(?<terminalVar>[A-Za-z_$][\w$]*)\.cols,rows:\k<terminalVar>\.rows\}\)\}\);/;
const TERMINAL_ON_ATTACH_WITH_DETAILS_PREFIX_PATTERN =
  /onAttach:\((?<eventVar>[A-Za-z_$][\w$]*),(?<detailsVar>[A-Za-z_$][\w$]*)\)=>\{(?<guardVar>[A-Za-z_$][\w$]*)\|\|\(/;
const TERMINAL_ON_ATTACH_NO_ARGS_PREFIX_PATTERN =
  /onAttach:\(\)=>\{(?<guardVar>[A-Za-z_$][\w$]*)\|\|\(/;
const TERMINAL_CLEANUP_PATTERN_LEGACY =
  /return (?<observerVar>[A-Za-z_$][\w$]*)\.observe\(e\),\(\)=>\{(?<guardVar>[A-Za-z_$][\w$]*)=!0,(?<frameVar>[A-Za-z_$][\w$]*)!=null&&\(cancelAnimationFrame\(\k<frameVar>\),\k<frameVar>=null\),\k<observerVar>\.disconnect\(\),(?<dataDisposeVar>[A-Za-z_$][\w$]*)\.dispose\(\),(?<keyDisposeVar>[A-Za-z_$][\w$]*)\.dispose\(\),(?<registerDisposeVar>[A-Za-z_$][\w$]*)\(\),(?<fitRef>[A-Za-z_$][\w$]*)\.current=null,(?<sessionRef>[A-Za-z_$][\w$]*)\.current=null,(?<attachStateRef>[A-Za-z_$][\w$]*)\.current=!1,(?<resumeSessionVar>[A-Za-z_$][\w$]*)\|\|(?<service>[A-Za-z_$][\w$]*)\.close\((?<createdSessionVar>[A-Za-z_$][\w$]*)\),(?<terminalVar>[A-Za-z_$][\w$]*)\.dispose\(\),(?<terminalRef>[A-Za-z_$][\w$]*)\.current=null\}/;
const TERMINAL_CLEANUP_PATTERN_26_415 =
  /return (?<observerVar>[A-Za-z_$][\w$]*)\.observe\(e\),\(\)=>\{(?<guardVar>[A-Za-z_$][\w$]*)=!0,(?<frameVar>[A-Za-z_$][\w$]*)!=null&&\(cancelAnimationFrame\(\k<frameVar>\),\k<frameVar>=null\),\k<observerVar>\.disconnect\(\),(?<dataDisposeVar>[A-Za-z_$][\w$]*)\.dispose\(\),(?<titleDisposeVar>[A-Za-z_$][\w$]*)\.dispose\(\),(?<keyDisposeVar>[A-Za-z_$][\w$]*)\.dispose\(\),(?<registerDisposeVar>[A-Za-z_$][\w$]*)\(\),(?<fitRef>[A-Za-z_$][\w$]*)\.current=null,(?<sessionRef>[A-Za-z_$][\w$]*)\.current=null,(?<attachStateRef>[A-Za-z_$][\w$]*)\.current=!1,(?<resumeSessionVar>[A-Za-z_$][\w$]*)\|\|(?<service>[A-Za-z_$][\w$]*)\.close\((?<createdSessionVar>[A-Za-z_$][\w$]*)\),(?<terminalVar>[A-Za-z_$][\w$]*)\.dispose\(\),(?<terminalRef>[A-Za-z_$][\w$]*)\.current=null\}/;
const TERMINAL_CLEANUP_PATTERN_26_611 =
  /return (?<observerVar>[A-Za-z_$][\w$]*)\.observe\(e\),\(\)=>\{(?<guardVar>[A-Za-z_$][\w$]*)=!0,(?<frameVar>[A-Za-z_$][\w$]*)!=null&&\(cancelAnimationFrame\(\k<frameVar>\),\k<frameVar>=null\),\k<observerVar>\.disconnect\(\),(?<dataDisposeVar>[A-Za-z_$][\w$]*)\.dispose\(\),(?<titleDisposeVar>[A-Za-z_$][\w$]*)\.dispose\(\),(?<keyDisposeVar>[A-Za-z_$][\w$]*)\.dispose\(\),(?<registerDisposeVar>[A-Za-z_$][\w$]*)\(\),(?<fitRef>[A-Za-z_$][\w$]*)\.current=null,(?<sessionRef>[A-Za-z_$][\w$]*)\.current=null,(?<attachStateRef>[A-Za-z_$][\w$]*)\.current=!1,(?<resumeSessionVar>[A-Za-z_$][\w$]*)\|\|(?<service>[A-Za-z_$][\w$]*)\.close\((?<createdSessionVar>[A-Za-z_$][\w$]*)\),(?<extraCleanupVar>[A-Za-z_$][\w$]*)\(\),(?<terminalVar>[A-Za-z_$][\w$]*)\.dispose\(\),(?<terminalRef>[A-Za-z_$][\w$]*)\.current=null\}/;
const INVALID_TERMINAL_HELPER_ESCAPE_PATTERN = '${"${"}';
const LINUX_NEW_THREAD_MODEL_PATCH_MARKER = 'codexLinuxPendingModelSettings';
const NEW_THREAD_MODEL_STATE_MARKERS = [
  'latestCollaborationMode?.settings?.model',
  'latestCollaborationMode?.settings?.reasoning_effort'
];
const NEW_THREAD_MODEL_STATE_EVIDENCE_MARKERS = [
  'latestCollaborationMode',
  'set-model-and-reasoning-for-next-turn',
  'copilot-default-model',
  'set-default-model-config-for-host',
  'setDefaultModelConfig',
  'modelSettings',
  'setModelAndReasoningEffort',
  'reasoning_effort'
];
const NEW_THREAD_MODEL_SUBMIT_EVIDENCE_MARKERS = [
  'thread/start',
  'start-conversation',
  'read-config-for-host',
  'workspaceRoots:',
  'fileAttachments:',
  'addedFiles:',
  'collaborationMode:',
  'config:',
  'model_reasoning_effort'
];
const NEW_THREAD_MODEL_STATE_SNIPPET_CURRENT = 'let m=p,h=Dn(n,Sf),g=r===`copilot`,_;';
const NEW_THREAD_MODEL_STATE_REPLACEMENT_CURRENT =
  'let m=p,h=Dn(n,Sf),g=r===`copilot`,codexLinuxIsFreshComposer=n==null,[codexLinuxPendingModelSettings,codexLinuxSetPendingModelSettings]=(0,Z.useState)(null),_;let codexLinuxFreshComposerBaseSettings=g?u:l;(0,Z.useEffect)(()=>{if(!codexLinuxIsFreshComposer){codexLinuxPendingModelSettings!=null&&codexLinuxSetPendingModelSettings(null);return}if(codexLinuxPendingModelSettings==null)return;if(codexLinuxPendingModelSettings.cwd!==s){codexLinuxSetPendingModelSettings(null);return}!codexLinuxFreshComposerBaseSettings.isLoading&&codexLinuxFreshComposerBaseSettings.model===codexLinuxPendingModelSettings.model&&codexLinuxFreshComposerBaseSettings.reasoningEffort===codexLinuxPendingModelSettings.reasoningEffort&&codexLinuxSetPendingModelSettings(null)},[codexLinuxIsFreshComposer,codexLinuxPendingModelSettings,s,codexLinuxFreshComposerBaseSettings.model,codexLinuxFreshComposerBaseSettings.reasoningEffort,codexLinuxFreshComposerBaseSettings.isLoading]);';
const NEW_THREAD_MODEL_STATE_SNIPPET_26_406 =
  'f=d!=null&&d.trim().length>0?d:null,p=Vr(e,e=>e?.latestCollaborationMode?.settings?.reasoning_effort??null),m=a?.authMethod===`copilot`,h=(0,Z.useCallback)(async(t,n)=>{e==null||r==null||await rm(r,e,t,n)},[e,r]),g=u?{model:f??c.model,reasoningEffort:p,profile:c.profile,isLoading:!1}:m?l:c,{setData:_}=Mo(`copilot-default-model`),v=Tee({hostId:i,cwd:s});';
const NEW_THREAD_MODEL_STATE_REPLACEMENT_26_406 =
  'f=d!=null&&d.trim().length>0?d:null,p=Vr(e,e=>e?.latestCollaborationMode?.settings?.reasoning_effort??null),m=a?.authMethod===`copilot`,codexLinuxIsFreshComposer=e==null,[codexLinuxPendingModelSettings,codexLinuxSetPendingModelSettings]=(0,Z.useState)(null),h=(0,Z.useCallback)(async(t,n)=>{e==null||r==null||await rm(r,e,t,n)},[e,r]),g=u?{model:f??c.model,reasoningEffort:p,profile:c.profile,isLoading:!1}:codexLinuxIsFreshComposer&&codexLinuxPendingModelSettings!=null?{model:codexLinuxPendingModelSettings.model,reasoningEffort:codexLinuxPendingModelSettings.reasoningEffort,profile:c.profile,isLoading:!1}:m?l:c,{setData:_}=Mo(`copilot-default-model`),v=Tee({hostId:i,cwd:s});(0,Z.useEffect)(()=>{if(!codexLinuxIsFreshComposer){codexLinuxPendingModelSettings!=null&&codexLinuxSetPendingModelSettings(null);return}if(codexLinuxPendingModelSettings==null)return;if(codexLinuxPendingModelSettings.cwd!==s){codexLinuxSetPendingModelSettings(null);return}!c.isLoading&&c.model===codexLinuxPendingModelSettings.model&&c.reasoningEffort===codexLinuxPendingModelSettings.reasoningEffort&&codexLinuxSetPendingModelSettings(null)},[codexLinuxIsFreshComposer,codexLinuxPendingModelSettings,s,c.isLoading,c.model,c.reasoningEffort]);';
const NEW_THREAD_MODEL_SETTINGS_SNIPPET_CURRENT =
  '?(y=d?{model:m??l.model,reasoningEffort:h,isLoading:!1}:g?u:l,';
const NEW_THREAD_MODEL_SETTINGS_REPLACEMENT_CURRENT =
  '?(y=d?{model:m??l.model,reasoningEffort:h,isLoading:!1}:codexLinuxIsFreshComposer&&codexLinuxPendingModelSettings!=null?{model:codexLinuxPendingModelSettings.model,reasoningEffort:codexLinuxPendingModelSettings.reasoningEffort,isLoading:!1}:g?u:l,';
const NEW_THREAD_MODEL_SETTER_SNIPPET_CURRENT =
  '?(D=async(e,t)=>{if(await v(e,t),g){C(e);return}try{await i.setDefaultModelConfig(e,t)}catch(e){let t=e;O.error(`Failed to set default model and reasoning effort`,{safe:{},sensitive:{error:t}});return}await E()},';
const NEW_THREAD_MODEL_SETTER_REPLACEMENT_CURRENT =
  '?(D=async(e,t)=>{codexLinuxIsFreshComposer&&codexLinuxSetPendingModelSettings({model:e,reasoningEffort:t,cwd:s});if(await v(e,t),g){C(e);return}try{await i.setDefaultModelConfig(e,t)}catch(e){let t=e;codexLinuxIsFreshComposer&&codexLinuxSetPendingModelSettings(null);O.error(`Failed to set default model and reasoning effort`,{safe:{},sensitive:{error:t}});return}await E()},';
const NEW_THREAD_MODEL_SETTER_SNIPPET_26_406 =
  'return{setModelAndReasoningEffort:(0,Z.useCallback)(async(e,n)=>{try{if(await h(e,n),m){_(e);return}if(k.info(`Setting default model and reasoning effort`,{safe:{newModel:e,newEffort:n,profile:c.profile}}),r==null)return;await Qc(`set-default-model-config-for-host`,{hostId:i,model:e,reasoningEffort:n,profile:c.profile}),await v()}catch(e){k.error(`Failed to update model and reasoning effort`,{safe:{},sensitive:{error:e}});let n=t.get(xl),r=Eee(o,e);um(e)?n.danger(r,{id:`composer.modelSettings.updateError`,description:(0,Z.createElement)(`div`,{className:`mt-4`},(0,Z.createElement)(Ro))}):n.danger(r,{id:`composer.modelSettings.updateError`})}},[o,m,_,h,c.profile,v,r,t]),modelSettings:g}';
const NEW_THREAD_MODEL_SETTER_REPLACEMENT_26_406 =
  'return{setModelAndReasoningEffort:(0,Z.useCallback)(async(e,n)=>{try{codexLinuxIsFreshComposer&&codexLinuxSetPendingModelSettings({model:e,reasoningEffort:n,cwd:s});if(await h(e,n),m){_(e);return}if(k.info(`Setting default model and reasoning effort`,{safe:{newModel:e,newEffort:n,profile:c.profile}}),r==null)return;await Qc(`set-default-model-config-for-host`,{hostId:i,model:e,reasoningEffort:n,profile:c.profile}),await v()}catch(e){codexLinuxIsFreshComposer&&codexLinuxSetPendingModelSettings(null);k.error(`Failed to update model and reasoning effort`,{safe:{},sensitive:{error:e}});let n=t.get(xl),r=Eee(o,e);um(e)?n.danger(r,{id:`composer.modelSettings.updateError`,description:(0,Z.createElement)(`div`,{className:`mt-4`},(0,Z.createElement)(Ro))}):n.danger(r,{id:`composer.modelSettings.updateError`})}},[o,m,_,h,c.profile,v,r,t]),modelSettings:g}';
const NEW_THREAD_MODEL_STATE_SNIPPET_26_415 = 'let y=v,b=s?.authMethod===`copilot`,x;';
const NEW_THREAD_MODEL_STATE_PATTERN_26_415 =
  /let y=(?<modelVar>[A-Za-z_$][\w$]*),b=s\?\.authMethod===`copilot`,(?<stateVar>[A-Za-z_$][\w$]*);/;
const NEW_THREAD_MODEL_STATE_REPLACEMENT_26_415 =
  'let y=v,b=s?.authMethod===`copilot`,codexLinuxIsFreshComposer=n==null||!p,[codexLinuxPendingModelSettings,codexLinuxSetPendingModelSettings]=(0,K.useState)(null),x;';
const NEW_THREAD_MODEL_SETTINGS_SNIPPET_26_415 =
  '?(C=p?{model:y??d.model,reasoningEffort:m?.settings.reasoning_effort??null,profile:d.profile,isLoading:!1}:b?f:d,';
const NEW_THREAD_MODEL_SETTINGS_REPLACEMENT_26_415 =
  '?(C=p?{model:y??d.model,reasoningEffort:m?.settings.reasoning_effort??null,profile:d.profile,isLoading:!1}:codexLinuxIsFreshComposer&&codexLinuxPendingModelSettings!=null?{model:codexLinuxPendingModelSettings.model,reasoningEffort:codexLinuxPendingModelSettings.reasoningEffort,profile:d.profile,isLoading:!1}:b?f:d,';
const NEW_THREAD_MODEL_SETTER_SNIPPET_26_415 =
  '?(D=async(e,t)=>{try{if(await S(e,t),b){zn(r,`copilot-default-model`,e);return}if(h.info(`Setting default model and reasoning effort`,{safe:{newModel:e,newEffort:t,profile:d.profile}}),!o)return;await on(`set-default-model-config-for-host`,{hostId:a,model:e,reasoningEffort:t,profile:d.profile}),await E()}catch(e){let t=e;h.error(`Failed to update model and reasoning effort`,{safe:{},sensitive:{error:t}});let n=r.get(bo),i=$Ce(c,t);Q9(t)?n.danger(i,{id:`composer.modelSettings.updateError`,description:(0,K.createElement)(`div`,{className:`mt-4`},(0,K.createElement)(RCe))}):n.danger(i,{id:`composer.modelSettings.updateError`})}},';
const NEW_THREAD_MODEL_SETTER_REPLACEMENT_26_415 =
  '?(D=async(e,t)=>{try{codexLinuxIsFreshComposer&&codexLinuxSetPendingModelSettings({model:e,reasoningEffort:t,cwd:l});if(await S(e,t),b){zn(r,`copilot-default-model`,e);return}if(h.info(`Setting default model and reasoning effort`,{safe:{newModel:e,newEffort:t,profile:d.profile}}),!o)return;await on(`set-default-model-config-for-host`,{hostId:a,model:e,reasoningEffort:t,profile:d.profile}),await E()}catch(e){codexLinuxIsFreshComposer&&codexLinuxSetPendingModelSettings(null);let t=e;h.error(`Failed to update model and reasoning effort`,{safe:{},sensitive:{error:t}});let n=r.get(bo),i=$Ce(c,t);Q9(t)?n.danger(i,{id:`composer.modelSettings.updateError`,description:(0,K.createElement)(`div`,{className:`mt-4`},(0,K.createElement)(RCe))}):n.danger(i,{id:`composer.modelSettings.updateError`})}},';
const NEW_THREAD_MODEL_SETTER_PATTERN_26_415 =
  /\?\(D=async\(e,t\)=>\{try\{(?<tryBody>[\s\S]*?`copilot-default-model`[\s\S]*?`set-default-model-config-for-host`[\s\S]*?)\}catch\(e\)\{(?<catchBody>[\s\S]*?`composer\.modelSettings\.updateError`[\s\S]*?)\}\},/;
const NEW_THREAD_MODEL_SELECTOR_MARKER_26_415 = 'set-model-and-reasoning-for-next-turn';
const NEW_THREAD_MODEL_SELECTOR_FUNCTION_MARKER_26_415 = 'function ';
const NEW_THREAD_MODEL_FRESH_EFFECT_ANCHOR_26_415 = 'let w=C,T;';
const NEW_THREAD_MODEL_FRESH_EFFECT_INSERTION_26_415 =
  'let codexLinuxFreshComposerBaseSettings=b?f:d;(0,K.useEffect)(()=>{if(!codexLinuxIsFreshComposer){codexLinuxPendingModelSettings!=null&&codexLinuxSetPendingModelSettings(null);return}if(codexLinuxPendingModelSettings==null)return;if(codexLinuxPendingModelSettings.cwd!==l){codexLinuxSetPendingModelSettings(null);return}!codexLinuxFreshComposerBaseSettings.isLoading&&codexLinuxFreshComposerBaseSettings.model===codexLinuxPendingModelSettings.model&&codexLinuxFreshComposerBaseSettings.reasoningEffort===codexLinuxPendingModelSettings.reasoningEffort&&codexLinuxSetPendingModelSettings(null)},[codexLinuxIsFreshComposer,codexLinuxPendingModelSettings,l,codexLinuxFreshComposerBaseSettings.model,codexLinuxFreshComposerBaseSettings.reasoningEffort,codexLinuxFreshComposerBaseSettings.isLoading]);';
const NEW_THREAD_MODEL_STATE_SNIPPET_26_422 =
  'u=C(At,e),d=C(Ze,e),f=d?.settings.model??null,p=f!=null&&f.trim().length>0?f:null,m=a?.authMethod===`copilot`,g=';
const NEW_THREAD_MODEL_STATE_REPLACEMENT_26_422 =
  'u=C(At,e),d=C(Ze,e),f=d?.settings.model??null,p=f!=null&&f.trim().length>0?f:null,m=a?.authMethod===`copilot`,codexLinuxIsFreshComposer=e==null,[codexLinuxPendingModelSettings,codexLinuxSetPendingModelSettings]=(0,q.useState)(null),g=';
const NEW_THREAD_MODEL_SETTINGS_SNIPPET_26_422 =
  ',_=u?{model:p??c.model,reasoningEffort:d?.settings.reasoning_effort??null,profile:c.profile,isLoading:c.isLoading&&p==null}:m?l:c,';
const NEW_THREAD_MODEL_SETTINGS_REPLACEMENT_26_422 =
  ',_=codexLinuxPendingModelSettings??(u?{model:p??c.model,reasoningEffort:d?.settings.reasoning_effort??null,profile:c.profile,isLoading:c.isLoading&&p==null}:m?l:c),';
const NEW_THREAD_MODEL_SETTER_SNIPPET_26_422 =
  'setModelAndReasoningEffort:(0,q.useCallback)(async(e,n)=>{try{if(await g(e,n))return;if(m){qn(t,`copilot-default-model`,e);return}';
const NEW_THREAD_MODEL_SETTER_REPLACEMENT_26_422 =
  'setModelAndReasoningEffort:(0,q.useCallback)(async(e,n)=>{try{if(codexLinuxIsFreshComposer){codexLinuxSetPendingModelSettings({model:e,reasoningEffort:n,profile:c.profile,isLoading:!1});return}if(await g(e,n))return;if(m){qn(t,`copilot-default-model`,e);return}';
const NEW_THREAD_MODEL_STATE_SNIPPET_26_422_71525 =
  'u=w(jt,e),d=w(Qe,e),f=d?.settings.model??null,p=f!=null&&f.trim().length>0?f:null,m=a?.authMethod===`copilot`,g=';
const NEW_THREAD_MODEL_STATE_REPLACEMENT_26_422_71525 =
  'u=w(jt,e),d=w(Qe,e),f=d?.settings.model??null,p=f!=null&&f.trim().length>0?f:null,m=a?.authMethod===`copilot`,codexLinuxIsFreshComposer=e==null,[codexLinuxPendingModelSettings,codexLinuxSetPendingModelSettings]=(0,q.useState)(null),g=';
const NEW_THREAD_MODEL_SETTINGS_SNIPPET_26_422_71525 =
  ',_=u?{model:p??c.model,reasoningEffort:d?.settings.reasoning_effort??null,profile:c.profile,isLoading:c.isLoading&&p==null}:m?l:c,';
const NEW_THREAD_MODEL_SETTINGS_REPLACEMENT_26_422_71525 =
  ',_=codexLinuxPendingModelSettings??(u?{model:p??c.model,reasoningEffort:d?.settings.reasoning_effort??null,profile:c.profile,isLoading:c.isLoading&&p==null}:m?l:c),';
const NEW_THREAD_MODEL_SETTER_SNIPPET_26_422_71525 =
  'setModelAndReasoningEffort:(0,q.useCallback)(async(e,n)=>{try{if(await g(e,n))return;if(m){Jn(t,`copilot-default-model`,e);return}';
const NEW_THREAD_MODEL_SETTER_REPLACEMENT_26_422_71525 =
  'setModelAndReasoningEffort:(0,q.useCallback)(async(e,n)=>{try{if(codexLinuxIsFreshComposer){codexLinuxSetPendingModelSettings({model:e,reasoningEffort:n,profile:c.profile,isLoading:!1});return}if(await g(e,n))return;if(m){Jn(t,`copilot-default-model`,e);return}';
const NEW_THREAD_MODEL_STATE_SNIPPET_26_519 =
  'b=f(a,e),x=f(s,e),S=x?.settings.model??null,C=S!=null&&S.trim().length>0?S:null,w=u?.authMethod===`copilot`,T=';
const NEW_THREAD_MODEL_STATE_REPLACEMENT_26_519 =
  'b=f(a,e),x=f(s,e),S=x?.settings.model??null,C=S!=null&&S.trim().length>0?S:null,w=u?.authMethod===`copilot`,codexLinuxIsFreshComposer=e==null,[codexLinuxPendingModelSettings,codexLinuxSetPendingModelSettings]=(0,U.useState)(null),T=';
const NEW_THREAD_MODEL_SETTINGS_SNIPPET_26_519 =
  ',E=b?{model:C??g.model,reasoningEffort:x?.settings.reasoning_effort??null,profile:g.profile,isLoading:g.isLoading&&C==null}:w?y:g,';
const NEW_THREAD_MODEL_SETTINGS_REPLACEMENT_26_519 =
  ',E=codexLinuxPendingModelSettings??(b?{model:C??g.model,reasoningEffort:x?.settings.reasoning_effort??null,profile:g.profile,isLoading:g.isLoading&&C==null}:w?y:g),';
const NEW_THREAD_MODEL_SETTER_SNIPPET_26_519 =
  'setModelAndReasoningEffort:(0,U.useCallback)(async(e,r)=>{let a=null,s;try{if(await T(e,r))return;if(w){o(t,`copilot-default-model`,e);return}';
const NEW_THREAD_MODEL_SETTER_REPLACEMENT_26_519 =
  'setModelAndReasoningEffort:(0,U.useCallback)(async(e,r)=>{let a=null,s;try{if(codexLinuxIsFreshComposer){codexLinuxSetPendingModelSettings({model:e,reasoningEffort:r,profile:g.profile,isLoading:!1});return}if(await T(e,r))return;if(w){o(t,`copilot-default-model`,e);return}';
const LINUX_NEW_THREAD_MODEL_SUBMIT_PATCH_MARKER = 'codexLinuxFreshThreadCollaborationModeSettings';
const NEW_THREAD_MODEL_SUBMIT_SNIPPET_CURRENT =
  'return{input:a,workspaceRoots:r,cwd:i,fileAttachments:t.fileAttachments,addedFiles:t.addedFiles,agentMode:j,model:null,serviceTier:A.serviceTier,reasoningEffort:null,collaborationMode:w,config:o}';
const NEW_THREAD_MODEL_SUBMIT_REPLACEMENT_CURRENT =
  'let codexLinuxFreshThreadCollaborationModeSettings=w==null?null:{...w,settings:{...w.settings,model:w.settings?.model??o.model??null,reasoning_effort:w.settings?.reasoning_effort??o.model_reasoning_effort??null}};return{input:a,workspaceRoots:r,cwd:i,fileAttachments:t.fileAttachments,addedFiles:t.addedFiles,agentMode:j,model:null,serviceTier:A.serviceTier,reasoningEffort:null,collaborationMode:codexLinuxFreshThreadCollaborationModeSettings,config:o}';
const NEW_THREAD_MODEL_SUBMIT_SNIPPET_26_406 =
  'return{input:o,workspaceRoots:r,cwd:i,fileAttachments:t.fileAttachments,addedFiles:t.addedFiles,agentMode:M,model:null,serviceTier:j.serviceTier,reasoningEffort:null,collaborationMode:T,config:s}';
const NEW_THREAD_MODEL_SUBMIT_REPLACEMENT_26_406 =
  'let codexLinuxFreshThreadCollaborationModeSettings=T==null?null:{...T,settings:{...T.settings,model:T.settings?.model??s.model??null,reasoning_effort:T.settings?.reasoning_effort??s.model_reasoning_effort??null}};return{input:o,workspaceRoots:r,cwd:i,fileAttachments:t.fileAttachments,addedFiles:t.addedFiles,agentMode:M,model:null,serviceTier:j.serviceTier,reasoningEffort:null,collaborationMode:codexLinuxFreshThreadCollaborationModeSettings,config:s}';
const NEW_THREAD_MODEL_SUBMIT_SNIPPET_26_415 =
  'return{input:d,commentAttachments:e.commentAttachments,workspaceRoots:n,cwd:r,fileAttachments:e.fileAttachments,addedFiles:e.addedFiles,agentMode:a,model:null,serviceTier:o,reasoningEffort:null,collaborationMode:s,config:Ir(f),memoryPreferences:c,workspaceKind:l,...l===`projectless`?{projectlessOutputDirectory:u}:{}}';
const NEW_THREAD_MODEL_SUBMIT_REPLACEMENT_26_415 =
  'let p=Ir(f),codexLinuxFreshThreadCollaborationModeSettings=s==null?null:{...s,settings:{...s.settings,model:s.settings?.model??p.model??null,reasoning_effort:s.settings?.reasoning_effort??p.model_reasoning_effort??null}};return{input:d,commentAttachments:e.commentAttachments,workspaceRoots:n,cwd:r,fileAttachments:e.fileAttachments,addedFiles:e.addedFiles,agentMode:a,model:null,serviceTier:o,reasoningEffort:null,collaborationMode:codexLinuxFreshThreadCollaborationModeSettings,config:p,memoryPreferences:c,workspaceKind:l,...l===`projectless`?{projectlessOutputDirectory:u}:{}}';
const NEW_THREAD_MODEL_SUBMIT_SNIPPET_26_417 =
  'return{input:e,workspaceRoots:[r],cwd:r,fileAttachments:[],addedFiles:[],agentMode:zt(`agent-mode-by-host-id`,{})[F]??`auto`,model:null,reasoningEffort:null,collaborationMode:Pve(t,n,i),config:gt(a),workspaceKind:`project`}}';
const NEW_THREAD_MODEL_SUBMIT_REPLACEMENT_26_417 =
  'let o=Pve(t,n,i),s=gt(a),codexLinuxFreshThreadCollaborationModeSettings=o==null?null:{...o,settings:{...o.settings,model:o.settings?.model??s.model??null,reasoning_effort:o.settings?.reasoning_effort??s.model_reasoning_effort??null}};return{input:e,workspaceRoots:[r],cwd:r,fileAttachments:[],addedFiles:[],agentMode:zt(`agent-mode-by-host-id`,{})[F]??`auto`,model:null,reasoningEffort:null,collaborationMode:codexLinuxFreshThreadCollaborationModeSettings,config:s,workspaceKind:`project`}}';
const NEW_THREAD_MODEL_SUBMIT_SNIPPET_26_422 =
  'return{input:e,workspaceRoots:[r],cwd:r,fileAttachments:[],addedFiles:[],agentMode:Yt(`agent-mode-by-host-id`,{})[P]??`auto`,model:null,reasoningEffort:null,collaborationMode:xve(t,n,i),config:zt(a),workspaceKind:`project`}}';
const NEW_THREAD_MODEL_SUBMIT_REPLACEMENT_26_422 =
  'let o=xve(t,n,i),s=zt(a),codexLinuxFreshThreadCollaborationModeSettings=o==null?null:{...o,settings:{...o.settings,model:o.settings?.model??s.model??null,reasoning_effort:o.settings?.reasoning_effort??s.model_reasoning_effort??null}};return{input:e,workspaceRoots:[r],cwd:r,fileAttachments:[],addedFiles:[],agentMode:Yt(`agent-mode-by-host-id`,{})[P]??`auto`,model:null,reasoningEffort:null,collaborationMode:codexLinuxFreshThreadCollaborationModeSettings,config:s,workspaceKind:`project`}}';
const NEW_THREAD_MODEL_SUBMIT_SNIPPET_26_422_71525 =
  'return{input:e,workspaceRoots:[r],cwd:r,fileAttachments:[],addedFiles:[],agentMode:Xt(`agent-mode-by-host-id`,{})[I]??`auto`,model:null,reasoningEffort:null,collaborationMode:xve(t,n,i),config:Bt(a),workspaceKind:`project`}}';
const NEW_THREAD_MODEL_SUBMIT_REPLACEMENT_26_422_71525 =
  'let o=xve(t,n,i),s=Bt(a),codexLinuxFreshThreadCollaborationModeSettings=o==null?null:{...o,settings:{...o.settings,model:o.settings?.model??s.model??null,reasoning_effort:o.settings?.reasoning_effort??s.model_reasoning_effort??null}};return{input:e,workspaceRoots:[r],cwd:r,fileAttachments:[],addedFiles:[],agentMode:Xt(`agent-mode-by-host-id`,{})[I]??`auto`,model:null,reasoningEffort:null,collaborationMode:codexLinuxFreshThreadCollaborationModeSettings,config:s,workspaceKind:`project`}}';
const NEW_THREAD_MODEL_SUBMIT_SNIPPET_26_519 =
  'return{input:c,commentAttachments:l,workspaceRoots:t,collaborationMode:u,...d===void 0?{}:{serviceTier:d},permissions:x,approvalsReviewer:x.approvalsReviewer,cwd:f,attachments:b,workspaceKind:_,...g===void 0?{}:{threadSource:g},...s===void 0?{}:{threadDetailLevel:s},...o===void 0?{}:{config:o},..._===`projectless`?{projectlessOutputDirectory:v}:{},...h===void 0?{}:{memoryPreferences:h},...y===void 0?{}:{additionalDeveloperInstructions:y}}';
const NEW_THREAD_MODEL_SUBMIT_REPLACEMENT_26_519 =
  'let S=u==null?null:{...u,settings:{...u.settings,model:u.settings?.model??r.model??null,reasoning_effort:u.settings?.reasoning_effort??r.model_reasoning_effort??null}},codexLinuxFreshThreadCollaborationModeSettings=S;return{input:c,commentAttachments:l,workspaceRoots:t,collaborationMode:codexLinuxFreshThreadCollaborationModeSettings,...d===void 0?{}:{serviceTier:d},permissions:x,approvalsReviewer:x.approvalsReviewer,cwd:f,attachments:b,workspaceKind:_,...g===void 0?{}:{threadSource:g},...s===void 0?{}:{threadDetailLevel:s},...o===void 0?{}:{config:o},..._===`projectless`?{projectlessOutputDirectory:v}:{},...h===void 0?{}:{memoryPreferences:h},...y===void 0?{}:{additionalDeveloperInstructions:y}}';
const LINUX_TODO_PROGRESS_PATCH_MARKER = 'codexLinuxTodoProgress';
const LINUX_VISUAL_COMPAT_PATCH_MARKER = 'codexLinuxVisualCompat';
const LINUX_BROWSER_VIEWPORT_SURFACE_PATCH_MARKER = 'codexLinuxBrowserViewportSurface';
const LINUX_BROWSER_WEBVIEW_STACKING_PATCH_MARKER = 'codexLinuxBrowserWebviewStacking';
const LINUX_BROWSER_WEBVIEW_CAPTURE_SURFACE_PATCH_MARKER = 'codexLinuxBrowserWebviewCaptureSurface';
const LINUX_BROWSER_WEBVIEW_VISIBLE_CAPTURE_PATCH_MARKER =
  'codexLinuxBrowserWebviewVisibleCaptureSurface';
const LINUX_BROWSER_WEBVIEW_PANEL_HOST_PATCH_MARKER = 'codexLinuxBrowserWebviewPanelHost';
const LINUX_BROWSER_WEBVIEW_VISIBLE_WHEN_URL_PATCH_MARKER =
  'codexLinuxBrowserWebviewVisibleWhenUrl';
const LINUX_BROWSER_WEBVIEW_HOST_ATTACH_PATCH_MARKER = 'codexLinuxBrowserWebviewHostAttach';
const LINUX_BROWSER_WEBVIEW_HOST_POSITION_PATCH_MARKER =
  'codexLinuxBrowserWebviewHostPosition';
const LINUX_BROWSER_WEBVIEW_HOST_CONTAINER_PATCH_MARKER =
  'codexLinuxBrowserWebviewHostContainer';
const LINUX_BROWSER_WEBVIEW_DETACH_DELAY_PATCH_MARKER = 'codexLinuxBrowserWebviewDetachDelay';
const LINUX_RIGHT_PANEL_PANE_TABS_PATCH_MARKER = 'codexLinuxRightPanelPaneTabs';
const LINUX_RIGHT_PANEL_OUTLET_FIRST_PATCH_MARKER = 'codexLinuxRightPanelOutletFirst';
const LINUX_RIGHT_PANEL_TABS_FALLBACK_PATCH_MARKER = 'codexLinuxRightPanelTabsFallback';
const LINUX_RIGHT_PANEL_TABS_FIRST_PATCH_MARKER = 'codexLinuxRightPanelTabsFirst';
const LINUX_RIGHT_PANEL_TABS_VISIBLE_PATCH_MARKER = 'codexLinuxRightPanelTabsVisible';
const LINUX_RIGHT_PANEL_TAB_METRICS_PATCH_MARKER = 'codexLinuxRightPanelTabMetrics';
const LINUX_RIGHT_PANEL_HEADER_PASSTHROUGH_PATCH_MARKER =
  'codexLinuxRightPanelHeaderPassthrough';
const LINUX_RIGHT_PANEL_HEADER_OFFSET_PATCH_MARKER = 'codexLinuxRightPanelHeaderOffset';
const LINUX_BROWSER_COMMENT_POSITION_PATCH_MARKER = 'codexLinuxBrowserCommentPosition';
const LINUX_BROWSER_COMMENT_SUBMIT_MODE_PATCH_MARKER = 'codexLinuxBrowserCommentSubmitMode';
const LINUX_BROWSER_COMMENT_SUBMIT_CLEANUP_PATCH_MARKER =
  'codexLinuxBrowserCommentSubmitCleanup';
const LINUX_BROWSER_ADJUST_EDITOR_SURFACE_PATCH_MARKER =
  'codexLinuxBrowserAdjustEditorSurface';
const LINUX_BROWSER_COMMENT_COMPOSER_LAYOUT_PATCH_MARKER =
  'codexLinuxBrowserCommentComposerLayout';
const LINUX_BACKGROUND_SUBAGENTS_PANEL_PATCH_MARKER = 'codexLinuxBackgroundSubagentsPanel';
const LINUX_LATEST_AGENT_TURN_EXPANSION_PATCH_MARKER = 'codexLinuxLatestAgentTurnExpanded';
const LINUX_VISUAL_COMPAT_JS_TARGET_PATTERN =
  /if\((?<elementVar>[A-Za-z_$][\w$]*)\)\{if\((?:\((?<windowStateVar>[A-Za-z_$][\w$]*)\.opaqueWindows(?<extraOpaqueCondition>(?:\|\|[A-Za-z_$][\w$]*)*)\)|(?<legacyWindowStateVar>[A-Za-z_$][\w$]*)\.opaqueWindows)&&!(?<opaqueGuardFn>[A-Za-z_$][\w$]*)\(\)\)\{\k<elementVar>\.classList\.add\(`electron-opaque`\);return\}\k<elementVar>\.classList\.remove\(`electron-opaque`\)\}/;
const LINUX_VISUAL_COMPAT_JS_TARGET_SIMPLE_PATTERN =
  /if\((?<elementVar>[A-Za-z_$][\w$]*)\)\{if\((?<opaqueCondition>[A-Za-z_$][\w$]*(?:\|\|[A-Za-z_$][\w$]*)*)&&!(?<opaqueGuardFn>[A-Za-z_$][\w$]*)\(\)\)\{\k<elementVar>\.classList\.add\(`electron-opaque`\);return\}\k<elementVar>\.classList\.remove\(`electron-opaque`\)\}/;
const LINUX_VISUAL_COMPAT_CSS_CANDIDATE_MARKER_SETS = [
  ['[data-codex-window-type=electron]', '.window-fx-sidebar-surface', '.sidebar-resize-handle-line'],
  ['[data-codex-window-type=electron]', '.app-header-tint', 'electron-opaque'],
  ['[data-codex-window-type=electron]', '.app-shell-left-panel', 'electron-opaque']
];
const LINUX_VISUAL_COMPAT_JS_CANDIDATE_MARKERS = [
  '[data-codex-window-type="electron"]',
  'electron-opaque',
  'dataset.codexOs'
];
const LINUX_BROWSER_VIEWPORT_SURFACE_CANDIDATE_MARKERS = [
  'browser-sidebar-sync',
  'webviewRef:',
  'backgroundColor:'
];
const LINUX_BROWSER_WEBVIEW_STACKING_CANDIDATE_MARKERS = [
  'data-browser-sidebar-conversation-id',
  'document.createElement(`webview`)',
  'IAB_LIFECYCLE renderer created hidden browser sidebar webview'
];
const LINUX_RIGHT_PANEL_PANE_TABS_CANDIDATE_MARKERS = [
  'right-panel-tab-bar-header-spacer',
  'RightPanelTabs',
  'codex.rightPanel.expandFullWidth'
];
const LINUX_BROWSER_COMMENT_POSITION_CANDIDATE_MARKERS = [
  'browser-sidebar-comment-overlay-session',
  'overlayWindowBounds',
  'editorFrame.x'
];
const LINUX_BROWSER_COMMENT_SUBMIT_MODE_CANDIDATE_MARKERS = [
  'browser-sidebar-comment-overlay-submit',
  'defaultCreateSubmitMode'
];
const LINUX_BROWSER_COMMENT_SUBMIT_CLEANUP_CANDIDATE_MARKERS = [
  'browser-sidebar-comment-overlay-submit',
  'commentAttachments:',
  'browserConversationId:',
  'onCommentsChange:'
];
const LINUX_BACKGROUND_SUBAGENTS_PANEL_CANDIDATE_MARKERS = [
  'composer.backgroundSubagents.summary',
  'isBackgroundSubagentsPanelVisible:'
];
const LINUX_LATEST_AGENT_TURN_EXPANSION_CANDIDATE_MARKERS = [
  'collapsedMessageCount:',
  'shouldAutoExpandMcpApps:',
  'persistedCollapsed:'
];
const LINUX_BROWSER_COMMENT_POSITION_OVERLAY_STATE_PATTERN =
  /let\{message:(?<messageVar>[A-Za-z_$][\w$]*),root:(?<rootVar>[A-Za-z_$][\w$]*),popupWindow:(?<popupVar>[A-Za-z_$][\w$]*)\}=[A-Za-z_$][\w$]*,/;
const LINUX_BROWSER_COMMENT_POSITION_POPUP_OPEN_PATTERN =
  /let\{x:(?<xVar>[A-Za-z_$][\w$]*),y:(?<yVar>[A-Za-z_$][\w$]*),width:(?<widthVar>[A-Za-z_$][\w$]*),height:(?<heightVar>[A-Za-z_$][\w$]*)\}=(?<boundsVar>[A-Za-z_$][\w$]*)\.overlayWindowBounds,(?<popupVar>[A-Za-z_$][\w$]*)=(?<openerVar>[A-Za-z_$][\w$]*)\.open\(`about:blank`,(?<frameNameVar>[A-Za-z_$][\w$]*),\[`popup=yes`,`left=\$\{Math\.round\(\k<xVar>\)\}`,`top=\$\{Math\.round\(\k<yVar>\)\}`,`width=\$\{Math\.round\(\k<widthVar>\)\}`,`height=\$\{Math\.round\(\k<heightVar>\)\}`\]\.join\(`,`\)\);return \k<popupVar>==null\?null:\{frameName:\k<frameNameVar>,window:\k<popupVar>\}/;
const LINUX_BROWSER_COMMENT_SUBMIT_MODE_PATTERN =
  /(?<prop>defaultCreateSubmitMode):`direct`/;
const LINUX_BROWSER_COMMENT_SUBMIT_MODE_FALLBACK_PATTERN =
  /(?<modeVar>[A-Za-z_$][\w$]*)=(?<propVar>[A-Za-z_$][\w$]*)===void 0\?`direct`:\k<propVar>/;
const LINUX_BROWSER_COMMENT_SUBMIT_MODE_CALLER_PATTERN =
  /(?<prop>defaultCreateSubmitMode):(?<condition>[A-Za-z_$][\w$]*)\?`saved`:`direct`/;
const LINUX_BROWSER_COMMENT_SUBMIT_CLEANUP_CONTEXT_PATTERN =
  /let (?<contextVar>[A-Za-z_$][\w$]*)=await (?<buildContextFn>[A-Za-z_$][\w$]*)\((?<promptVar>[A-Za-z_$][\w$]*),void 0,(?<conversationVar>[A-Za-z_$][\w$]*),(?<objectiveVar>[A-Za-z_$][\w$]*)\?\?void 0\);(?<analyticsFn>[A-Za-z_$][\w$]*)\((?<submitActionVar>[A-Za-z_$][\w$]*),(?<serviceTierVar>[A-Za-z_$][\w$]*)\),(?<pendingFn>[A-Za-z_$][\w$]*)\(!0\);let (?<submitFn>[A-Za-z_$][\w$]*)=async\(\)=>/;
const LINUX_BROWSER_COMMENT_SUBMIT_CLEANUP_STATE_PATTERN =
  /(?<clearFn>[A-Za-z_$][\w$]*)\(\{browserConversationId:(?<browserConversationVar>[A-Za-z_$][\w$]*),browserTabId:(?<browserTabVar>[A-Za-z_$][\w$]*),fallbackBrowserConversationId:(?<fallbackConversationVar>[A-Za-z_$][\w$]*),comments:(?<commentsVar>[A-Za-z_$][\w$]*),onCommentsChange:(?<onCommentsChangeVar>[A-Za-z_$][\w$]*)\}\)\|\|\k<onCommentsChangeVar>\(\[\]\)/;
const LINUX_BROWSER_COMMENT_SUBMIT_CLEANUP_REMOVE_BROWSER_COMMENTS_PATTERN =
  /(?<removeBrowserCommentsFn>[A-Za-z_$][\w$]*)=\(\)=>\{(?<onCommentsChangeVar>[A-Za-z_$][\w$]*)\((?<browserCommentFilterFn>[A-Za-z_$][\w$]*)\((?<commentsVar>[A-Za-z_$][\w$]*)\)\)\},(?<removeDiffCommentsFn>[A-Za-z_$][\w$]*)=\(\)=>\{\k<onCommentsChangeVar>\([A-Za-z_$][\w$]*\(\k<commentsVar>\)\)\}/;
const LINUX_BROWSER_COMMENT_SUBMIT_CLEANUP_CONTEXT_26_616_PATTERN =
  /(?<prefix>await [A-Za-z_$][\w$]*\(\{appendPromptToHistory:[A-Za-z_$][\w$]*,buildLocalContextForPrompt:)(?<buildContextFn>[A-Za-z_$][\w$]*)(?<suffix>,clearComposerUi:)/;
const LINUX_BROWSER_VIEWPORT_SURFACE_PATTERN =
  /ref:(?<refVar>[A-Za-z_$][\w$]*),className:`relative h-full min-h-0 min-w-0 overflow-hidden`,style:\{backgroundColor:(?<backgroundVar>[A-Za-z_$][\w$]*)\},children:\[/;
const LINUX_BROWSER_WEBVIEW_PANEL_HOST_SIGNATURE_PATTERN =
  /function (?<componentName>[A-Za-z_$][\w$]*)\(\{bounds:(?<boundsVar>[A-Za-z_$][\w$]*),conversationId:(?<conversationVar>[A-Za-z_$][\w$]*),initialUrl:(?<urlVar>[A-Za-z_$][\w$]*),isVisible:(?<visibleVar>[A-Za-z_$][\w$]*),scale:(?<scaleVar>[A-Za-z_$][\w$]*),transferSourceConversationId:(?<transferVar>[A-Za-z_$][\w$]*),webviewRef:(?<webviewRefVar>[A-Za-z_$][\w$]*),windowZoom:(?<zoomVar>[A-Za-z_$][\w$]*)\}\)/;
const LINUX_BROWSER_WEBVIEW_PANEL_HOST_SYNC_PATTERN =
  /(?<managerRef>[A-Za-z_$][\w$]*)\.current\?\.sync\(\{bounds:(?<boundsVar>[A-Za-z_$][\w$]*),isVisible:(?<visibleVar>[A-Za-z_$][\w$]*),scale:(?<scaleVar>[A-Za-z_$][\w$]*),windowZoom:(?<zoomVar>[A-Za-z_$][\w$]*)\},(?<webviewRefVar>[A-Za-z_$][\w$]*)\)/;
const LINUX_BROWSER_WEBVIEW_PANEL_HOST_CALL_PATTERN =
  /(?<prefix>\(0,[A-Za-z_$][\w$]*\.jsx\)\([A-Za-z_$][\w$]*,\{bounds:[^)]*?webviewRef:(?<webviewRefVar>[A-Za-z_$][\w$]*),)windowZoom:(?<zoomVar>[A-Za-z_$][\w$]*)(?<suffix>\}\))/;
const LINUX_BROWSER_WEBVIEW_VISIBLE_WHEN_URL_PATTERN =
  /(?<prefix>initialUrl:(?<urlVar>[A-Za-z_$][\w$]*)\?[^,]+,isVisible:)(?<visibleVar>[A-Za-z_$][\w$]*)(?<suffix>,scale:)/;
const LINUX_BROWSER_WEBVIEW_VISIBLE_WHEN_URL_26_527_PATTERN =
  /(?<prefix>initialUrl:(?<urlState>[A-Za-z_$][\w$]*\.url)\.length===0\?`about:blank`:\k<urlState>,isVisible:)(?<visibleExpr>[A-Za-z_$][\w$]*&&[A-Za-z_$][\w$]*)(?<suffix>,scale:)/;
const LINUX_BROWSER_WEBVIEW_VISIBLE_WHEN_URL_DIRECT_PATTERN =
  /(?<prefix>initialUrl:(?<urlState>[A-Za-z_$][\w$]*\.url)\.length===0\?`about:blank`:\k<urlState>,isVisible:)(?<visibleVar>[A-Za-z_$][\w$]*)(?<suffix>,scale:)/;
const LINUX_BROWSER_WEBVIEW_VISIBLE_STYLE_PATTERN =
  /(?<prefix>Object\.assign\((?<containerVar>[A-Za-z_$][\w$]*)\.style,\{contain:``,height:`\$\{Math\.round\((?<boundsVar>[A-Za-z_$][\w$]*)\.height\*(?<scaleVar>[A-Za-z_$][\w$]*)\)\}px`,left:`\$\{\k<boundsVar>\.x\*(?<windowZoomVar>[A-Za-z_$][\w$]*)\}px`,opacity:`1`,overflow:`hidden`,pointerEvents:``,position:`fixed`,top:`\$\{\k<boundsVar>\.y\*\k<windowZoomVar>\}px`,transform:``,transformOrigin:``,visibility:`visible`,willChange:``,width:`\$\{Math\.round\(\k<boundsVar>\.width\*\k<scaleVar>\)\}px`,zIndex:)``/;
const LINUX_BROWSER_WEBVIEW_VISIBLE_FUNCTION_PATTERN =
  /function (?<functionName>[A-Za-z_$][\w$]*)\((?<containerVar>[A-Za-z_$][\w$]*),(?<webviewVar>[A-Za-z_$][\w$]*),(?<boundsVar>[A-Za-z_$][\w$]*),(?<scaleVar>[A-Za-z_$][\w$]*),(?<windowZoomVar>[A-Za-z_$][\w$]*)\)\{let (?<combinedScaleVar>[A-Za-z_$][\w$]*)=\k<scaleVar>\*\k<windowZoomVar>;Object\.assign\(\k<containerVar>\.style,\{contain:``,height:`\$\{Math\.round\(\k<boundsVar>\.height\*\k<combinedScaleVar>\)\}px`,left:`\$\{\k<boundsVar>\.x\*\k<windowZoomVar>\}px`,opacity:`1`,overflow:`hidden`,pointerEvents:``,position:`fixed`,top:`\$\{\k<boundsVar>\.y\*\k<windowZoomVar>\}px`,transform:``,transformOrigin:``,visibility:`visible`,willChange:``,width:`\$\{Math\.round\(\k<boundsVar>\.width\*\k<combinedScaleVar>\)\}px`,zIndex:(?:``|`2147483646`\/\* codexLinuxBrowserWebviewStacking \*\/)\}\),Object\.assign\(\k<webviewVar>\.style,\{height:`\$\{\k<boundsVar>\.height\}px`,transform:\k<combinedScaleVar>===1\?``:`scale\(\$\{\k<combinedScaleVar>\}\)`,transformOrigin:`top left`,willChange:\k<combinedScaleVar>===1\?``:`transform`,width:`\$\{\k<boundsVar>\.width\}px`\}\)\}/;
const LINUX_BROWSER_WEBVIEW_SYNC_METHOD_PATTERN =
  /sync\((?<stateArg>[A-Za-z_$][\w$]*),(?<webviewRefArg>[A-Za-z_$][\w$]*)\)\{this\.isAttached=!0,this\.state=\k<stateArg>,this\.webview\.style\.backgroundColor=(?<backgroundVar>[A-Za-z_$][\w$]*),K\(\k<webviewRefArg>,this\.webview\),this\.syncContainerStyle\(\)\}/;
const LINUX_BROWSER_WEBVIEW_SYNC_METHOD_WITH_HOST_PATTERN =
  /sync\((?<stateArg>[A-Za-z_$][\w$]*),(?<webviewRefArg>[A-Za-z_$][\w$]*),codexLinuxBrowserWebviewHostRef\)\{this\.isAttached=!0,this\.state=\k<stateArg>,this\.webview\.style\.backgroundColor=(?<backgroundVar>[A-Za-z_$][\w$]*),K\(\k<webviewRefArg>,this\.webview\),this\.attachToLinuxHost\(codexLinuxBrowserWebviewHostRef\?\.current\),this\.syncContainerStyle\(\)\}/;
const LINUX_BROWSER_WEBVIEW_ATTACH_METHOD_INSERT_PATTERN =
  /detach\((?<refArg>[A-Za-z_$][\w$]*)\)\{/;
const LINUX_BROWSER_WEBVIEW_ATTACH_METHOD_CURRENT_PATTERN =
  /attachToLinuxHost\(e\)\{if\(e instanceof HTMLElement\)\{this\.container\.dataset\.codexLinuxBrowserWebviewHost=`panel`;this\.container\.parentElement!==document\.body&&document\.body\.append\(this\.container\)\}\}\/\* codexLinuxBrowserWebviewHostAttach \*\//;
const LINUX_BROWSER_WEBVIEW_DETACH_METHOD_PATTERN =
  /detach\((?<refArg>[A-Za-z_$][\w$]*)\)\{this\.isAttached=!1,this\.state=\{bounds:this\.state\.bounds,isVisible:!1,scale:this\.state\.scale,windowZoom:this\.state\.windowZoom\},this\.webview\.style\.backgroundColor=(?<backgroundVar>[A-Za-z_$][\w$]*),K\(\k<refArg>,null,this\.webview\),this\.syncContainerStyle\(\),(?<loggerVar>[A-Za-z_$][\w$]*)\.info\(`IAB_LIFECYCLE renderer detached visible browser sidebar webview`,\{safe:\{conversationId:this\.conversationId\}\}\)\}/;
const LINUX_BROWSER_WEBVIEW_DETACH_METHOD_SIMPLE_PATTERN =
  /detach\((?<refArg>[A-Za-z_$][\w$]*)\)\{this\.isAttached=!1,K\(\k<refArg>,null,this\.webview\),this\.syncContainerStyle\(\)\}/;
const LINUX_BROWSER_WEBVIEW_CAPTURE_SURFACE_PATTERN =
  /if\(this\.browserUseCaptureSurfaceSize!=null\)\{H\(this\.container,this\.webview,(?<boundsVar>[A-Za-z_$][\w$]*)\);return\}if\(this\.state\.isVisible\)\{this\.lastVisibleBounds=\k<boundsVar>,B\(this\.container,this\.webview,\k<boundsVar>,this\.state\.scale,this\.state\.windowZoom\?\?1\);return\}/;
const LINUX_BROWSER_WEBVIEW_CAPTURE_SURFACE_CURRENT_PATTERN =
  /if\(this\.browserUseCaptureSurfaceSize!=null\)\{if\(this\.state\.isVisible&&this\.state\.bounds!=null\)\{this\.lastVisibleBounds=this\.state\.bounds,B\(this\.container,this\.webview,this\.state\.bounds,this\.state\.scale,this\.state\.windowZoom\?\?1\);return\}H\(this\.container,this\.webview,(?<boundsVar>[A-Za-z_$][\w$]*)\);return\}\/\* codexLinuxBrowserWebviewCaptureSurface \*\/if\(this\.state\.isVisible\)\{this\.lastVisibleBounds=\k<boundsVar>,B\(this\.container,this\.webview,\k<boundsVar>,this\.state\.scale,this\.state\.windowZoom\?\?1\);return\}/;
const LINUX_RIGHT_PANEL_PANE_TABS_HEADER_PATTERN = /(?<prop>headerHeight):`toolbar`/;
const LINUX_RIGHT_PANEL_PANE_TABS_BEFORE_LIST_PATTERN =
  /beforeList:\(0,(?<jsxVar>[A-Za-z_$][\w$]*)\.jsxs\)\(\k<jsxVar>\.Fragment,\{children:\[(?<isFullWidthVar>[A-Za-z_$][\w$]*)&&!(?<isEdgeVar>[A-Za-z_$][\w$]*)&&\(0,\k<jsxVar>\.jsx\)\((?<motionVar>[A-Za-z_$][\w$]*)\.div,\{"aria-hidden":!0,className:`pointer-events-none h-full shrink-0`,style:\{width:(?<leftWidthVar>[A-Za-z_$][\w$]*)\}\}\),(?<beforeListVar>[A-Za-z_$][\w$]*)\]\}\),/;
const LINUX_RIGHT_PANEL_PANE_TABS_AFTER_LIST_PATTERN =
  /afterList:\(0,(?<jsxVar>[A-Za-z_$][\w$]*)\.jsxs\)\(\k<jsxVar>\.Fragment,\{children:\[(?<afterListVar>[A-Za-z_$][\w$]*),\(0,\k<jsxVar>\.jsx\)\((?<expandButtonVar>[A-Za-z_$][\w$]*),\{\}\),\(0,\k<jsxVar>\.jsx\)\((?<motionVar>[A-Za-z_$][\w$]*)\.div,\{"aria-hidden":!0,"data-testid":`right-panel-tab-bar-header-spacer`,className:`pointer-events-none flex h-full shrink-0 items-center`,style:\{width:(?<spacerWidthVar>[A-Za-z_$][\w$]*)\}\}\)\]\}\),controller:/;
const LINUX_RIGHT_PANEL_CHILDREN_ORDER_PATTERN =
  /(?<prefix>className:`h-full min-h-0 min-w-0 overflow-hidden \[--thread-content-top-inset:calc\(var\(--spacing\)\*8\)\]`,children:\[)(?<firstVar>[A-Za-z_$][\w$]*),(?:\/\* codexLinuxRightPanel(?:TabsFirst|OutletFirst) \*\/)?(?<secondVar>[A-Za-z_$][\w$]*)(?<suffix>\]\})/;
const LINUX_RIGHT_PANEL_CHILDREN_ORDER_26_527_PATTERN =
  /(?<prefix>(?<registeredVar>[A-Za-z_$][\w$]*)=D\([A-Za-z_$][\w$]*\)[\s\S]{0,2500}?className:`h-full min-h-0 min-w-0 overflow-hidden \[contain:layout_paint\] \[--thread-content-top-inset:calc\(var\(--spacing\)\*8\)\]`,children:\[)(?<firstVar>[A-Za-z_$][\w$]*),(?:\/\* codexLinuxRightPanel(?:TabsFirst|OutletFirst) \*\/)?(?<secondVar>[A-Za-z_$][\w$]*)(?<suffix>\]\})/;
const LINUX_RIGHT_PANEL_CHILDREN_ORDER_26_601_PATTERN =
  /(?<prefix>function [A-Za-z_$][\w$]*\(\{children:(?<slotVar>[A-Za-z_$][\w$]*),isRightPanelOpen:[A-Za-z_$][\w$]*,mainContentWidth:[A-Za-z_$][\w$]*,rightPanelWidth:[A-Za-z_$][\w$]*,rightPanelWidthRatio:[A-Za-z_$][\w$]*,widthMode:[A-Za-z_$][\w$]*\}\)\{[\s\S]{0,1800}?(?<registeredVar>[A-Za-z_$][\w$]*)=y\([A-Za-z_$][\w$]*\)[\s\S]{0,4200}?className:`h-full min-h-0 min-w-0 overflow-hidden \[contain:layout_paint\] \[--thread-content-top-inset:calc\(var\(--spacing\)\*8\)\]`,children:\[)(?<firstVar>[A-Za-z_$][\w$]*),(?:\/\* codexLinuxRightPanel(?:TabsFirst|OutletFirst) \*\/)?(?<secondVar>[A-Za-z_$][\w$]*)(?<suffix>\]\})/;
const LINUX_RIGHT_PANEL_OUTLET_FALLBACK_PATTERN =
  /(?<tabsVar>[A-Za-z_$][\w$]*)=C\(G\)/;
const LINUX_RIGHT_PANEL_PANE_TABS_UPSTREAM_PATTERN =
  /function [A-Za-z_$][\w$]*\(\)\{let [\s\S]{0,400}?activeTab\$\)[\s\S]{0,800}?headerHeight:`pane`[\s\S]{0,400}?controller:[A-Za-z_$][\w$]*[\s\S]{0,800}?\?null:[\s\S]{0,120}?Fragment/;
const LINUX_BACKGROUND_SUBAGENTS_PANEL_VISIBILITY_PATTERN =
  /(?<visibleVar>[A-Za-z_$][\w$]*)=(?<rowsVar>[A-Za-z_$][\w$]*)\.length>0&&!(?<firstGuard>[A-Za-z_$][\w$]*)&&!(?<toggleGuard>[A-Za-z_$][\w$]*)&&!(?<thirdGuard>[A-Za-z_$][\w$]*)&&!(?<fourthGuard>[A-Za-z_$][\w$]*)/;
const LINUX_BACKGROUND_SUBAGENTS_PANEL_CURRENT_VISIBILITY_PATTERN =
  /(?<visibleVar>[A-Za-z_$][\w$]*)=(?<rowsVar>[A-Za-z_$][\w$]*)\.length>0&&!(?<guardVar>[A-Za-z_$][\w$]*)(?=[\s\S]{0,50000}isBackgroundSubagentsPanelVisible:\k<visibleVar>)/;
const LINUX_BACKGROUND_SUBAGENTS_PANEL_FALSE_GATE_PATTERN =
  /(?<visibleVar>[A-Za-z_$][\w$]*)=(?<rowsVar>[A-Za-z_$][\w$]*)\.length>0&&!1(?=[\s\S]{0,50000}isBackgroundSubagentsPanelVisible:\k<visibleVar>)/;
const LINUX_LATEST_AGENT_TURN_EXPANSION_PATTERN =
  /persistedCollapsed:(?<persistedCollapsedVar>[A-Za-z_$][\w$]*)\}\),/;
const COMPACT_SLASH_COMMAND_ID_MARKERS = ['id:`compact`', 'id:"compact"', "id:'compact'"];

async function patchMainProcessBundle(extractedAppDir, logger) {
  const buildDir = path.join(extractedAppDir, '.vite', 'build');
  const files = await fs.promises.readdir(buildDir);
  const mainFile = files.find((name) => /^main[-.].+\.js$/.test(name) || name === 'main.js');
  if (!mainFile) {
    throw new Error('Could not locate the Electron main bundle inside the extracted app.');
  }
  const workerFile = files.find((name) => /^worker[-.].+\.js$/.test(name) || name === 'worker.js');
  if (!workerFile) {
    throw new Error('Could not locate the Electron worker bundle inside the extracted app.');
  }

  const mainPath = path.join(buildDir, mainFile);
  const mainOriginal = await fs.promises.readFile(mainPath, 'utf8');
  logger.info(`Resolved upstream Electron main bundle ${mainFile}`);
  const mainResult = applyLinuxOpenTargetsPatch(mainOriginal, { sourceName: mainFile });
  if (mainResult.updated !== mainOriginal) {
    await fs.promises.writeFile(mainPath, mainResult.updated, 'utf8');
    logger.info('Patched Linux open-in-targets support into the Electron main bundle');
  }

  const workerPath = path.join(buildDir, workerFile);
  const workerOriginal = await fs.promises.readFile(workerPath, 'utf8');
  logger.info(`Resolved upstream Electron worker bundle ${workerFile} for open-in-targets patch`);
  const workerResult = applyLinuxOpenTargetsPatch(workerOriginal, { sourceName: workerFile });
  if (workerResult.updated !== workerOriginal) {
    await fs.promises.writeFile(workerPath, workerResult.updated, 'utf8');
    logger.info('Patched Linux open-in-targets support into the Electron worker bundle');
  }

  return {
    status: mergePatchStatuses([mainResult, workerResult]),
    sourceName: `${mainFile},${workerFile}`
  };
}

function mergePatchStatuses(results) {
  if (results.some((result) => result.status === 'applied')) {
    return 'applied';
  }
  if (results.every((result) => result.status === 'already-applied')) {
    return 'already-applied';
  }
  if (results.every((result) => result.status === 'skipped')) {
    return 'skipped';
  }
  return results[0]?.status ?? 'skipped';
}

async function patchMainProcessLinuxMenuBar(extractedAppDir, logger) {
  const buildDir = path.join(extractedAppDir, '.vite', 'build');
  const files = await fs.promises.readdir(buildDir);
  const mainFile = files.find((name) => /^main[-.].+\.js$/.test(name) || name === 'main.js');
  if (!mainFile) {
    throw new Error('Could not locate the Electron main bundle inside the extracted app.');
  }

  const mainPath = path.join(buildDir, mainFile);
  const original = await fs.promises.readFile(mainPath, 'utf8');
  logger.info(`Resolved upstream Electron main bundle ${mainFile} for Linux menu-bar patch`);
  const result = applyLinuxMenuBarPatch(original, { sourceName: mainFile });
  if (result.updated !== original) {
    await fs.promises.writeFile(mainPath, result.updated, 'utf8');
    logger.info('Patched Linux native menu-bar auto-hide behavior into the Electron main bundle');
  }
  return {
    status: result.status,
    sourceName: mainFile
  };
}

async function patchMainProcessLinuxTitleBarOverlay(extractedAppDir, logger) {
  const buildDir = path.join(extractedAppDir, '.vite', 'build');
  const files = await fs.promises.readdir(buildDir);
  const mainFile = files.find((name) => /^main[-.].+\.js$/.test(name) || name === 'main.js');
  if (!mainFile) {
    throw new Error('Could not locate the Electron main bundle inside the extracted app.');
  }

  const mainPath = path.join(buildDir, mainFile);
  const original = await fs.promises.readFile(mainPath, 'utf8');
  logger.info(`Resolved upstream Electron main bundle ${mainFile} for Linux title-bar overlay patch`);
  const result = applyLinuxTitleBarOverlayPatch(original, { sourceName: mainFile });
  if (result.updated !== original) {
    await fs.promises.writeFile(mainPath, result.updated, 'utf8');
    logger.info('Patched Linux title-bar overlay colors into the Electron main bundle');
  }
  return {
    status: result.status,
    sourceName: mainFile
  };
}

async function patchMainProcessLinuxNativeWindowFrame(extractedAppDir, logger) {
  const buildDir = path.join(extractedAppDir, '.vite', 'build');
  const files = await fs.promises.readdir(buildDir);
  const mainFile = files.find((name) => /^main[-.].+\.js$/.test(name) || name === 'main.js');
  if (!mainFile) {
    throw new Error('Could not locate the Electron main bundle inside the extracted app.');
  }

  const mainPath = path.join(buildDir, mainFile);
  const original = await fs.promises.readFile(mainPath, 'utf8');
  logger.info(`Resolved upstream Electron main bundle ${mainFile} for Linux native frame patch`);
  const result = applyLinuxNativeWindowFramePatch(original, { sourceName: mainFile });
  if (result.updated !== original) {
    await fs.promises.writeFile(mainPath, result.updated, 'utf8');
    logger.info('Patched Linux primary window to use the native window frame');
  }
  return {
    status: result.status,
    sourceName: mainFile
  };
}

async function patchMainProcessLinuxPrimaryWindowModeControls(extractedAppDir, logger) {
  const buildDir = path.join(extractedAppDir, '.vite', 'build');
  const files = await fs.promises.readdir(buildDir);
  const mainFile = files.find((name) => /^main[-.].+\.js$/.test(name) || name === 'main.js');
  if (!mainFile) {
    throw new Error('Could not locate the Electron main bundle inside the extracted app.');
  }

  const mainPath = path.join(buildDir, mainFile);
  const original = await fs.promises.readFile(mainPath, 'utf8');
  logger.info(
    `Resolved upstream Electron main bundle ${mainFile} for Linux primary window mode controls patch`
  );
  const result = applyLinuxPrimaryWindowModeControlsPatch(original, { sourceName: mainFile });
  if (result.updated !== original) {
    await fs.promises.writeFile(mainPath, result.updated, 'utf8');
    logger.info('Patched Linux primary window mode to keep native window controls available');
  }
  return {
    status: result.status,
    sourceName: mainFile
  };
}

async function patchMainProcessLinuxWindowFocusableOption(extractedAppDir, logger) {
  const buildDir = path.join(extractedAppDir, '.vite', 'build');
  const files = await fs.promises.readdir(buildDir);
  const mainFile = files.find((name) => /^main[-.].+\.js$/.test(name) || name === 'main.js');
  if (!mainFile) {
    throw new Error('Could not locate the Electron main bundle inside the extracted app.');
  }

  const mainPath = path.join(buildDir, mainFile);
  const original = await fs.promises.readFile(mainPath, 'utf8');
  logger.info(
    `Resolved upstream Electron main bundle ${mainFile} for Linux BrowserWindow focusable option patch`
  );
  const result = applyLinuxWindowFocusableOptionPatch(original, { sourceName: mainFile });
  if (result.updated !== original) {
    await fs.promises.writeFile(mainPath, result.updated, 'utf8');
    logger.info('Patched Linux BrowserWindow focusable option handling into the Electron main bundle');
  }
  return {
    status: result.status,
    sourceName: mainFile
  };
}

async function patchMainProcessLinuxWindowIcon(extractedAppDir, logger) {
  const buildDir = path.join(extractedAppDir, '.vite', 'build');
  const files = await fs.promises.readdir(buildDir);
  const mainFile = files.find((name) => /^main[-.].+\.js$/.test(name) || name === 'main.js');
  if (!mainFile) {
    throw new Error('Could not locate the Electron main bundle inside the extracted app.');
  }

  const mainPath = path.join(buildDir, mainFile);
  const original = await fs.promises.readFile(mainPath, 'utf8');
  logger.info(`Resolved upstream Electron main bundle ${mainFile} for Linux window icon patch`);
  const result = applyLinuxWindowIconPatch(original, { sourceName: mainFile });
  if (result.updated !== original) {
    await fs.promises.writeFile(mainPath, result.updated, 'utf8');
    logger.info('Patched Linux BrowserWindow icon into the Electron main bundle');
  }
  return {
    status: result.status,
    sourceName: mainFile
  };
}

async function patchMainProcessLinuxCloseCancel(extractedAppDir, logger) {
  const buildDir = path.join(extractedAppDir, '.vite', 'build');
  const files = await fs.promises.readdir(buildDir);
  const mainFile = files.find((name) => /^main[-.].+\.js$/.test(name) || name === 'main.js');
  if (!mainFile) {
    throw new Error('Could not locate the Electron main bundle inside the extracted app.');
  }

  const mainPath = path.join(buildDir, mainFile);
  const original = await fs.promises.readFile(mainPath, 'utf8');
  logger.info(`Resolved upstream Electron main bundle ${mainFile} for Linux close-cancel patch`);
  const result = applyLinuxCloseCancelPatch(original, { sourceName: mainFile });
  if (result.updated !== original) {
    await fs.promises.writeFile(mainPath, result.updated, 'utf8');
    logger.info('Patched Linux close-cancel window restoration into the Electron main bundle');
  }
  return {
    status: result.status,
    sourceName: mainFile
  };
}

async function patchMainProcessLinuxNotificationSound(extractedAppDir, logger) {
  const buildDir = path.join(extractedAppDir, '.vite', 'build');
  const files = await fs.promises.readdir(buildDir);
  const mainFile = files.find((name) => /^main[-.].+\.js$/.test(name) || name === 'main.js');
  if (!mainFile) {
    throw new Error('Could not locate the Electron main bundle inside the extracted app.');
  }

  const mainPath = path.join(buildDir, mainFile);
  const original = await fs.promises.readFile(mainPath, 'utf8');
  logger.info(`Resolved upstream Electron main bundle ${mainFile} for notification sound patch`);
  const result = applyLinuxNotificationSoundPatch(original, { sourceName: mainFile });
  if (result.updated !== original) {
    await fs.promises.writeFile(mainPath, result.updated, 'utf8');
    logger.info('Patched Linux notification sound playback into the Electron main bundle');
  }
  return {
    status: result.status,
    sourceName: mainFile
  };
}

async function patchMainProcessLinuxWorktreeEnvironment(extractedAppDir, logger) {
  const buildDir = path.join(extractedAppDir, '.vite', 'build');
  const files = await fs.promises.readdir(buildDir);
  const mainFile = files.find((name) => /^main[-.].+\.js$/.test(name) || name === 'main.js');
  if (!mainFile) {
    throw new Error('Could not locate the Electron main bundle inside the extracted app.');
  }

  const mainPath = path.join(buildDir, mainFile);
  const original = await fs.promises.readFile(mainPath, 'utf8');
  logger.info(`Resolved upstream Electron main bundle ${mainFile} for worktree environment patch`);
  const result = applyLinuxWorktreeEnvironmentMainPatch(original, { sourceName: mainFile });
  if (result.updated !== original) {
    await fs.promises.writeFile(mainPath, result.updated, 'utf8');
    logger.info('Patched worktree environment propagation into the Electron main bundle');
  }
  return {
    status: result.status,
    sourceName: mainFile
  };
}

async function patchWorkerLinuxWorktreeEnvironment(extractedAppDir, logger) {
  const buildDir = path.join(extractedAppDir, '.vite', 'build');
  const files = await fs.promises.readdir(buildDir);
  const workerFile = files.find((name) => /^worker[-.].+\.js$/.test(name) || name === 'worker.js');
  if (!workerFile) {
    throw new Error('Could not locate the Electron worker bundle inside the extracted app.');
  }

  const workerPath = path.join(buildDir, workerFile);
  const original = await fs.promises.readFile(workerPath, 'utf8');
  logger.info(`Resolved upstream Electron worker bundle ${workerFile} for worktree environment patch`);
  const result = applyLinuxWorktreeEnvironmentWorkerPatch(original, { sourceName: workerFile });
  if (result.updated !== original) {
    await fs.promises.writeFile(workerPath, result.updated, 'utf8');
    logger.info('Patched worktree environment handling into the Electron worker bundle');
  }
  return {
    status: result.status,
    sourceName: workerFile
  };
}

async function patchMainProcessLinuxBrowserUseHostFetch(extractedAppDir, logger) {
  const buildDir = path.join(extractedAppDir, '.vite', 'build');
  const files = await fs.promises.readdir(buildDir);
  const mainFile = files.find((name) => /^main[-.].+\.js$/.test(name) || name === 'main.js');
  if (!mainFile) {
    throw new Error('Could not locate the Electron main bundle inside the extracted app.');
  }

  const mainPath = path.join(buildDir, mainFile);
  const original = await fs.promises.readFile(mainPath, 'utf8');
  logger.info(`Resolved upstream Electron main bundle ${mainFile} for Browser Use host fetch patch`);
  const result = applyLinuxBrowserUseHostFetchPatch(original, { sourceName: mainFile });
  if (result.updated !== original) {
    await fs.promises.writeFile(mainPath, result.updated, 'utf8');
    logger.info('Patched Browser Use authenticated host fetch into the Electron main bundle');
  }
  return {
    status: result.status,
    sourceName: mainFile
  };
}

async function patchMainProcessLinuxBrowserUseRuntimePaths(extractedAppDir, logger) {
  const buildDir = path.join(extractedAppDir, '.vite', 'build');
  const files = await fs.promises.readdir(buildDir);
  const mainFile = files.find((name) => /^main[-.].+\.js$/.test(name) || name === 'main.js');
  if (!mainFile) {
    throw new Error('Could not locate the Electron main bundle inside the extracted app.');
  }

  const mainPath = path.join(buildDir, mainFile);
  const original = await fs.promises.readFile(mainPath, 'utf8');
  logger.info(`Resolved upstream Electron main bundle ${mainFile} for Browser Use runtime path patch`);
  const result = applyLinuxBrowserUseRuntimePathsPatch(original, { sourceName: mainFile });
  if (result.updated !== original) {
    await fs.promises.writeFile(mainPath, result.updated, 'utf8');
    logger.info('Patched Browser Use Linux runtime paths into the Electron main bundle');
  }
  return {
    status: result.status,
    sourceName: mainFile
  };
}

async function patchMainProcessLinuxBundledBrowserChromePlugins(extractedAppDir, logger) {
  const buildDir = path.join(extractedAppDir, '.vite', 'build');
  const files = await fs.promises.readdir(buildDir);
  const mainFile = files.find((name) => /^main[-.].+\.js$/.test(name) || name === 'main.js');
  if (!mainFile) {
    throw new Error('Could not locate the Electron main bundle inside the extracted app.');
  }

  const mainPath = path.join(buildDir, mainFile);
  const original = await fs.promises.readFile(mainPath, 'utf8');
  logger.info(
    `Resolved upstream Electron main bundle ${mainFile} for bundled Browser/Chrome plugin patch`
  );
  const result = applyLinuxBundledBrowserChromePluginsPatch(original, { sourceName: mainFile });
  if (result.updated !== original) {
    await fs.promises.writeFile(mainPath, result.updated, 'utf8');
    logger.info('Patched Linux bundled Browser/Chrome plugin reconciliation');
  }
  return {
    status: result.status,
    sourceName: mainFile
  };
}

async function patchMainProcessLinuxChromeExtensionSettings(extractedAppDir, logger) {
  const buildDir = path.join(extractedAppDir, '.vite', 'build');
  const files = await fs.promises.readdir(buildDir);
  const mainFile = files.find((name) => /^main[-.].+\.js$/.test(name) || name === 'main.js');
  if (!mainFile) {
    throw new Error('Could not locate the Electron main bundle inside the extracted app.');
  }

  const mainPath = path.join(buildDir, mainFile);
  const original = await fs.promises.readFile(mainPath, 'utf8');
  logger.info(`Resolved upstream Electron main bundle ${mainFile} for Chrome extension settings patch`);
  const result = applyLinuxChromeExtensionSettingsPatch(original, { sourceName: mainFile });
  if (result.updated !== original) {
    await fs.promises.writeFile(mainPath, result.updated, 'utf8');
    logger.info('Patched Chrome extension settings detection into the Electron main bundle');
  }
  return {
    status: result.status,
    sourceName: mainFile
  };
}

async function patchElectronLinuxChromeNativeHostRuntimePaths(extractedAppDir, logger) {
  const buildDir = path.join(extractedAppDir, '.vite', 'build');
  const files = (await fs.promises.readdir(buildDir)).filter((name) => /\.js$/.test(name));
  for (const bundleFile of files) {
    const bundlePath = path.join(buildDir, bundleFile);
    const original = await fs.promises.readFile(bundlePath, 'utf8');
    if (
      !original.includes('chrome-native-hosts-v2.json') &&
      !CHROME_NATIVE_HOST_RUNTIME_PATHS_REGISTRATION_PATTERN.test(original)
    ) {
      continue;
    }
    logger.info(
      `Resolved Electron bundle ${bundleFile} for Chrome native host runtime path patch`
    );
    const result = applyLinuxChromeNativeHostRuntimePathsPatch(original, {
      sourceName: bundleFile
    });
    if (result.updated !== original) {
      await fs.promises.writeFile(bundlePath, result.updated, 'utf8');
      logger.info('Patched Chrome native host Linux runtime paths into Electron bundle');
    }
    return {
      status: result.status,
      sourceName: bundleFile
    };
  }

  throw new Error(
    `${LINUX_CHROME_NATIVE_HOST_RUNTIME_PATHS_PATCH_BASE_ERROR_MESSAGE} Missing anchor: Chrome native host v2 registration.`
  );
}

export async function patchElectronLinuxOwlFeatureBinding(extractedAppDir, logger) {
  const buildDir = path.join(extractedAppDir, '.vite', 'build');
  const files = (await fs.promises.readdir(buildDir)).filter((name) => /\.js$/.test(name));

  for (const bundleFile of files) {
    const bundlePath = path.join(buildDir, bundleFile);
    const original = await fs.promises.readFile(bundlePath, 'utf8');
    if (
      !original.includes('electron_common_owl_features') &&
      !original.includes(LINUX_OWL_FEATURE_BINDING_PATCH_MARKER)
    ) {
      continue;
    }

    logger.info(`Resolved Electron bundle ${bundleFile} for Owl feature binding fallback`);
    const result = applyLinuxOwlFeatureBindingPatch(original, { sourceName: bundleFile });
    if (result.updated !== original) {
      await fs.promises.writeFile(bundlePath, result.updated, 'utf8');
      logger.info('Patched Linux Owl feature binding fallback into Electron bundle');
    }
    return {
      status: result.status,
      sourceName: bundleFile
    };
  }

  logger.info('No Electron Owl feature binding helper detected; Linux fallback is not needed');
  return {
    status: 'already-applied',
    reason: 'bundle-not-needed'
  };
}

async function patchMainProcessLinuxRemoteControl(extractedAppDir, logger) {
  const buildDir = path.join(extractedAppDir, '.vite', 'build');
  const files = await fs.promises.readdir(buildDir);
  const mainFile = files.find((name) => /^main[-.].+\.js$/.test(name) || name === 'main.js');
  if (!mainFile) {
    throw new Error('Could not locate the Electron main bundle inside the extracted app.');
  }

  const mainPath = path.join(buildDir, mainFile);
  const original = await fs.promises.readFile(mainPath, 'utf8');
  logger.info(`Resolved upstream Electron main bundle ${mainFile} for remote-control patch`);
  const result = applyLinuxRemoteControlPatch(original, { sourceName: mainFile });
  if (result.updated !== original) {
    await fs.promises.writeFile(mainPath, result.updated, 'utf8');
    logger.info('Patched Linux remote-control feature availability into the Electron main bundle');
  }
  return {
    status: result.status,
    sourceName: mainFile
  };
}

async function patchMainProcessLinuxPowerSaveBlocker(extractedAppDir, logger) {
  const buildDir = path.join(extractedAppDir, '.vite', 'build');
  const files = await fs.promises.readdir(buildDir);
  const mainFile = files.find((name) => /^main[-.].+\.js$/.test(name) || name === 'main.js');
  if (!mainFile) {
    throw new Error('Could not locate the Electron main bundle inside the extracted app.');
  }

  const mainPath = path.join(buildDir, mainFile);
  const original = await fs.promises.readFile(mainPath, 'utf8');
  logger.info(`Resolved upstream Electron main bundle ${mainFile} for Linux power-save patch`);
  const result = applyLinuxPowerSaveBlockerPatch(original, { sourceName: mainFile });
  if (result.updated !== original) {
    await fs.promises.writeFile(mainPath, result.updated, 'utf8');
    logger.info('Patched Linux system sleep inhibition into the Electron main bundle');
  }
  return {
    status: result.status,
    sourceName: mainFile
  };
}

async function patchMainProcessLinuxPetYappingUsage(extractedAppDir, logger) {
  const buildDir = path.join(extractedAppDir, '.vite', 'build');
  const files = await fs.promises.readdir(buildDir);
  const mainFile = files.find((name) => /^main[-.].+\.js$/.test(name) || name === 'main.js');
  if (!mainFile) {
    throw new Error('Could not locate the Electron main bundle inside the extracted app.');
  }

  const mainPath = path.join(buildDir, mainFile);
  const original = await fs.promises.readFile(mainPath, 'utf8');
  logger.info(`Resolved upstream Electron main bundle ${mainFile} for pet yapping usage provider`);
  const result = applyLinuxPetYappingUsageMainPatch(original, { sourceName: mainFile });
  if (result.updated !== original) {
    await fs.promises.writeFile(mainPath, result.updated, 'utf8');
    logger.info('Patched pet yapping usage provider into the Electron main bundle');
  }
  return {
    status: result.status,
    sourceName: mainFile
  };
}

async function patchRendererLinuxRemoteControlVisibility(extractedAppDir, logger) {
  const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
  const assetNames = await fs.promises.readdir(assetsDir);
  const jsAssets = assetNames.filter((name) => name.endsWith('.js'));
  let sawCandidate = false;
  let lastError = null;

  for (const assetName of jsAssets) {
    const assetPath = path.join(assetsDir, assetName);
    const original = await fs.promises.readFile(assetPath, 'utf8');
    const isCandidate =
      original.includes('remote_control_connections_state') &&
      original.includes('remoteControlConnectionsState') &&
      original.includes('slingshotEnabled');

    if (!isCandidate) {
      continue;
    }

    sawCandidate = true;
    logger.info(`Resolved renderer remote-control visibility bundle ${assetName}`);

    try {
      const result = applyLinuxRemoteControlVisibilityPatch(original, { sourceName: assetName });
      if (result.updated !== original) {
        await fs.promises.writeFile(assetPath, result.updated, 'utf8');
        logger.info(
          `Patched Linux remote-control settings visibility into renderer bundle ${assetName}`
        );
      }
      return {
        status: result.status,
        sourceName: assetName
      };
    } catch (error) {
      lastError = error;
    }
  }

  if (!sawCandidate) {
    throw new Error(
      'Could not locate the renderer remote-control visibility bundle inside the extracted app.'
    );
  }

  throw (
    lastError ??
    new Error('Could not patch the renderer remote-control visibility bundle for Linux.')
  );
}

async function patchRendererLinuxComputerUseUi(extractedAppDir, logger) {
  const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
  const assetNames = await fs.promises.readdir(assetsDir);
  const jsAssets = assetNames.filter((name) => name.endsWith('.js'));
  let sawCandidate = false;
  let lastError = null;

  for (const assetName of jsAssets) {
    const assetPath = path.join(assetsDir, assetName);
    const original = await fs.promises.readFile(assetPath, 'utf8');
    const isCandidate =
      original.includes('featureName:`computer_use`') ||
      original.includes('windows_computer_use') ||
      original.includes('isComputerUseGateEnabled');

    if (!isCandidate) {
      continue;
    }

    sawCandidate = true;
    logger.info(`Resolved renderer Computer Use availability bundle ${assetName}`);

    try {
      const result = applyLinuxComputerUseUiPatch(original, { sourceName: assetName });
      if (result.updated !== original) {
        await fs.promises.writeFile(assetPath, result.updated, 'utf8');
        logger.info(`Patched Linux Computer Use UI availability into ${assetName}`);
      }
      return {
        status: result.status,
        sourceName: assetName
      };
    } catch (error) {
      lastError = error;
    }
  }

  if (!sawCandidate) {
    throw new Error(
      'Could not locate the renderer Computer Use availability bundle inside the extracted app.'
    );
  }

  throw (
    lastError ??
    new Error('Could not patch the renderer Computer Use availability bundle for Linux.')
  );
}

async function patchRendererLinuxRemoteControlKeepAwake(extractedAppDir, logger) {
  const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
  const assetNames = await fs.promises.readdir(assetsDir);
  const jsAssets = assetNames.filter((name) => name.endsWith('.js'));
  let sawCandidate = false;
  let lastError = null;

  for (const assetName of jsAssets) {
    const assetPath = path.join(assetsDir, assetName);
    const original = await fs.promises.readFile(assetPath, 'utf8');
    const isCandidate =
      original.includes('power-save-blocker-set') &&
      ((original.includes('PREVENT_SLEEP_WHILE_RUNNING') &&
        original.includes('KEEP_REMOTE_CONTROL_AWAKE_WHILE_PLUGGED_IN')) ||
        (original.includes('preventSleepWhileRunning') &&
          original.includes('keepRemoteControlAwakeWhilePluggedIn')));

    if (!isCandidate) {
      continue;
    }

    sawCandidate = true;
    logger.info(`Resolved renderer remote-control keep-awake bundle ${assetName}`);

    try {
      const result = applyLinuxRemoteControlKeepAwakePatch(original, { sourceName: assetName });
      if (result.updated !== original) {
        await fs.promises.writeFile(assetPath, result.updated, 'utf8');
        logger.info(`Patched Linux remote-control keep-awake dispatch into ${assetName}`);
      }
      return {
        status: result.status,
        sourceName: assetName
      };
    } catch (error) {
      lastError = error;
    }
  }

  if (!sawCandidate) {
    throw new Error(
      'Could not locate the renderer remote-control keep-awake bundle inside the extracted app.'
    );
  }

  throw (
    lastError ??
    new Error('Could not patch the renderer remote-control keep-awake bundle for Linux.')
  );
}

async function patchMainProcessLinuxAvatarOverlay(extractedAppDir, logger) {
  const buildDir = path.join(extractedAppDir, '.vite', 'build');
  const files = await fs.promises.readdir(buildDir);
  const mainFile = files.find((name) => /^main[-.].+\.js$/.test(name) || name === 'main.js');
  if (!mainFile) {
    throw new Error('Could not locate the Electron main bundle inside the extracted app.');
  }

  const mainPath = path.join(buildDir, mainFile);
  const original = await fs.promises.readFile(mainPath, 'utf8');
  logger.info(`Resolved upstream Electron main bundle ${mainFile} for Linux avatar overlay patch`);
  const result = applyLinuxAvatarOverlayPatch(original, { sourceName: mainFile });
  if (result.updated !== original) {
    await fs.promises.writeFile(mainPath, result.updated, 'utf8');
    logger.info('Patched Linux avatar overlay behavior into the Electron main bundle');
  }
  return {
    status: result.status,
    sourceName: mainFile
  };
}

async function patchRendererLinuxAvatarOverlay(extractedAppDir, logger) {
  const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
  const assetNames = await fs.promises.readdir(assetsDir);
  for (const assetName of assetNames) {
    if (!/^avatar-overlay-page[-.].+\.js$/.test(assetName)) {
      continue;
    }
    const assetPath = path.join(assetsDir, assetName);
    const original = await fs.promises.readFile(assetPath, 'utf8');
    logger.info(`Resolved renderer bundle ${assetName} for Linux avatar overlay patch`);
    const result = applyLinuxAvatarOverlayRendererPatch(original, { sourceName: assetName });
    if (result.updated !== original) {
      await fs.promises.writeFile(assetPath, result.updated, 'utf8');
      logger.info('Patched Linux avatar overlay drag coordinates into the renderer bundle');
    }
    return {
      status: result.status,
      sourceName: assetName
    };
  }

  throw new Error('Could not locate the renderer avatar overlay bundle inside the extracted app.');
}

async function patchRendererLinuxPetYappingUsage(extractedAppDir, logger) {
  const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
  const assetNames = await fs.promises.readdir(assetsDir);
  const jsAssetName = assetNames.find((name) => /^avatar-overlay-page[-.].+\.js$/.test(name));
  if (!jsAssetName) {
    throw new Error('Could not locate the renderer avatar overlay bundle inside the extracted app.');
  }
  const cssAssetName = assetNames.find((name) => /^codex-avatar[-.].+\.css$/.test(name));
  if (!cssAssetName) {
    throw new Error('Could not locate the renderer avatar stylesheet inside the extracted app.');
  }

  const jsAssetPath = path.join(assetsDir, jsAssetName);
  const cssAssetPath = path.join(assetsDir, cssAssetName);
  const originalJs = await fs.promises.readFile(jsAssetPath, 'utf8');
  const originalCss = await fs.promises.readFile(cssAssetPath, 'utf8');
  logger.info(`Resolved renderer bundle ${jsAssetName} for pet yapping usage patch`);
  logger.info(`Resolved renderer stylesheet ${cssAssetName} for pet yapping usage patch`);

  const jsResult = applyLinuxPetYappingUsagePatch(originalJs, { sourceName: jsAssetName });
  const cssResult = applyLinuxPetYappingUsageCssPatch(originalCss, { sourceName: cssAssetName });
  if (jsResult.updated !== originalJs) {
    await fs.promises.writeFile(jsAssetPath, jsResult.updated, 'utf8');
  }
  if (cssResult.updated !== originalCss) {
    await fs.promises.writeFile(cssAssetPath, cssResult.updated, 'utf8');
  }
  if (jsResult.updated !== originalJs || cssResult.updated !== originalCss) {
    logger.info('Patched pet yapping usage bubble into the avatar overlay renderer');
  }

  return {
    status:
      jsResult.status === 'already-applied' && cssResult.status === 'already-applied'
        ? 'already-applied'
        : 'applied',
    sourceName: `${jsAssetName},${cssAssetName}`
  };
}

export function applyLinuxOpenTargetsPatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxOpenTargetsPatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxOpenTargetsPatch(bundleSource, options = {}) {
  if (bundleSource.includes(LINUX_OPEN_TARGETS_PATCH_MARKER)) {
    return bundleSource;
  }

  const legacyMatch = bundleSource.match(OPEN_TARGETS_BLOCK_PATTERN);
  if (legacyMatch?.groups?.targetList && legacyMatch.groups.targetVar) {
    return bundleSource.replace(
      OPEN_TARGETS_BLOCK_PATTERN,
      buildLinuxOpenTargetsBlock(legacyMatch.groups)
    );
  }

  const weakMapMatch = bundleSource.match(OPEN_TARGETS_BLOCK_WEAKMAP_PATTERN);
  if (weakMapMatch?.groups?.targetList && weakMapMatch.groups.targetVar) {
    return bundleSource.replace(
      OPEN_TARGETS_BLOCK_WEAKMAP_PATTERN,
      buildLinuxOpenTargetsWeakMapBlock(weakMapMatch.groups)
    );
  }

  const workerRegistryMatch = bundleSource.match(OPEN_TARGETS_WORKER_REGISTRY_PATTERN);
  if (workerRegistryMatch?.groups?.targetList && workerRegistryMatch.groups.registryVar) {
    return bundleSource.replace(
      OPEN_TARGETS_WORKER_REGISTRY_PATTERN,
      buildLinuxOpenTargetsWorkerRegistryBlock(workerRegistryMatch.groups)
    );
  }

  const dynamicRegistryMatch = bundleSource.match(OPEN_TARGETS_DYNAMIC_REGISTRY_PATTERN);
  if (dynamicRegistryMatch?.groups?.targetList && dynamicRegistryMatch.groups.targetVar) {
    return bundleSource.replace(
      OPEN_TARGETS_DYNAMIC_REGISTRY_PATTERN,
      buildLinuxOpenTargetsDynamicRegistryBlock(dynamicRegistryMatch.groups)
    );
  }

  throw new Error(buildOpenTargetsPatchErrorMessage(bundleSource, options.sourceName));
}

export function applyLinuxMenuBarPatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxMenuBarPatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxMenuBarPatch(bundleSource, options = {}) {
  let updated = bundleSource;
  if (!updated.includes(LINUX_MENU_BAR_PATCH_MARKER)) {
    let patchedAutoHide = false;
    for (const snippet of [
      LINUX_MENU_BAR_AUTO_HIDE_SNIPPET_CURRENT,
      LINUX_MENU_BAR_AUTO_HIDE_SNIPPET_26_609
    ]) {
      if (updated.includes(snippet)) {
        updated = updated.replace(snippet, LINUX_MENU_BAR_AUTO_HIDE_REPLACEMENT_CURRENT);
        patchedAutoHide = true;
        break;
      }
    }
    if (!patchedAutoHide) {
      throw new Error(buildLinuxMenuBarPatchErrorMessage(bundleSource, options.sourceName));
    }
  }
  return injectLinuxAboutDialogFallbackPatch(updated, options);
}

export function applyLinuxTitleBarOverlayPatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxTitleBarOverlayPatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxTitleBarOverlayPatch(bundleSource, options = {}) {
  const match =
    bundleSource.match(LINUX_TITLE_BAR_OVERLAY_OPTIONS_PATTERN) ??
    bundleSource.match(LINUX_TITLE_BAR_OVERLAY_PATCHED_OPTIONS_PATTERN) ??
    bundleSource.match(LINUX_TITLE_BAR_OVERLAY_CURRENT_PATCHED_OPTIONS_PATTERN) ??
    bundleSource.match(LINUX_TITLE_BAR_OVERLAY_TRANSPARENT_PATCHED_OPTIONS_PATTERN);
  if (bundleSource.includes(LINUX_TITLE_BAR_OVERLAY_THEME_SYNC_PATCH_MARKER)) {
    let updated = bundleSource;
    if (match?.groups && LINUX_TITLE_BAR_OVERLAY_CURRENT_PATCHED_OPTIONS_PATTERN.test(bundleSource)) {
      updated = updated.replace(LINUX_TITLE_BAR_OVERLAY_CURRENT_PATCHED_OPTIONS_PATTERN, () =>
        buildLinuxTitleBarOverlayOptions(match.groups)
      );
    } else if (
      match?.groups &&
      LINUX_TITLE_BAR_OVERLAY_TRANSPARENT_PATCHED_OPTIONS_PATTERN.test(bundleSource)
    ) {
      updated = updated.replace(LINUX_TITLE_BAR_OVERLAY_TRANSPARENT_PATCHED_OPTIONS_PATTERN, () =>
        buildLinuxTitleBarOverlayOptions(match.groups)
      );
    }
    return injectLinuxTitleBarOverlayThemeSyncPatch(updated, options.sourceName);
  }
  if (!match?.groups) {
    throw new Error(buildLinuxTitleBarOverlayPatchErrorMessage(bundleSource, options.sourceName));
  }
  const optionsPattern = bundleSource.includes(LINUX_TITLE_BAR_OVERLAY_PATCH_MARKER)
    ? LINUX_TITLE_BAR_OVERLAY_PATCHED_OPTIONS_PATTERN
    : LINUX_TITLE_BAR_OVERLAY_OPTIONS_PATTERN;
  const updated = bundleSource.replace(optionsPattern, () =>
    buildLinuxTitleBarOverlayOptions(match.groups)
  );
  return injectLinuxTitleBarOverlayThemeSyncPatch(updated, options.sourceName);
}

function injectLinuxTitleBarOverlayThemeSyncPatch(bundleSource, sourceName) {
  const shouldPatchThemeSync =
    bundleSource.includes('setTitleBarOverlay(') ||
    bundleSource.includes('windowZooms=new Map') ||
    bundleSource.includes('power-save-blocker-set');
  if (!shouldPatchThemeSync) {
    return bundleSource;
  }

  let updated = bundleSource;
  if (!updated.includes('codexLinuxTitleBarOverlayThemes=new Map')) {
    updated = updated.replace(
      /windowZooms=new Map;/,
      'windowZooms=new Map;codexLinuxTitleBarOverlayThemes=new Map;'
    );
  }

  const windowZoomMatch = updated.match(LINUX_TITLE_BAR_OVERLAY_WINDOW_ZOOM_PATTERN);
  if (windowZoomMatch?.groups) {
    updated = updated.replace(
      LINUX_TITLE_BAR_OVERLAY_WINDOW_ZOOM_PATTERN,
      buildLinuxTitleBarOverlayWindowZoomReplacement(windowZoomMatch.groups)
    );
  }

  const appSyncMatch = updated.match(LINUX_TITLE_BAR_OVERLAY_APP_SYNC_PATTERN);
  if (appSyncMatch?.groups) {
    updated = updated.replace(
      LINUX_TITLE_BAR_OVERLAY_APP_SYNC_PATTERN,
      buildLinuxTitleBarOverlayAppSyncReplacement(appSyncMatch.groups)
    );
  }

  if (!updated.includes('case`codex-linux-title-bar-overlay-theme-set`')) {
    updated = updated.replace(
      LINUX_TITLE_BAR_OVERLAY_MESSAGE_CASE_PATTERN,
      (...args) => {
        const groups = args.at(-1);
        return buildLinuxTitleBarOverlayThemeMessageCase(updated, {
          webContentsVar: groups.webContentsVar,
          messageVar: groups.messageVar,
          powerCase: `case\`power-save-blocker-set\`:this.updatePowerSaveBlocker(${groups.webContentsVar},${groups.messageVar}.shouldBlock,${groups.messageVar}.keepRemoteControlAwakeWhilePluggedIn);break;`
        });
      }
    );
  } else {
    updated = updated.replace(
      LINUX_TITLE_BAR_OVERLAY_EXISTING_MESSAGE_CASE_PATTERN,
      (...args) => {
        const groups = args.at(-1);
        return buildLinuxTitleBarOverlayThemeMessageCase(updated, groups);
      }
    );
  }

  const expectedMessageTarget = `${getLinuxTitleBarOverlayThemeMessageTarget(updated)}codexLinuxSetTitleBarOverlayTheme`;

  if (
    !updated.includes('codexLinuxTitleBarOverlayThemes=new Map') ||
    !updated.includes('codexLinuxSetTitleBarOverlayTheme') ||
    !updated.includes(`case\`codex-linux-title-bar-overlay-theme-set\`:${expectedMessageTarget}`)
  ) {
    throw new Error(
      buildLinuxTitleBarOverlayThemeSyncPatchErrorMessage(bundleSource, sourceName)
    );
  }

  return updated;
}

function getLinuxTitleBarOverlayThemeMessageTarget(bundleSource) {
  return bundleSource.includes('this.windowManager.setWindowZoom(')
    ? 'this.windowManager.'
    : 'this.';
}

function buildLinuxTitleBarOverlayThemeMessageCase(bundleSource, {
  messageVar,
  powerCase,
  webContentsVar
}) {
  return `case\`codex-linux-title-bar-overlay-theme-set\`:${getLinuxTitleBarOverlayThemeMessageTarget(bundleSource)}codexLinuxSetTitleBarOverlayTheme(${webContentsVar},${messageVar});break;${powerCase}`;
}

function buildLinuxTitleBarOverlayOptions({
  colorVar,
  darkColorVar,
  electronVar,
  fnName,
  heightVar,
  lightColorVar,
  scaleVar
}) {
  return `function ${fnName}(${scaleVar}=1,codexLinuxTitleBarOverlayTheme=null){let codexLinuxTitleBarOverlayEnabled=process.platform===\`linux\`&&process?.env?.CODEX_DESKTOP_ENABLE_LINUX_TITLE_BAR_OVERLAY===\`1\`&&process?.env?.CODEX_DESKTOP_DISABLE_LINUX_TITLE_BAR_OVERLAY_PATCH!==\`1\`,codexLinuxTitleBarOverlayColor=codexLinuxTitleBarOverlayTheme?.color??${colorVar},codexLinuxTitleBarOverlaySymbolColor=codexLinuxTitleBarOverlayTheme?.symbolColor??(${electronVar}.nativeTheme.shouldUseDarkColors?\`#c7c7c7\`:\`#4b5563\`);return{color:codexLinuxTitleBarOverlayEnabled?codexLinuxTitleBarOverlayColor:${colorVar},symbolColor:codexLinuxTitleBarOverlayEnabled?codexLinuxTitleBarOverlaySymbolColor:${electronVar}.nativeTheme.shouldUseDarkColors?${darkColorVar}:${lightColorVar},height:Math.round(${heightVar}*${scaleVar})}}/* ${LINUX_TITLE_BAR_OVERLAY_PATCH_MARKER} ${LINUX_TITLE_BAR_OVERLAY_THEME_SYNC_PATCH_MARKER} */`;
}

function buildLinuxTitleBarOverlayWindowZoomReplacement({
  buttonPositionFn,
  electronVar,
  overlayFn,
  webContentsVar,
  windowVar,
  zoomVar
}) {
  return `codexLinuxApplyTitleBarOverlay(${windowVar}){if(process.platform!==\`linux\`||process?.env?.CODEX_DESKTOP_ENABLE_LINUX_TITLE_BAR_OVERLAY!==\`1\`||process?.env?.CODEX_DESKTOP_DISABLE_LINUX_TITLE_BAR_OVERLAY_PATCH===\`1\`||${windowVar}==null||${windowVar}.isDestroyed?.())return;let ${webContentsVar}=this.windowZooms.get(${windowVar}.id)??1,${zoomVar}=this.codexLinuxTitleBarOverlayThemes.get(${windowVar}.id)??null;${windowVar}.setTitleBarOverlay(${overlayFn}(${webContentsVar},${zoomVar}))}codexLinuxSetTitleBarOverlayTheme(${webContentsVar},${zoomVar}){if(process.platform!==\`linux\`||process?.env?.CODEX_DESKTOP_ENABLE_LINUX_TITLE_BAR_OVERLAY!==\`1\`||process?.env?.CODEX_DESKTOP_DISABLE_LINUX_TITLE_BAR_OVERLAY_PATCH===\`1\`)return;let ${windowVar}=${electronVar}.BrowserWindow.fromWebContents(${webContentsVar});if(${windowVar}==null||this.windowAppearances.get(${windowVar}.id)!==\`primary\`)return;let codexLinuxTitleBarOverlayTheme=${zoomVar}&&typeof ${zoomVar}.color===\`string\`&&typeof ${zoomVar}.symbolColor===\`string\`&&${zoomVar}.color.length<=120&&${zoomVar}.symbolColor.length<=120?{color:${zoomVar}.color,symbolColor:${zoomVar}.symbolColor}:null;if(codexLinuxTitleBarOverlayTheme==null)return;this.codexLinuxTitleBarOverlayThemes.set(${windowVar}.id,codexLinuxTitleBarOverlayTheme),this.codexLinuxApplyTitleBarOverlay(${windowVar})}setWindowZoom(${webContentsVar},${zoomVar}){let ${windowVar}=${electronVar}.BrowserWindow.fromWebContents(${webContentsVar});${windowVar}==null||this.windowAppearances.get(${windowVar}.id)!==\`primary\`||(process.platform===\`darwin\`?${windowVar}.setWindowButtonPosition(${buttonPositionFn}(${zoomVar})):(process.platform===\`win32\`||process.platform===\`linux\`&&process?.env?.CODEX_DESKTOP_ENABLE_LINUX_TITLE_BAR_OVERLAY===\`1\`)&&(this.windowZooms.set(${windowVar}.id,${zoomVar}),process.platform===\`linux\`?this.codexLinuxApplyTitleBarOverlay(${windowVar}):${windowVar}.setTitleBarOverlay(${overlayFn}(${zoomVar}))))}`;
}

function buildLinuxTitleBarOverlayAppSyncReplacement({
  appearanceVar,
  electronVar,
  handlerVar,
  overlayFn,
  windowVar
}) {
  return `installApplicationMenuTitleBarOverlaySync(${windowVar},${appearanceVar}){if((process.platform!==\`win32\`&&!(process.platform===\`linux\`&&process?.env?.CODEX_DESKTOP_ENABLE_LINUX_TITLE_BAR_OVERLAY===\`1\`))||process.platform===\`linux\`&&process?.env?.CODEX_DESKTOP_DISABLE_LINUX_TITLE_BAR_OVERLAY_PATCH===\`1\`||${appearanceVar}!==\`primary\`)return;let ${handlerVar}=()=>{${windowVar}.isDestroyed()||${windowVar}.setTitleBarOverlay(${overlayFn}(this.windowZooms.get(${windowVar}.id)))};return ${electronVar}.nativeTheme.on(\`updated\`,${handlerVar}),${handlerVar}(),()=>{${electronVar}.nativeTheme.off(\`updated\`,${handlerVar})}}`;
}

export function applyLinuxNativeWindowFramePatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxNativeWindowFramePatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxNativeWindowFramePatch(bundleSource, options = {}) {
  if (bundleSource.includes(LINUX_NATIVE_WINDOW_FRAME_PATCH_MARKER)) {
    return bundleSource;
  }
  return replaceRegexOrThrow(
    bundleSource,
    LINUX_NATIVE_WINDOW_FRAME_PRIMARY_BRANCH_PATTERN,
    ({ overlayFn, platformVar, zoomVar }) =>
      buildLinuxNativeWindowFramePrimaryBranch({ overlayFn, platformVar, zoomVar }),
    buildLinuxNativeWindowFramePatchErrorMessage(bundleSource, options.sourceName)
  );
}

function buildLinuxNativeWindowFramePrimaryBranch({ overlayFn, platformVar, zoomVar }) {
  const hiddenOverlay = `{titleBarStyle:\`hidden\`,titleBarOverlay:${overlayFn}(${zoomVar})}`;
  return `${platformVar}===\`win32\`?${hiddenOverlay}:${platformVar}===\`linux\`&&process?.env?.CODEX_DESKTOP_ENABLE_LINUX_TITLE_BAR_OVERLAY===\`1\`?${hiddenOverlay}:${platformVar}===\`linux\`?{frame:!0}:{titleBarStyle:\`default\`}/* ${LINUX_NATIVE_WINDOW_FRAME_PATCH_MARKER} */`;
}

export function applyLinuxPrimaryWindowModeControlsPatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxPrimaryWindowModeControlsPatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxPrimaryWindowModeControlsPatch(bundleSource, options = {}) {
  if (bundleSource.includes(LINUX_PRIMARY_WINDOW_MODE_CONTROLS_PATCH_MARKER)) {
    return bundleSource;
  }
  return replaceRegexOrThrow(
    bundleSource,
    LINUX_PRIMARY_WINDOW_MODE_DISABLE_CONTROLS_PATTERN,
    ({ windowVar }) => buildLinuxPrimaryWindowModeControlsReplacement({ windowVar }),
    buildLinuxPrimaryWindowModeControlsPatchErrorMessage(bundleSource, options.sourceName)
  );
}

function buildLinuxPrimaryWindowModeControlsReplacement({ windowVar }) {
  return `process.platform===\`linux\`&&process?.env?.CODEX_DESKTOP_DISABLE_LINUX_PRIMARY_WINDOW_MODE_CONTROLS_PATCH!==\`1\`?(${windowVar}.setResizable(!0),${windowVar}.setMaximizable(!0),${windowVar}.setFullScreenable(!0),typeof ${windowVar}.setMinimizable===\`function\`&&${windowVar}.setMinimizable(!0),typeof ${windowVar}.setClosable===\`function\`&&${windowVar}.setClosable(!0),typeof ${windowVar}.setMovable===\`function\`&&${windowVar}.setMovable(!0)):(${windowVar}.setResizable(!1),${windowVar}.setMaximizable(!1),${windowVar}.setFullScreenable(!1))/* ${LINUX_PRIMARY_WINDOW_MODE_CONTROLS_PATCH_MARKER} */`;
}

export function applyLinuxWindowFocusableOptionPatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxWindowFocusableOptionPatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxWindowFocusableOptionPatch(bundleSource, options = {}) {
  if (bundleSource.includes(LINUX_WINDOW_FOCUSABLE_OPTION_PATCH_MARKER)) {
    return bundleSource;
  }
  return replaceRegexOrThrow(
    bundleSource,
    LINUX_WINDOW_FOCUSABLE_OPTION_PATTERN,
    ({ focusableVar, parentVar, showVar }) =>
      buildLinuxWindowFocusableOptionReplacement({ focusableVar, parentVar, showVar }),
    buildLinuxWindowFocusableOptionPatchErrorMessage(bundleSource, options.sourceName)
  );
}

function buildLinuxWindowFocusableOptionReplacement({ focusableVar, parentVar, showVar }) {
  return `show:${showVar},...${parentVar}==null?{}:{parent:${parentVar}},...${focusableVar}==null?{}:{focusable:${focusableVar}}/* ${LINUX_WINDOW_FOCUSABLE_OPTION_PATCH_MARKER} */,...process.platform`;
}

export function applyLinuxWindowIconPatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxWindowIconPatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxWindowIconPatch(bundleSource, options = {}) {
  if (bundleSource.includes(LINUX_WINDOW_ICON_PATCH_MARKER)) {
    return bundleSource;
  }
  return replaceRegexOrThrow(
    bundleSource,
    LINUX_WINDOW_ICON_BROWSER_WINDOW_PATTERN,
    ({ electronVar, options: windowOptions, webPreferences }) => {
      const separator = windowOptions.trimEnd().endsWith(',') ? '' : ',';
      return `new ${electronVar}.BrowserWindow({${windowOptions}${separator}${buildLinuxWindowIconOptionSpread()},${webPreferences}});this.applyWindowBackdrop`;
    },
    buildLinuxWindowIconPatchErrorMessage(bundleSource, options.sourceName)
  );
}

function buildLinuxWindowIconOptionSpread() {
  return `...process.platform===\`linux\`&&process?.env?.CODEX_DESKTOP_DISABLE_LINUX_WINDOW_ICON_PATCH!==\`1\`?(()=>{try{let e=process.getBuiltinModule?.(\`node:path\`),t=process.getBuiltinModule?.(\`node:fs\`);if(!e||!t||typeof process.resourcesPath!==\`string\`)return{};let n=e.join(process.resourcesPath,\`..\`,\`..\`,\`icons\`,\`codex.png\`);return t.existsSync(n)?{icon:n}:{}}catch{return{}}})():{}/* ${LINUX_WINDOW_ICON_PATCH_MARKER} */`;
}

function injectLinuxAboutDialogFallbackPatch(bundleSource, options = {}) {
  if (bundleSource.includes(LINUX_ABOUT_DIALOG_PATCH_MARKER)) {
    return bundleSource;
  }
  if (
    !bundleSource.includes('codex.aboutDialog.title') &&
    !bundleSource.includes('About {appName}')
  ) {
    return bundleSource;
  }
  const match = bundleSource.match(LINUX_ABOUT_DIALOG_CLICK_PATTERN);
  if (!match?.groups) {
    throw new Error(buildLinuxAboutDialogPatchErrorMessage(bundleSource, options.sourceName));
  }
  return bundleSource.replace(
    LINUX_ABOUT_DIALOG_CLICK_PATTERN,
    buildLinuxAboutDialogFallbackClick(match.groups)
  );
}

function buildLinuxAboutDialogFallbackClick({
  aboutFn,
  buildFlavorVar,
  electronVar,
  menuItemVar,
  windowVar
}) {
  const parentExpr = `${windowVar} instanceof ${electronVar}.BrowserWindow&&!${windowVar}.isDestroyed()?${windowVar}:null`;
  return `click:(${menuItemVar},${windowVar})=>{if(process.platform===\`linux\`&&process?.env?.CODEX_DESKTOP_DISABLE_LINUX_ABOUT_DIALOG_FALLBACK!==\`1\`){let codexLinuxAboutParent=${parentExpr},codexLinuxAboutName=${electronVar}.app.getName(),codexLinuxAboutOptions={type:\`info\`,buttons:[\`OK\`],defaultId:0,cancelId:0,noLink:!0,title:\`About \${codexLinuxAboutName}\`,message:codexLinuxAboutName,detail:\`Version \${${electronVar}.app.getVersion()}\\n\\nOpenAI\`};codexLinuxAboutParent?${electronVar}.dialog.showMessageBox(codexLinuxAboutParent,codexLinuxAboutOptions):${electronVar}.dialog.showMessageBox(codexLinuxAboutOptions);return}${aboutFn}({buildFlavor:${buildFlavorVar},parent:${parentExpr}})/* ${LINUX_ABOUT_DIALOG_PATCH_MARKER} */}`;
}

export function applyLinuxCloseCancelPatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxCloseCancelPatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxCloseCancelPatch(bundleSource, options = {}) {
  if (bundleSource.includes(LINUX_CLOSE_CANCEL_PATCH_MARKER)) {
    return bundleSource;
  }
  const snippetVariants = [
    {
      target: LINUX_CLOSE_CANCEL_BEFORE_QUIT_SNIPPET_CURRENT,
      replacement: `/* ${LINUX_CLOSE_CANCEL_PATCH_MARKER} */${LINUX_CLOSE_CANCEL_BEFORE_QUIT_REPLACEMENT_CURRENT}`
    },
    {
      target: LINUX_CLOSE_CANCEL_BEFORE_QUIT_SNIPPET_26_422,
      replacement: `/* ${LINUX_CLOSE_CANCEL_PATCH_MARKER} */${LINUX_CLOSE_CANCEL_BEFORE_QUIT_REPLACEMENT_26_422}`
    },
    {
      target: LINUX_CLOSE_CANCEL_BEFORE_QUIT_SNIPPET_26_422_STABLE,
      replacement: `/* ${LINUX_CLOSE_CANCEL_PATCH_MARKER} */${LINUX_CLOSE_CANCEL_BEFORE_QUIT_REPLACEMENT_26_422_STABLE}`
    },
    {
      target: LINUX_CLOSE_CANCEL_BEFORE_QUIT_SNIPPET_26_429,
      replacement: `/* ${LINUX_CLOSE_CANCEL_PATCH_MARKER} */${LINUX_CLOSE_CANCEL_BEFORE_QUIT_REPLACEMENT_26_429}`
    }
  ];
  for (const { target, replacement } of snippetVariants) {
    if (bundleSource.includes(target)) {
      return bundleSource.replace(target, replacement);
    }
  }
  return replaceRegexOrThrow(
    bundleSource,
    LINUX_CLOSE_CANCEL_BEFORE_QUIT_GENERIC_PATTERN,
    ({ prefix, eventVar, suffix, windowsVar, ensureWindowCall }) =>
      `/* ${LINUX_CLOSE_CANCEL_PATCH_MARKER} */${prefix}${eventVar}.preventDefault();if(process.platform===\`linux\`&&process?.env?.CODEX_DESKTOP_DISABLE_LINUX_CLOSE_CANCEL_PATCH!==\`1\`){let e=${windowsVar}.showLastActivePrimaryWindow();e?(e.isMinimized()&&e.restore(),e.show(),e.focus()):Promise.resolve(${ensureWindowCall}).then(e=>{e&&!e.isDestroyed()&&(e.isMinimized()&&e.restore(),e.show(),e.focus())})}return${suffix}`,
    buildLinuxCloseCancelPatchErrorMessage(bundleSource, options.sourceName)
  );
}

export function applyLinuxNotificationSoundPatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxNotificationSoundPatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxNotificationSoundPatch(bundleSource, options = {}) {
  if (bundleSource.includes(LINUX_NOTIFICATION_SOUND_PATCH_MARKER)) {
    return bundleSource;
  }
  const childProcessMatch = bundleSource.match(LINUX_NOTIFICATION_SOUND_CHILD_PROCESS_PATTERN);
  if (!childProcessMatch?.groups) {
    throw new Error(buildLinuxNotificationSoundPatchErrorMessage(bundleSource, options.sourceName));
  }
  return replaceRegexOrThrow(
    bundleSource,
    LINUX_NOTIFICATION_SOUND_SHOW_PATTERN,
    ({ showVar }) =>
      `${showVar}.show(),this.codexLinuxPlayNotificationSoundIfNeeded()}${buildLinuxNotificationSoundMethod(childProcessMatch.groups)}stageNotificationSoundIfNeeded(){`,
    buildLinuxNotificationSoundPatchErrorMessage(bundleSource, options.sourceName)
  );
}

export function applyLinuxBrowserUseHostFetchPatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxBrowserUseHostFetchPatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxBrowserUseHostFetchPatch(bundleSource, options = {}) {
  if (bundleSource.includes(LINUX_BROWSER_USE_HOST_FETCH_PATCH_MARKER)) {
    return bundleSource;
  }

  const errorMessage = buildLinuxBrowserUseHostFetchPatchErrorMessage(
    bundleSource,
    options.sourceName
  );
  const authHeaderMatch = bundleSource.match(BROWSER_USE_AUTH_HEADER_HELPER_PATTERN);
  const electronMatch = bundleSource.match(BROWSER_USE_ELECTRON_REQUIRE_PATTERN);
  const desktopOriginatorMatch =
    bundleSource.match(BROWSER_USE_DESKTOP_ORIGINATOR_OPTIONS_PATTERN) ??
    bundleSource.match(BROWSER_USE_DESKTOP_ORIGINATOR_LEGACY_PATTERN);
  if (!authHeaderMatch?.groups || !desktopOriginatorMatch?.groups) {
    throw new Error(errorMessage);
  }
  const browserUseContext = {
    authHeaderFn: authHeaderMatch.groups.authHeaderFn,
    desktopOriginatorVar: desktopOriginatorMatch.groups.desktopOriginatorVar,
    electronVar: electronMatch?.groups?.electronVar ?? 'n'
  };
  const hasLegacyHelperAnchor = BROWSER_USE_HOST_FETCH_HELPER_ANCHOR_PATTERN.test(bundleSource);
  let updated = hasLegacyHelperAnchor
    ? replaceRegexOrThrow(
        bundleSource,
        BROWSER_USE_HOST_FETCH_HELPER_ANCHOR_PATTERN,
        ({ stateFactory, registryClass }) =>
          `${buildLinuxBrowserUseHostFetchHelper(browserUseContext)}function ${stateFactory}(){return{apiImpl:null,server:null,starting:null}}var ${registryClass}=class{`,
        errorMessage
      )
    : bundleSource;
  if (!hasLegacyHelperAnchor) {
    const apiClassMatch = updated.match(BROWSER_USE_IAB_API_PING_ANCHOR_PATTERN);
    if (!apiClassMatch?.groups) {
      throw new Error(errorMessage);
    }
    const classIndex = updated.indexOf(`${apiClassMatch.groups.className}=class{`);
    const varIndex = updated.lastIndexOf('var ', classIndex);
    const statementIndex = updated.lastIndexOf(';', classIndex);
    const helperInsertionIndex = varIndex > statementIndex ? varIndex : classIndex;
    updated =
      updated.slice(0, helperInsertionIndex) +
      buildLinuxBrowserUseHostFetchHelper(browserUseContext) +
      updated.slice(helperInsertionIndex);
  }
  updated = replaceRegexOrThrow(
    updated,
    BROWSER_USE_IAB_API_PING_ANCHOR_PATTERN,
    ({ className, fields }) =>
      `${className}=class{${fields}async nodeReplFetch(e){let t=codexLinuxBrowserUseHostFetchSession(e);this.requireBrowserUseSession(t);let n=this.options.hostFetch;if(typeof n!==\`function\`)throw Error(\`Browser Use policy fetch requires an authenticated desktop host fetch bridge, but this desktop build does not support nodeRepl/fetch.\`);return await n(e)}async nodeReplCreateElicitation(e){let t=codexLinuxBrowserUseElicitationSession(e);this.requireBrowserUseSession(t);return await codexLinuxBrowserUseCreateElicitation(e?.elicitation)}ping(){return\`pong\`}`,
    errorMessage
  );
  updated = replaceFirstMatchingRegexOrThrow(
    updated,
    [
      {
        pattern: BROWSER_USE_IAB_REGISTRY_OPTIONS_PATTERN,
        replacement: ({ className, getHostArg, blockedArg, options: iabOptions }) =>
          `new ${className}(${getHostArg},${blockedArg},{${iabOptions},hostFetch:e=>codexLinuxBrowserUseHostFetch(e,this.options.appServerConnection)})`
      },
      {
        pattern: BROWSER_USE_IAB_REGISTRY_OPTIONS_26_527_PATTERN,
        replacement: ({ className, getHostArg, blockedArg, options: iabOptions }) =>
          `new ${className}(${getHostArg},${blockedArg},{${iabOptions},hostFetch:e=>codexLinuxBrowserUseHostFetch(e,this.options.appServerConnection)})`
      },
      {
        pattern: BROWSER_USE_IAB_REGISTRY_OPTIONS_26_616_PATTERN,
        replacement: ({ className, getHostArg, blockedArg, options: iabOptions }) =>
          `new ${className}(${getHostArg},${blockedArg},{${iabOptions},hostFetch:e=>codexLinuxBrowserUseHostFetch(e,this.options.appServerConnection)})`
      }
    ],
    errorMessage
  );
  updated = replaceRegexOrThrow(
    updated,
    BROWSER_SESSION_REGISTRY_INSTANTIATION_PATTERN,
    ({ registryClass, appSessionId, buildFlavor }) =>
      `this.browserSessionRegistry=new ${registryClass}({appSessionId:${appSessionId},buildFlavor:${buildFlavor},errorReporter:this.errorReporter,appServerConnection:()=>this.getAppServerConnection(this.hostId)})`,
    errorMessage
  );
  if (updated.includes(BROWSER_USE_VIEW_MENU_INSERTION_ANCHOR)) {
    updated = updated.replace(
      BROWSER_USE_VIEW_MENU_INSERTION_ANCHOR,
      BROWSER_USE_VIEW_MENU_INSERTION_REPLACEMENT
    );
  }
  return updated;
}

export function applyLinuxBrowserUseRuntimePathsPatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxBrowserUseRuntimePathsPatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxBrowserUseRuntimePathsPatch(bundleSource, options = {}) {
  if (bundleSource.includes(LINUX_BROWSER_USE_RUNTIME_PATHS_PATCH_MARKER)) {
    return bundleSource;
  }

  const errorMessage = buildLinuxBrowserUseRuntimePathsPatchErrorMessage(
    bundleSource,
    options.sourceName
  );
  const runtimeFunctionMatch = bundleSource.match(BROWSER_USE_RUNTIME_PATHS_FUNCTION_PATTERN);
  if (!runtimeFunctionMatch?.groups) {
    throw new Error(errorMessage);
  }
  const resourcesVar = runtimeFunctionMatch.groups.resourcesVar;
  let updated = replaceRegexOrThrow(
    bundleSource,
    BROWSER_USE_RUNTIME_PATHS_FUNCTION_PATTERN,
    (_groups, match) => `${buildLinuxBrowserUseRuntimePathsHelper()}${match[0]}`,
    errorMessage
  );

  updated = replaceRegexOrThrow(
    updated,
    BROWSER_USE_RUNTIME_PATHS_RETURN_PATTERN,
    ({
      codexCliPath,
      codexCliPathSource,
      nodeModuleDirs,
      nodePath,
      nodePathSource,
      nodeReplPath,
      nodeReplPathSource,
      platform
    }) => {
      const selectedVar = 'codexLinuxBrowserUseSelectedRuntimePaths';
      return `let ${selectedVar}=codexLinuxBrowserUseRuntimePaths({resourcesPath:${resourcesVar},platform:${platform},nodeModuleDirs:${nodeModuleDirs},nodePath:${nodePath},nodePathSource:${nodePathSource},nodeReplPath:${nodeReplPath},nodeReplPathSource:${nodeReplPathSource}});return{codexCliPath:${codexCliPath},codexCliPathSource:${codexCliPathSource},nodeModuleDirs:${selectedVar}.nodeModuleDirs,nodePath:${selectedVar}.nodePath,nodePathSource:${selectedVar}.nodePathSource,nodeReplPath:${selectedVar}.nodeReplPath,nodeReplPathSource:${selectedVar}.nodeReplPathSource,platform:${platform}}}`;
    },
    errorMessage
  );

  return updated;
}

export function applyLinuxBundledBrowserChromePluginsPatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxBundledBrowserChromePluginsPatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxBundledBrowserChromePluginsPatch(bundleSource, options = {}) {
  if (bundleSource.includes(LINUX_BUNDLED_BROWSER_CHROME_PLUGINS_PATCH_MARKER)) {
    return bundleSource;
  }

  const errorMessage = buildLinuxBundledBrowserChromePluginsPatchErrorMessage(
    bundleSource,
    options.sourceName
  );
  const contextMatch = bundleSource.match(BUNDLED_PLUGIN_RECONCILER_CONTEXT_PATTERN);
  const selectorMatch = bundleSource.match(BUNDLED_PLUGIN_DESCRIPTOR_SELECTOR_PATTERN);
  if (contextMatch?.groups && selectorMatch?.groups) {
    if (
      contextMatch.groups.envVar !== selectorMatch.groups.envVar ||
      contextMatch.groups.platformVar !== selectorMatch.groups.platformVar
    ) {
      throw new Error(errorMessage);
    }

    let updated = replaceRegexOrThrow(
      bundleSource,
      BUNDLED_PLUGIN_RECONCILER_ANCHOR_PATTERN,
      ({ loggerVar, loggerObject, loggerFactory, devFlagVar, extraDeclarations = '', fn }) =>
        `var ${loggerVar}=${loggerObject}.${loggerFactory}(\`bundled-plugins\`),${devFlagVar}=\`CODEX_ENABLE_DEV_BUNDLED_PLUGINS\`${extraDeclarations};${buildLinuxBundledBrowserChromePluginsHelper()}function ${fn}(e){`,
      errorMessage
    );
    updated = replaceRegexOrThrow(
      updated,
      BUNDLED_PLUGIN_DESCRIPTOR_SELECTOR_PATTERN,
      ({ selectorVar, featuresVar, descriptorsVar, itemVar, envVar, platformVar }) =>
        `${selectorVar}=${featuresVar}=>codexLinuxBundledBrowserChromePlugins({availableDescriptors:${descriptorsVar}.filter(${itemVar}=>${itemVar}.isAvailable({buildFlavor:e.buildFlavor,env:${envVar},features:${featuresVar},platform:${platformVar}})),allDescriptors:${descriptorsVar},resourcesPath:${contextMatch.groups.resourcesVar},platform:${platformVar},targetPluginNames:[\`browser\`,\`chrome\`,\`computer-use\`]})/* ${LINUX_BUNDLED_BROWSER_CHROME_PLUGINS_PATCH_MARKER} */`,
      errorMessage
    );
    return updated;
  }

  const materializerMatch = bundleSource.match(BUNDLED_PLUGIN_MARKETPLACE_FILTER_26_609_PATTERN);
  if (!materializerMatch?.groups) {
    throw new Error(errorMessage);
  }

  const updated = replaceRegexOrThrow(
    bundleSource,
    BUNDLED_PLUGIN_MARKETPLACE_FILTER_26_609_PATTERN,
    ({ fn, marketplaceVar, filterFn, readMarketplaceFn, stagingVar }) =>
      `async function ${fn}(e){${buildLinuxBundledBrowserChromeMarketplaceHelper()}let codexLinuxBundledBrowserChromeAllMarketplace=await ${readMarketplaceFn}(e.sourceMarketplaceRoot),${marketplaceVar}={...codexLinuxBundledBrowserChromeMarketplace({availableMarketplace:${filterFn}({marketplacePluginNames:e.marketplacePluginNames,marketplace:codexLinuxBundledBrowserChromeAllMarketplace}),allMarketplace:codexLinuxBundledBrowserChromeAllMarketplace,sourceMarketplaceRoot:e.sourceMarketplaceRoot,targetPluginNames:[\`browser\`,\`chrome\`,\`computer-use\`]}),name:e.marketplaceName},${stagingVar}=`,
    errorMessage
  );

  return updated;
}

export function applyLinuxChromeNativeHostRuntimePathsPatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxChromeNativeHostRuntimePathsPatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxChromeNativeHostRuntimePathsPatch(bundleSource, options = {}) {
  if (bundleSource.includes(LINUX_CHROME_NATIVE_HOST_RUNTIME_PATHS_PATCH_MARKER)) {
    return bundleSource;
  }

  const errorMessage = buildLinuxChromeNativeHostRuntimePathsPatchErrorMessage(
    bundleSource,
    options.sourceName
  );
  const returnMatch = bundleSource.match(CHROME_NATIVE_HOST_RUNTIME_PATHS_RETURN_26_616_PATTERN);
  if (returnMatch?.groups) {
    const updated = replaceRegexOrThrow(
      bundleSource,
      CHROME_NATIVE_HOST_RUNTIME_PATHS_RETURN_26_616_PATTERN,
      ({ copyCliFn, codexCliVar, arg, nodeVar, nodeModuleDirsFn, nodeReplVar }) =>
        `return codexLinuxChromeNativeHostRuntimePaths({runtimePaths:{codexCliPath:await ${copyCliFn}({codexCliPath:${codexCliVar},codexHome:${arg}.codexHome,nativeHostName:${arg}.nativeHostName}),nodePath:${nodeVar},nodeModuleDirs:${nodeModuleDirsFn}(${arg}.resourcesPath),nodeReplPath:${nodeReplVar}},resourcesPath:${arg}.resourcesPath})`,
      errorMessage
    );
    return `${buildLinuxChromeNativeHostRuntimePathsHelper()}${updated}`;
  }
  return replaceRegexOrThrow(
    bundleSource,
    CHROME_NATIVE_HOST_RUNTIME_PATHS_REGISTRATION_PATTERN,
    ({ fn, arg, targetVar, targetFn, runtimeVar, runtimeFn, hostVar, installFn }) =>
      `${buildLinuxChromeNativeHostRuntimePathsHelper()}async function ${fn}(${arg}){let ${targetVar}=${targetFn}(),${runtimeVar}=codexLinuxChromeNativeHostRuntimePaths({runtimePaths:${runtimeFn}({devRuntimeRepoRoot:${arg}.devRuntimeRepoRoot,nativeHostName:${arg}.nativeHostName,resourcesPath:${arg}.resourcesPath}),resourcesPath:${arg}.resourcesPath}),${hostVar}=await ${installFn}(`,
    errorMessage
  );
}

export function applyLinuxOwlFeatureBindingPatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxOwlFeatureBindingPatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxOwlFeatureBindingPatch(bundleSource, options = {}) {
  if (bundleSource.includes(LINUX_OWL_FEATURE_BINDING_PATCH_MARKER)) {
    return bundleSource;
  }
  return replaceFirstMatchingRegexOrThrow(
    bundleSource,
    [
      {
        pattern: LINUX_OWL_FEATURE_BINDING_PATTERN,
        replacement: ({ helperFn, bindingVar, schemaVar }) =>
          `function ${helperFn}(){/* ${LINUX_OWL_FEATURE_BINDING_PATCH_MARKER} */let ${bindingVar}=process._linkedBinding;if(typeof ${bindingVar}==\`function\`){try{return ${schemaVar}.parse(${bindingVar}.call(process,\`electron_common_owl_features\`))}catch{}}${buildLinuxOwlFeatureSwitchFallback()}}`
      },
      {
        pattern: LINUX_OWL_FEATURE_BINDING_NULLABLE_PATTERN,
        replacement: ({
          bindingVar,
          errorVar,
          featureBindingNameVar,
          helperFn,
          missingBindingFn,
          nativeFeaturesVar,
          schemaVar
        }) =>
          `function ${helperFn}(){/* ${LINUX_OWL_FEATURE_BINDING_PATCH_MARKER} */let ${bindingVar}=process._linkedBinding;if(typeof ${bindingVar}==\`function\`){let ${nativeFeaturesVar};try{${nativeFeaturesVar}=${bindingVar}.call(process,${featureBindingNameVar})}catch(${errorVar}){if(!${missingBindingFn}(${errorVar}))throw ${errorVar}}if(${nativeFeaturesVar}!=null)try{return ${schemaVar}.parse(${nativeFeaturesVar})}catch{}}${buildLinuxOwlFeatureSwitchFallback()}}`
      }
    ],
    buildLinuxOwlFeatureBindingPatchErrorMessage(bundleSource, options.sourceName)
  );
}

function buildLinuxOwlFeatureSwitchFallback() {
  return 'return{isOwlFeatureEnabled:codexLinuxOwlFeatureName=>{let t=nt(rt(`enable-features`)),n=nt(rt(`disable-features`));return t.includes(codexLinuxOwlFeatureName)&&!n.includes(codexLinuxOwlFeatureName)}}';
}

export function applyLinuxChromeExtensionSettingsPatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxChromeExtensionSettingsPatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxChromeExtensionSettingsPatch(bundleSource, options = {}) {
  if (bundleSource.includes(LINUX_CHROME_EXTENSION_SETTINGS_PATCH_MARKER)) {
    return bundleSource;
  }
  const errorMessage = buildLinuxChromeExtensionSettingsPatchErrorMessage(
    bundleSource,
    options.sourceName
  );
  const urlHelperMatch = bundleSource.match(LINUX_CHROME_EXTENSION_URL_HELPER_PATTERN);
  if (!urlHelperMatch?.groups) {
    throw new Error(errorMessage);
  }
  let updated = replaceRegexOrThrow(
    bundleSource,
    LINUX_CHROME_EXTENSION_PROFILE_DIR_PATTERN,
    ({ fn, homeDirVar, localAppDataVar, platformVar, joinCall }) =>
      `function ${fn}({homeDir:${homeDirVar},localAppDataDir:${localAppDataVar},platform:${platformVar}}){return ${platformVar}===\`darwin\`?${joinCall}(${homeDirVar},\`Library\`,\`Application Support\`,\`Google\`,\`Chrome\`):${platformVar}===\`win32\`?${joinCall}(${localAppDataVar}??${joinCall}(${homeDirVar},\`AppData\`,\`Local\`),\`Google\`,\`Chrome\`,\`User Data\`):${platformVar}===\`linux\`?${joinCall}(typeof process.env.XDG_CONFIG_HOME===\`string\`&&process.env.XDG_CONFIG_HOME.trim().length>0?process.env.XDG_CONFIG_HOME:${joinCall}(${homeDirVar},\`.config\`),\`google-chrome\`):null}/* ${LINUX_CHROME_EXTENSION_SETTINGS_PATCH_MARKER} */`,
    errorMessage
  );
  updated = replaceRegexOrThrow(
    updated,
    LINUX_CHROME_EXTENSION_OPEN_SETTINGS_PATTERN,
    ({ fn, extensionIdVar, platformVar, detectVar, defaultDetectVar, runVar, defaultRunVar, body }) =>
      `async function ${fn}({extensionId:${extensionIdVar},platform:${platformVar}=process.platform,detectChromeCommand:${detectVar}=${defaultDetectVar},runCommand:${runVar}=${defaultRunVar}}){${body}if(${platformVar}===\`linux\`){let codexLinuxChromeUrl=${urlHelperMatch.groups.urlFn}(${extensionIdVar}),codexLinuxChromeCommand=codexLinuxDetectChromeCommand()??\`google-chrome-stable\`;return await ${runVar}(codexLinuxChromeCommand,[codexLinuxChromeUrl]),{url:codexLinuxChromeUrl}}throw Error(\`Opening Chrome extension settings is only supported on macOS, Windows, and Linux\`)}function codexLinuxDetectChromeCommand(){let e=typeof process.getBuiltinModule===\`function\`?process.getBuiltinModule(\`node:fs\`):null,t=process.env.PATH??\`\`;for(let n of [\`google-chrome\`,\`google-chrome-stable\`,\`chromium\`])for(let r of t.split(\`:\`)){if(r.trim().length===0)continue;let t=\`${'${'}r}/${'${'}n}\`;try{if(e?.accessSync(t,e.constants.X_OK),e)return t}catch{}}return null}`,
    errorMessage
  );
  return updated;
}

export function applyLinuxRemoteControlPatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxRemoteControlPatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxRemoteControlPatch(bundleSource, options = {}) {
  if (bundleSource.includes(LINUX_REMOTE_CONTROL_PATCH_MARKER)) {
    return bundleSource;
  }
  const errorMessage = buildLinuxRemoteControlPatchErrorMessage(bundleSource, options.sourceName);
  return replaceFirstMatchingRegexOrThrow(
    bundleSource,
    [
      {
        pattern: LINUX_REMOTE_CONTROL_FEATURE_AVAILABILITY_PATTERN,
        replacement: ({ fnName, featuresVar, envVar, platformVar }) =>
          `function ${fnName}(${featuresVar},{env:${envVar}=process.env,platform:${platformVar}=process.platform}={}){let codexLinuxRemoteControlFeatures=${platformVar}===\`linux\`&&${envVar}.CODEX_DESKTOP_DISABLE_LINUX_REMOTE_CONTROL_PATCH!==\`1\`?{...${featuresVar},control:!0,computerUse:!0,computerUseNodeRepl:!0}:${featuresVar};return ${platformVar}!==\`win32\`||${envVar}.CODEX_ELECTRON_ENABLE_WINDOWS_COMPUTER_USE!==\`1\`?codexLinuxRemoteControlFeatures:{...codexLinuxRemoteControlFeatures,computerUse:!0,computerUseNodeRepl:!0}}/* ${LINUX_REMOTE_CONTROL_PATCH_MARKER} */`
      },
      {
        pattern: LINUX_REMOTE_CONTROL_FEATURE_AVAILABILITY_WITH_OVERRIDES_PATTERN,
        replacement: ({
          fnName,
          featuresVar,
          buildFlavorVar,
          buildFlavorDefault,
          envVar,
          envDefault,
          platformVar,
          platformDefault,
          computedVar,
          overridesVar,
          overrideExpr
        }) =>
          `function ${fnName}(${featuresVar},{buildFlavor:${buildFlavorVar}=${buildFlavorDefault},env:${envVar}=${envDefault},platform:${platformVar}=${platformDefault}}={}){let codexLinuxRemoteControlFeatures=${platformVar}===\`linux\`&&${envVar}.CODEX_DESKTOP_DISABLE_LINUX_REMOTE_CONTROL_PATCH!==\`1\`?{...${featuresVar},control:!0,computerUse:!0,computerUseNodeRepl:!0}:${featuresVar},${computedVar}=${platformVar}===\`win32\`&&${envVar}.CODEX_ELECTRON_ENABLE_WINDOWS_COMPUTER_USE===\`1\`?{...codexLinuxRemoteControlFeatures,computerUse:!0,computerUseNodeRepl:!0}:codexLinuxRemoteControlFeatures,${overridesVar}=${overrideExpr};return ${overridesVar}==null?${computedVar}:{...${computedVar},...${overridesVar}}}/* ${LINUX_REMOTE_CONTROL_PATCH_MARKER} */`
      },
      {
        pattern: LINUX_REMOTE_CONTROL_FEATURE_AVAILABILITY_WITH_DEVICE_ATTESTATION_PATTERN,
        replacement: ({
          fnName,
          featuresVar,
          buildFlavorVar,
          buildFlavorDefault,
          envVar,
          envDefault,
          platformVar,
          platformDefault,
          computedVar,
          overridesVar,
          overrideExpr,
          deviceFn
        }) =>
          `function ${fnName}(${featuresVar},{buildFlavor:${buildFlavorVar}=${buildFlavorDefault},env:${envVar}=${envDefault},platform:${platformVar}=${platformDefault}}={}){let codexLinuxRemoteControlFeatures=${platformVar}===\`linux\`&&${envVar}.CODEX_DESKTOP_DISABLE_LINUX_REMOTE_CONTROL_PATCH!==\`1\`?{...${featuresVar},control:!0,computerUse:!0,computerUseNodeRepl:!0}:${featuresVar},${computedVar}=${platformVar}===\`win32\`&&${envVar}.CODEX_ELECTRON_ENABLE_WINDOWS_COMPUTER_USE===\`1\`?{...codexLinuxRemoteControlFeatures,computerUse:!0,computerUseNodeRepl:!0}:codexLinuxRemoteControlFeatures,${overridesVar}=${overrideExpr};return ${overridesVar}==null?{...${computedVar},deviceAttestation:${deviceFn}({platform:${platformVar}})}:{...${computedVar},...${overridesVar},deviceAttestation:${deviceFn}({platform:${platformVar}})}}/* ${LINUX_REMOTE_CONTROL_PATCH_MARKER} */`
      },
      {
        pattern: LINUX_REMOTE_CONTROL_FEATURE_AVAILABILITY_WITH_MAC_NODE_REPL_PATTERN,
        replacement: ({
          fnName,
          featuresVar,
          buildFlavorVar,
          buildFlavorDefault,
          envVar,
          envDefault,
          platformVar,
          platformDefault,
          macVar,
          internalFn,
          windowsNodeReplVar,
          computedVar,
          overridesVar,
          overrideExpr,
          deviceFn
        }) =>
          `function ${fnName}(${featuresVar},{buildFlavor:${buildFlavorVar}=${buildFlavorDefault},env:${envVar}=${envDefault},platform:${platformVar}=${platformDefault}}={}){let codexLinuxRemoteControlFeatures=${platformVar}===\`linux\`&&${envVar}.CODEX_DESKTOP_DISABLE_LINUX_REMOTE_CONTROL_PATCH!==\`1\`?{...${featuresVar},control:!0,computerUse:!0,computerUseNodeRepl:!0}:${featuresVar},${macVar}=${platformVar}===\`darwin\`&&!${internalFn}(${buildFlavorVar})&&codexLinuxRemoteControlFeatures.computerUseNodeRepl!=null?{...codexLinuxRemoteControlFeatures,computerUseNodeRepl:!1}:codexLinuxRemoteControlFeatures,${windowsNodeReplVar}=${platformVar}===\`win32\`&&codexLinuxRemoteControlFeatures.computerUse===!0?{...${macVar},computerUseNodeRepl:!0}:${macVar},${computedVar}=${platformVar}===\`win32\`&&${envVar}.CODEX_ELECTRON_ENABLE_WINDOWS_COMPUTER_USE===\`1\`?{...${windowsNodeReplVar},computerUse:!0,computerUseNodeRepl:!0}:${windowsNodeReplVar},${overridesVar}=${overrideExpr};return ${overridesVar}==null?{...${computedVar},deviceAttestation:${deviceFn}({platform:${platformVar}})}:{...${computedVar},...${overridesVar},deviceAttestation:${deviceFn}({platform:${platformVar}})}}/* ${LINUX_REMOTE_CONTROL_PATCH_MARKER} */`
      }
    ],
    errorMessage
  );
}

export function applyLinuxRemoteControlVisibilityPatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxRemoteControlVisibilityPatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxRemoteControlVisibilityPatch(bundleSource, options = {}) {
  if (bundleSource.includes(LINUX_REMOTE_CONTROL_VISIBILITY_PATCH_MARKER)) {
    return bundleSource;
  }
  const errorMessage = buildLinuxRemoteControlVisibilityPatchErrorMessage(
    bundleSource,
    options.sourceName
  );
  return replaceRegexOrThrow(
    bundleSource,
    LINUX_REMOTE_CONTROL_VISIBILITY_PATTERN,
    ({ fnName, stateVar, flagVar }) =>
      `function codexLinuxRemoteControlSettingsVisible(){try{return document?.documentElement?.dataset?.codexOs===\`linux\`&&(typeof process===\`undefined\`||process?.env?.CODEX_DESKTOP_DISABLE_LINUX_REMOTE_CONTROL_VISIBILITY_PATCH!==\`1\`)}catch{return!1}}function ${fnName}({remoteControlConnectionsState:${stateVar},slingshotEnabled:${flagVar}}){return codexLinuxRemoteControlSettingsVisible()||${flagVar}&&(${stateVar}?.available??!0)&&${stateVar}?.accessRequired!==!0}/* ${LINUX_REMOTE_CONTROL_VISIBILITY_PATCH_MARKER} */`,
    errorMessage
  );
}

export function applyLinuxComputerUseUiPatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxComputerUseUiPatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxComputerUseUiPatch(bundleSource, options = {}) {
  if (bundleSource.includes(LINUX_COMPUTER_USE_UI_PATCH_MARKER)) {
    return bundleSource;
  }
  if (
    !bundleSource.includes('featureName:`computer_use`') &&
    !bundleSource.includes('windows_computer_use') &&
    !bundleSource.includes('isComputerUseGateEnabled')
  ) {
    throw new Error(buildLinuxComputerUseUiPatchErrorMessage(bundleSource, options.sourceName));
  }

  const availabilityMatch = bundleSource.match(LINUX_COMPUTER_USE_UI_AVAILABILITY_CALL_PATTERN);
  if (!availabilityMatch?.groups) {
    throw new Error(buildLinuxComputerUseUiPatchErrorMessage(bundleSource, options.sourceName));
  }

  let patchedPlatformPredicate = false;
  let updated = bundleSource.replace(
    LINUX_COMPUTER_USE_UI_HOST_PLATFORM_PATTERN,
    (match, fnName, platformVar, offset) => {
      const before = bundleSource.slice(Math.max(0, offset - 1600), offset);
      const after = bundleSource.slice(offset, Math.min(bundleSource.length, offset + 2400));
      if (
        !before.includes('featureName:`computer_use`') &&
        !after.includes('isComputerUseGateEnabled') &&
        !after.includes('featureName:`computer_use`')
      ) {
        return match;
      }
      patchedPlatformPredicate = true;
      return `function ${fnName}(${platformVar}){return ${platformVar}===\`macOS\`||${platformVar}===\`windows\`||${platformVar}===\`linux\`}`;
    }
  );

  updated = replaceRegexOrThrow(
    updated,
    LINUX_COMPUTER_USE_UI_AVAILABILITY_CALL_PATTERN,
    ({
      assignmentVar,
      availabilityFn,
      requiredVar,
      enabledVar,
      loadingVar,
      gateVar,
      platformFn,
      platformVar,
      platformLoadingVar
    }) =>
      `${assignmentVar}=${availabilityFn}({areRequiredFeaturesEnabled:${platformVar}===\`linux\`||${requiredVar},enabled:${enabledVar},isAnyFeatureLoading:${platformVar}===\`linux\`?!1:${loadingVar},isComputerUseGateEnabled:${platformVar}===\`linux\`||${gateVar},isHostCompatiblePlatform:${platformVar}===\`linux\`||${platformFn}(${platformVar}),isPlatformLoading:${platformLoadingVar},windowType:\`electron\`})/* ${LINUX_COMPUTER_USE_UI_PATCH_MARKER} */`,
    buildLinuxComputerUseUiPatchErrorMessage(bundleSource, options.sourceName)
  );

  if (!patchedPlatformPredicate && !updated.includes('===`linux`||')) {
    throw new Error(buildLinuxComputerUseUiPatchErrorMessage(bundleSource, options.sourceName));
  }

  return updated;
}

export function applyLinuxPowerSaveBlockerPatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxPowerSaveBlockerPatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxPowerSaveBlockerPatch(bundleSource, options = {}) {
  if (bundleSource.includes(LINUX_POWER_SAVE_BLOCKER_PATCH_MARKER)) {
    return bundleSource;
  }
  const errorMessage = buildLinuxPowerSaveBlockerPatchErrorMessage(
    bundleSource,
    options.sourceName
  );
  return replaceRegexOrThrow(
    bundleSource,
    LINUX_POWER_SAVE_BLOCKER_SYNC_PATTERN,
    ({ activeVar, electronVar }) =>
      `${buildLinuxSystemSleepInhibitorMethods()}syncPowerSaveBlocker(){let ${activeVar}=this.powerSaveBlockingWebContentsIds.size>0||!${electronVar}.powerMonitor.isOnBatteryPower()&&this.pluggedInRemoteControlPowerSaveWebContentsIds.size>0;this.codexLinuxSyncSystemSleepInhibitor(${activeVar});if(${activeVar}&&this.powerSaveBlockerId==null){this.powerSaveBlockerId=${electronVar}.powerSaveBlocker.start(\`prevent-app-suspension\`);return}!${activeVar}&&this.powerSaveBlockerId!=null&&(${electronVar}.powerSaveBlocker.stop(this.powerSaveBlockerId),this.powerSaveBlockerId=null)}`,
    errorMessage
  );
}

export function applyLinuxRemoteControlKeepAwakePatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxRemoteControlKeepAwakePatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxRemoteControlKeepAwakePatch(bundleSource, options = {}) {
  if (bundleSource.includes(LINUX_REMOTE_CONTROL_KEEP_AWAKE_PATCH_MARKER)) {
    return bundleSource;
  }
  if (
    bundleSource.includes('preventSleepWhileRunning') &&
    bundleSource.includes('keepRemoteControlAwakeWhilePluggedIn') &&
    LINUX_REMOTE_CONTROL_KEEP_AWAKE_CURRENT_DISPATCH_PATTERN.test(bundleSource)
  ) {
    return bundleSource;
  }
  const errorMessage = buildLinuxRemoteControlKeepAwakePatchErrorMessage(
    bundleSource,
    options.sourceName
  );
  return replaceRegexOrThrow(
    bundleSource,
    LINUX_REMOTE_CONTROL_KEEP_AWAKE_DISPATCH_PATTERN,
    ({ prefix, preventVar, keepVar, enabledVar }) =>
      `${prefix}!!(${keepVar}||${preventVar})&&${enabledVar}/* ${LINUX_REMOTE_CONTROL_KEEP_AWAKE_PATCH_MARKER} */`,
    errorMessage
  );
}

export function applyLinuxPetYappingUsageMainPatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxPetYappingUsageMainPatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxPetYappingUsageMainPatch(bundleSource, options = {}) {
  if (bundleSource.includes(LINUX_PET_YAPPING_USAGE_MAIN_PATCH_MARKER)) {
    return bundleSource;
  }
  const errorMessage = buildLinuxPetYappingUsageMainPatchErrorMessage(
    bundleSource,
    options.sourceName
  );
  return replaceRegexOrThrow(
    bundleSource,
    LINUX_PET_YAPPING_USAGE_MAIN_HANDLER_PATTERN,
    ({ anchor }) => `${anchor}${buildLinuxPetYappingUsageMainHandler()}`,
    errorMessage
  );
}

export function applyLinuxAvatarOverlayPatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxAvatarOverlayPatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxAvatarOverlayPatch(bundleSource, options = {}) {
  const errorMessage = buildLinuxAvatarOverlayPatchErrorMessage(bundleSource, options.sourceName);
  const electronVar = bundleSource.match(BROWSER_USE_ELECTRON_REQUIRE_PATTERN)?.groups?.electronVar ?? 'n';
  let updated = bundleSource;

  if (LINUX_AVATAR_OVERLAY_DOCK_WINDOW_OPTIONS_PATTERN.test(updated)) {
    updated = replaceRegexOrThrow(
      updated,
      LINUX_AVATAR_OVERLAY_DOCK_WINDOW_OPTIONS_PATTERN,
      ({ optionsFn, platformVar }) =>
        `case\`avatarOverlay\`:return{...${optionsFn}({alwaysOnTop:!0,platform:${platformVar},resizable:!1,thickFrame:!1}),hasShadow:!1}`,
      errorMessage
    );
  }

  if (!updated.includes(LINUX_AVATAR_OVERLAY_PATCH_MARKER)) {
    updated = replaceRegexOrThrow(
      updated,
      LINUX_AVATAR_OVERLAY_CREATE_FRONTMOST_PATTERN,
      ({ windowVar }) =>
        `this.codexLinuxKeepAvatarOverlayFrontmost(${windowVar},!0),${windowVar}.setMenuBarVisibility(!1),this.codexLinuxRegisterAvatarOverlayAutoClose(${windowVar})`,
      errorMessage
    );
    updated = replaceRegexOrThrow(
      updated,
      LINUX_AVATAR_OVERLAY_CREATE_WINDOW_END_PATTERN,
      ({ windowVar, positionArgs }) =>
        `}),${windowVar}}${buildLinuxAvatarOverlayFrontmostMethod({ electronVar })}positionWindow(${positionArgs}){`,
      errorMessage
    );
    updated = replaceFirstMatchingRegexOrThrow(
      updated,
      [
        {
          pattern: LINUX_AVATAR_OVERLAY_OPEN_METHOD_PATTERN,
          replacement: ({ openerVar, windowVar, ensureWindowArg = '', openStateVar }) =>
            `async open(${openerVar}){let ${windowVar}=await this.ensureWindow(${ensureWindowArg});this.globalState.set(${openStateVar},!0),this.positionWindow(${windowVar},${openerVar}),this.rendererReady?(this.showWindow(${windowVar}),this.applyPointerInteractivityPolicy()):this.codexLinuxScheduleAvatarOverlayVisibilityRecovery(${windowVar})}`
        },
        {
          pattern: LINUX_AVATAR_OVERLAY_OPEN_METHOD_26_608_PATTERN,
          replacement: ({ openerVar, windowVar, ensureWindowArg = '', openStateVar }) =>
            `async open(${openerVar}){let ${windowVar}=await this.ensureWindow(${ensureWindowArg});this.globalState.set(${openStateVar},!0),this.positionWindow(${windowVar},${openerVar}),this.showWindowIfReady(${windowVar}),this.codexLinuxScheduleAvatarOverlayVisibilityRecovery(${windowVar})}`
        },
        {
          pattern: LINUX_AVATAR_OVERLAY_OPEN_METHOD_26_616_PATTERN,
          replacement: ({
            openerVar,
            forcePetViewVar,
            windowVar,
            ensureWindowArg = '',
            openStateExpr,
            nativePresentationExpr
          }) =>
            `async open(${openerVar},{forcePetView:${forcePetViewVar}=!1}={}){let ${windowVar}=await this.ensureWindow(${ensureWindowArg});this.globalState.set(${openStateExpr},!0),this.windowOpenIntent=!0,this.positionWindow(${windowVar},${openerVar}),${nativePresentationExpr}this.showWindowIfReady(${windowVar}),this.codexLinuxScheduleAvatarOverlayVisibilityRecovery(${windowVar}),${forcePetViewVar}&&this.windowManager.sendMessageToWebContents(${windowVar}.webContents,{type:\`avatar-overlay-explicit-pet-opened\`})}`
        },
        {
          pattern: LINUX_AVATAR_OVERLAY_OPEN_METHOD_26_623_PATTERN,
          replacement: ({
            openerVar,
            forcePetViewVar,
            persistIntentVar,
            openStateExpr,
            sequenceVar,
            windowVar,
            ensureWindowArg = ''
          }) =>
            `async open(${openerVar},{forcePetView:${forcePetViewVar}=!1,persistPetIntent:${persistIntentVar}=!0}={}){${persistIntentVar}&&(this.globalState.set(${openStateExpr},!0),this.petOpenIntent=!0);let ${sequenceVar}=++this.windowVisibilitySequence,${windowVar}=await this.ensureWindow(${ensureWindowArg});${sequenceVar}===this.windowVisibilitySequence&&(this.positionWindow(${windowVar},${openerVar}),this.pendingPresentation!=null&&(this.pendingPresentation.target={...this.anchor},this.positionPresentationAtOrigin(${windowVar},this.pendingPresentation.origin)),this.presentWindow(${windowVar}),this.codexLinuxScheduleAvatarOverlayVisibilityRecovery(${windowVar}),${forcePetViewVar}&&this.windowManager.sendMessageToWebContents(${windowVar}.webContents,{type:\`avatar-overlay-explicit-pet-opened\`}))}`
        }
      ],
      errorMessage
    );
    updated = replaceRegexOrThrow(
      updated,
      LINUX_AVATAR_OVERLAY_SHOW_WINDOW_PATTERN,
      ({ windowVar, wasOpenVar, revealExpr, openStateExpr, postOpenExpr }) =>
        buildLinuxAvatarOverlayShowWindowMethod({
          windowVar,
          wasOpenVar,
          revealExpr: revealExpr ?? '',
          openStateExpr,
          postOpenExpr: postOpenExpr ?? ''
        }),
      errorMessage
    );
    updated = replaceFirstMatchingRegexOrThrow(
      updated,
      [
        {
          pattern: LINUX_AVATAR_OVERLAY_SET_WINDOW_BOUNDS_NATIVE_COMPOSITION_26_611_PATTERN,
          replacement: ({
            windowVar,
            boundsVar,
            animateVar,
            nativeMoveVar,
            currentBoundsVar,
            equalFn,
            positionControllerVar,
            sameSizeVar
          }) =>
            `setWindowBounds(${windowVar},${boundsVar},${animateVar},${nativeMoveVar}){if(${windowVar}.isDestroyed())return;let ${currentBoundsVar}=${windowVar}.getContentBounds();if(${equalFn}(${currentBoundsVar},${boundsVar})){this.${positionControllerVar}.position(${windowVar},${boundsVar}),this.codexLinuxKeepAvatarOverlayFrontmost(${windowVar});return}let ${sameSizeVar}=${currentBoundsVar}.width===${boundsVar}.width&&${currentBoundsVar}.height===${boundsVar}.height;${sameSizeVar}&&!${nativeMoveVar}&&this.compositionHost.prepareDragFollowForOverlayMove(${boundsVar}),${windowVar}.setContentBounds(${boundsVar},${animateVar}&&!this.nativeCompositionSupported),this.${positionControllerVar}.position(${windowVar},${boundsVar}),(${nativeMoveVar}||!${sameSizeVar})&&this.compositionHost.moveBackingCanvases(),this.codexLinuxKeepAvatarOverlayFrontmost(${windowVar})}`
        },
        {
          pattern: LINUX_AVATAR_OVERLAY_SET_WINDOW_BOUNDS_PATTERN,
          replacement: ({ windowVar, boundsVar, animateVar, equalFn, getBoundsMethod, setBoundsMethod }) => {
            const animateArg = animateVar ?? '!1';
            const applyBounds =
              setBoundsMethod === 'setBounds'
                ? `codexLinuxAvatarOverlayBounds.width===${boundsVar}.width&&codexLinuxAvatarOverlayBounds.height===${boundsVar}.height?${windowVar}.setPosition(${boundsVar}.x,${boundsVar}.y,${animateArg}):${windowVar}.setBounds(${boundsVar},${animateArg})`
                : `${windowVar}.${setBoundsMethod}(${boundsVar},${animateArg})`;
            return `setWindowBounds(${windowVar},${boundsVar}${animateVar ? `,${animateVar}` : ''}){if(${windowVar}.isDestroyed())return;let codexLinuxAvatarOverlayBounds=${windowVar}.${getBoundsMethod}();${equalFn}(codexLinuxAvatarOverlayBounds,${boundsVar})||(${applyBounds}),this.codexLinuxKeepAvatarOverlayFrontmost(${windowVar})}`;
          }
        },
        {
          pattern: LINUX_AVATAR_OVERLAY_SET_WINDOW_BOUNDS_NATIVE_COMPOSITION_PATTERN,
          replacement: ({
            windowVar,
            boundsVar,
            animateVar,
            nativeMoveVar,
            currentBoundsVar,
            equalFn,
            sameSizeVar
          }) =>
            `setWindowBounds(${windowVar},${boundsVar},${animateVar},${nativeMoveVar}){if(${windowVar}.isDestroyed())return;let ${currentBoundsVar}=${windowVar}.getContentBounds();if(${equalFn}(${currentBoundsVar},${boundsVar}))return;let ${sameSizeVar}=${currentBoundsVar}.width===${boundsVar}.width&&${currentBoundsVar}.height===${boundsVar}.height;${sameSizeVar}&&!${nativeMoveVar}&&this.compositionHost.prepareDragFollowForOverlayMove(${boundsVar}),${windowVar}.setContentBounds(${boundsVar},${animateVar}),(${nativeMoveVar}||!${sameSizeVar})&&this.compositionHost.moveBackingCanvases(),this.codexLinuxKeepAvatarOverlayFrontmost(${windowVar})}`
        }
      ],
      errorMessage
    );
    updated = replaceRegexOrThrow(
      updated,
      LINUX_AVATAR_OVERLAY_POINTER_POLICY_PATTERN,
      ({ windowVar, passthroughVar }) =>
        `applyPointerInteractivityPolicy(){let ${windowVar}=this.window;if(${windowVar}==null||${windowVar}.isDestroyed()){this.mousePassthroughEnabled=!1;return}if(process.platform===\`linux\`&&process?.env?.CODEX_DESKTOP_DISABLE_LINUX_AVATAR_OVERLAY_PATCH!==\`1\`){this.mousePassthroughEnabled=!1,${windowVar}.setIgnoreMouseEvents(!1),this.refreshCursorAtCurrentMousePosition(${windowVar});return}let ${passthroughVar}=!this.pointerInteractive;if(this.mousePassthroughEnabled!==${passthroughVar}){if(this.mousePassthroughEnabled=${passthroughVar},${passthroughVar}){${windowVar}.setIgnoreMouseEvents(!0,{forward:!0});return}${windowVar}.setIgnoreMouseEvents(!1),this.refreshCursorAtCurrentMousePosition(${windowVar})}}`,
      errorMessage
    );
  }

  if (!updated.includes(LINUX_AVATAR_OVERLAY_DRAG_COORDS_PATCH_MARKER)) {
    updated = injectLinuxAvatarOverlayDragCoordsPatch(updated, errorMessage);
  }
  return updated;
}

function injectLinuxAvatarOverlayDragCoordsPatch(bundleSource, errorMessage) {
  let updated = replaceFirstMatchingRegexOrThrow(
    bundleSource,
    [
      {
        pattern: LINUX_AVATAR_OVERLAY_DRAG_MOVE_IPC_PATTERN,
        replacement: ({ webContentsId }) =>
          `case\`avatar-overlay-drag-move\`:/* ${LINUX_AVATAR_OVERLAY_DRAG_COORDS_PATCH_MARKER} */this.avatarOverlayManager.moveDrag(${webContentsId},i);break;`
      },
      {
        pattern: LINUX_AVATAR_OVERLAY_DRAG_MOVE_IPC_26_611_PATTERN,
        replacement: ({ pointVar, pointFn, messageVar, managerExpr, webContentsId }) =>
          `case\`avatar-overlay-drag-move\`:{let ${pointVar}=${pointFn}(${messageVar});/* ${LINUX_AVATAR_OVERLAY_DRAG_COORDS_PATCH_MARKER} */${pointVar}?${managerExpr}.moveDrag(${webContentsId},${pointVar}):${managerExpr}.moveDrag(${webContentsId},${messageVar});return}`
      }
    ],
    errorMessage
  );
  updated = replaceFirstMatchingRegexOrThrow(
    updated,
    [
      {
        pattern: LINUX_AVATAR_OVERLAY_START_DRAG_PATTERN,
        replacement: ({
          webContentsIdVar,
          pointerXVar,
          pointerYVar,
          windowVar,
          clearDetachedCall,
          layoutVar,
          electronVar
        }) =>
          `startDrag(${webContentsIdVar},{pointerWindowX:${pointerXVar},pointerWindowY:${pointerYVar}}){let ${windowVar}=this.window;if(${windowVar}==null||${windowVar}.isDestroyed()||${windowVar}.webContents.id!==${webContentsIdVar})return;this.cancelMomentum()${clearDetachedCall ?? ''};let ${layoutVar}=this.getLayout(${windowVar});this.dragState={pointerAnchorX:${pointerXVar}-${layoutVar}.mascot.left,pointerAnchorY:${pointerYVar}-${layoutVar}.mascot.top,pointerWindowX:${pointerXVar},pointerWindowY:${pointerYVar},mascotLeft:${layoutVar}.mascot.left,mascotTop:${layoutVar}.mascot.top,hasMoved:!1,displayBounds:${electronVar}.screen.getDisplayNearestPoint(${electronVar}.screen.getCursorScreenPoint()).bounds}}`
      },
      {
        pattern: LINUX_AVATAR_OVERLAY_START_DRAG_26_611_PATTERN,
        replacement: (_groups, match) => match[0]
      },
      {
        pattern: LINUX_AVATAR_OVERLAY_START_DRAG_26_623_PATTERN,
        replacement: (_groups, match) => match[0]
      }
    ],
    errorMessage
  );
  updated = replaceFirstMatchingRegexOrThrow(
    updated,
    [
      {
        pattern: LINUX_AVATAR_OVERLAY_MOVE_DRAG_METHOD_PATTERN,
        replacement: ({ webContentsIdVar, windowVar }) =>
          `moveDrag(${webContentsIdVar},codexLinuxAvatarOverlayPoint){let ${windowVar}=this.window;${windowVar}==null||${windowVar}.isDestroyed()||${windowVar}.webContents.id!==${webContentsIdVar}||this.dragState==null||(this.cancelMomentum(),this.dragState.hasMoved=!0,this.moveDragToCurrentCursor(${windowVar},this.codexLinuxAvatarOverlayScreenPoint(codexLinuxAvatarOverlayPoint)))}codexLinuxAvatarOverlayScreenPoint(e){return e!=null&&Number.isFinite(e.cursorScreenX)&&Number.isFinite(e.cursorScreenY)?{x:e.cursorScreenX,y:e.cursorScreenY}:null}endDrag`
      },
      {
        pattern: LINUX_AVATAR_OVERLAY_MOVE_DRAG_METHOD_26_611_PATTERN,
        replacement: ({
          webContentsIdVar,
          pointVar,
          windowVar,
          dragStateVar,
          cursorVar,
          electronVar,
          nextPointVar,
          coercePointFn
        }) =>
          `moveDrag(${webContentsIdVar},${pointVar}){let ${windowVar}=this.window;if(${windowVar}==null||${windowVar}.isDestroyed()||${windowVar}.webContents.id!==${webContentsIdVar}||this.dragState==null)return;this.cancelMomentum();let ${dragStateVar}=this.dragState;${dragStateVar}.recordMovementIntent();let ${cursorVar}=${electronVar}.screen.getCursorScreenPoint(),${nextPointVar}=${dragStateVar}.getCursorPointForSource({native:${dragStateVar}.cursorSource===\`native\`?${coercePointFn}(this.compositionHost.getCursorPosition()):null,renderer:this.codexLinuxAvatarOverlayScreenPoint(${pointVar})??{x:${pointVar}?.pointerScreenX??${cursorVar}.x,y:${pointVar}?.pointerScreenY??${cursorVar}.y}});${nextPointVar}!=null&&this.moveDragToPointer(${windowVar},${nextPointVar})}codexLinuxAvatarOverlayScreenPoint(e){return e!=null&&Number.isFinite(e.pointerScreenX)&&Number.isFinite(e.pointerScreenY)?{x:e.pointerScreenX,y:e.pointerScreenY}:e!=null&&Number.isFinite(e.cursorScreenX)&&Number.isFinite(e.cursorScreenY)?{x:e.cursorScreenX,y:e.cursorScreenY}:null}`
      },
      {
        pattern: LINUX_AVATAR_OVERLAY_MOVE_DRAG_METHOD_26_623_PATTERN,
        replacement: ({
          webContentsIdVar,
          pointVar,
          windowVar,
          dragStateVar,
          cursorVar,
          electronVar,
          nextPointVar,
          coercePointFn
        }) =>
          `moveDrag(${webContentsIdVar},${pointVar}){let ${windowVar}=this.window;if(${windowVar}==null||${windowVar}.isDestroyed()||${windowVar}.webContents.id!==${webContentsIdVar}||this.dragState==null)return;this.cancelMomentum();let ${dragStateVar}=this.dragState;${dragStateVar}.recordMovementIntent();let ${cursorVar}=${electronVar}.screen.getCursorScreenPoint(),${nextPointVar}=${dragStateVar}.getCursorPointForSource({native:${dragStateVar}.cursorSource===\`native\`?${coercePointFn}(this.compositionHost.getCursorPosition()):null,renderer:this.codexLinuxAvatarOverlayScreenPoint(${pointVar})??{x:${pointVar}?.pointerScreenX??${cursorVar}.x,y:${pointVar}?.pointerScreenY??${cursorVar}.y}});${nextPointVar}!=null&&(${dragStateVar}.usesOrbPhysics?(this.orbDragFollowTarget=${nextPointVar},this.scheduleOrbDragFollow(${windowVar})):this.moveDragToPointer(${windowVar},${nextPointVar}))}codexLinuxAvatarOverlayScreenPoint(e){return e!=null&&Number.isFinite(e.pointerScreenX)&&Number.isFinite(e.pointerScreenY)?{x:e.pointerScreenX,y:e.pointerScreenY}:e!=null&&Number.isFinite(e.cursorScreenX)&&Number.isFinite(e.cursorScreenY)?{x:e.cursorScreenX,y:e.cursorScreenY}:null}`
      }
    ],
    errorMessage
  );
  updated = replaceFirstMatchingRegexOrThrow(
    updated,
    [
      {
        pattern: LINUX_AVATAR_OVERLAY_MOVE_DRAG_CURSOR_PATTERN,
        replacement: ({ windowVar, dragStateVar, cursorVar }) =>
          `moveDragToCurrentCursor(${windowVar},codexLinuxAvatarOverlayPoint){let ${dragStateVar}=this.dragState;if(${dragStateVar}==null)return;let ${cursorVar}=codexLinuxAvatarOverlayPoint??n.screen.getCursorScreenPoint(),codexLinuxAvatarOverlayBounds=${windowVar}.getBounds(),codexLinuxAvatarOverlayNext={x:Math.round(${cursorVar}.x-${dragStateVar}.pointerWindowX),y:Math.round(${cursorVar}.y-${dragStateVar}.pointerWindowY),width:codexLinuxAvatarOverlayBounds.width,height:codexLinuxAvatarOverlayBounds.height};${dragStateVar}.lastScreenPoint=${cursorVar},this.anchor={...this.anchor,x:codexLinuxAvatarOverlayNext.x+${dragStateVar}.mascotLeft,y:codexLinuxAvatarOverlayNext.y+${dragStateVar}.mascotTop,width:this.mascotSize.width,height:this.mascotSize.height};let codexLinuxAvatarOverlayDisplay=n.screen.getDisplayNearestPoint({x:this.anchor.x,y:this.anchor.y});this.displayId=codexLinuxAvatarOverlayDisplay.id,this.displayBounds=codexLinuxAvatarOverlayDisplay.bounds,${dragStateVar}.display=codexLinuxAvatarOverlayDisplay,${dragStateVar}.displayBounds=codexLinuxAvatarOverlayDisplay.bounds,this.layout={...this.getLayout(${windowVar}),windowBounds:codexLinuxAvatarOverlayNext,mascot:{...this.getLayout(${windowVar}).mascot,left:${dragStateVar}.mascotLeft,top:${dragStateVar}.mascotTop},viewport:{width:codexLinuxAvatarOverlayNext.width,height:codexLinuxAvatarOverlayNext.height}},this.setWindowBounds(${windowVar},codexLinuxAvatarOverlayNext),this.sendLayoutToRenderer(${windowVar})}`
      },
      {
        pattern: LINUX_AVATAR_OVERLAY_MOVE_DRAG_CURSOR_26_527_PATTERN,
        replacement: ({ windowVar, dragStateVar, cursorVar, electronVar }) =>
          `moveDragToCurrentCursor(${windowVar},codexLinuxAvatarOverlayPoint){let ${dragStateVar}=this.dragState;if(${dragStateVar}==null)return;let ${cursorVar}=codexLinuxAvatarOverlayPoint??${electronVar}.screen.getCursorScreenPoint(),codexLinuxAvatarOverlayBounds=${windowVar}.getBounds(),codexLinuxAvatarOverlayNext={x:Math.round(${cursorVar}.x-${dragStateVar}.pointerWindowX),y:Math.round(${cursorVar}.y-${dragStateVar}.pointerWindowY),width:codexLinuxAvatarOverlayBounds.width,height:codexLinuxAvatarOverlayBounds.height};${dragStateVar}.lastScreenPoint=${cursorVar},this.anchor={...this.anchor,x:codexLinuxAvatarOverlayNext.x+${dragStateVar}.mascotLeft,y:codexLinuxAvatarOverlayNext.y+${dragStateVar}.mascotTop,width:this.mascotSize.width,height:this.mascotSize.height};let codexLinuxAvatarOverlayDisplay=${electronVar}.screen.getDisplayNearestPoint({x:this.anchor.x,y:this.anchor.y});this.displayId=codexLinuxAvatarOverlayDisplay.id,this.displayBounds=codexLinuxAvatarOverlayDisplay.bounds,${dragStateVar}.display=codexLinuxAvatarOverlayDisplay,${dragStateVar}.displayBounds=codexLinuxAvatarOverlayDisplay.bounds,this.layout={...this.getLayout(${windowVar}),windowBounds:codexLinuxAvatarOverlayNext,mascot:{...this.getLayout(${windowVar}).mascot,left:${dragStateVar}.mascotLeft,top:${dragStateVar}.mascotTop},viewport:{width:codexLinuxAvatarOverlayNext.width,height:codexLinuxAvatarOverlayNext.height}},this.setWindowBounds(${windowVar},codexLinuxAvatarOverlayNext),this.sendLayoutToRenderer(${windowVar})}`
      },
      {
        pattern: LINUX_AVATAR_OVERLAY_MOVE_DRAG_CURSOR_26_608_PATTERN,
        replacement: ({ windowVar, dragStateVar, cursorVar, electronVar }) =>
          `moveDragToCurrentCursor(${windowVar},codexLinuxAvatarOverlayPoint){let ${dragStateVar}=this.dragState;if(${dragStateVar}==null)return;let ${cursorVar}=codexLinuxAvatarOverlayPoint??${electronVar}.screen.getCursorScreenPoint(),codexLinuxAvatarOverlayBounds=${windowVar}.getContentBounds(),codexLinuxAvatarOverlayNext={x:Math.round(${cursorVar}.x-${dragStateVar}.pointerWindowX),y:Math.round(${cursorVar}.y-${dragStateVar}.pointerWindowY),width:codexLinuxAvatarOverlayBounds.width,height:codexLinuxAvatarOverlayBounds.height};${dragStateVar}.lastScreenPoint=${cursorVar},this.anchor={...this.anchor,x:codexLinuxAvatarOverlayNext.x+${dragStateVar}.mascotLeft,y:codexLinuxAvatarOverlayNext.y+${dragStateVar}.mascotTop,width:this.mascotSize.width,height:this.mascotSize.height};let codexLinuxAvatarOverlayDisplay=${electronVar}.screen.getDisplayNearestPoint({x:this.anchor.x,y:this.anchor.y});this.displayId=codexLinuxAvatarOverlayDisplay.id,this.displayBounds=codexLinuxAvatarOverlayDisplay.bounds,${dragStateVar}.display=codexLinuxAvatarOverlayDisplay,${dragStateVar}.displayBounds=codexLinuxAvatarOverlayDisplay.bounds,this.layout={...this.getLayout(${windowVar}),windowBounds:codexLinuxAvatarOverlayNext,mascot:{...this.getLayout(${windowVar}).mascot,left:${dragStateVar}.mascotLeft,top:${dragStateVar}.mascotTop},viewport:{width:codexLinuxAvatarOverlayNext.width,height:codexLinuxAvatarOverlayNext.height}},this.setWindowBounds(${windowVar},codexLinuxAvatarOverlayNext,!1,!1),this.sendLayoutToRenderer(${windowVar})}`
      },
      {
        pattern: LINUX_AVATAR_OVERLAY_MOVE_DRAG_POINTER_26_611_PATTERN,
        replacement: ({ windowVar, cursorVar, dragStateVar, displayBoundsVar, displayFn, displayVar, electronVar }) =>
          `moveDragToPointer(${windowVar},${cursorVar}){let ${dragStateVar}=this.dragState;if(${dragStateVar}==null)return;if(process.platform===\`linux\`&&process?.env?.CODEX_DESKTOP_DISABLE_LINUX_AVATAR_OVERLAY_PATCH!==\`1\`){let codexLinuxAvatarOverlayLayout=this.getLayout(${windowVar}),codexLinuxAvatarOverlayBounds=${windowVar}.getContentBounds(),codexLinuxAvatarOverlayNext={x:Math.round(${cursorVar}.x-${dragStateVar}.pointerAnchorX-codexLinuxAvatarOverlayLayout.mascot.left),y:Math.round(${cursorVar}.y-${dragStateVar}.pointerAnchorY-codexLinuxAvatarOverlayLayout.mascot.top),width:codexLinuxAvatarOverlayBounds.width,height:codexLinuxAvatarOverlayBounds.height};this.anchor={...this.anchor,x:codexLinuxAvatarOverlayNext.x+codexLinuxAvatarOverlayLayout.mascot.left,y:codexLinuxAvatarOverlayNext.y+codexLinuxAvatarOverlayLayout.mascot.top,width:this.mascotSize.width,height:this.mascotSize.height};let codexLinuxAvatarOverlayDisplay=${electronVar}.screen.getDisplayNearestPoint({x:this.anchor.x,y:this.anchor.y});${dragStateVar}.recordMove(codexLinuxAvatarOverlayDisplay.bounds),${dragStateVar}.lastScreenPoint=${cursorVar},${dragStateVar}.display=codexLinuxAvatarOverlayDisplay,this.displayId=codexLinuxAvatarOverlayDisplay.id,this.displayBounds=codexLinuxAvatarOverlayDisplay.bounds,this.layout={...codexLinuxAvatarOverlayLayout,windowBounds:codexLinuxAvatarOverlayNext,mascot:{...codexLinuxAvatarOverlayLayout.mascot,left:codexLinuxAvatarOverlayLayout.mascot.left,top:codexLinuxAvatarOverlayLayout.mascot.top},viewport:{width:codexLinuxAvatarOverlayNext.width,height:codexLinuxAvatarOverlayNext.height}},this.setWindowBounds(${windowVar},codexLinuxAvatarOverlayNext,!1,!1),this.sendLayoutToRenderer(${windowVar});return}let ${displayBoundsVar}=${displayFn}(${cursorVar},${dragStateVar}.displayBounds),${displayVar}=${electronVar}.screen.getDisplayMatching(${displayBoundsVar});${dragStateVar}.recordMove(${displayVar}.bounds),this.anchor={...this.anchor,x:${cursorVar}.x-${dragStateVar}.pointerAnchorX,y:${cursorVar}.y-${dragStateVar}.pointerAnchorY},this.applyLayout(${windowVar},${displayVar},!1,!1)}`
      },
      {
        pattern: LINUX_AVATAR_OVERLAY_MOVE_DRAG_POINTER_26_623_PATTERN,
        replacement: ({
          windowVar,
          cursorVar,
          dragStateVar,
          displayBoundsVar,
          displayFn,
          displayVar,
          electronVar,
          targetXVar,
          targetYVar,
          easeVar,
          orbEaseVar,
          nextAnchorVar,
          currentBoundsVar,
          equalFn
        }) =>
          `moveDragToPointer(${windowVar},${cursorVar}){let ${dragStateVar}=this.dragState;if(${dragStateVar}==null)return;if(process.platform===\`linux\`&&process?.env?.CODEX_DESKTOP_DISABLE_LINUX_AVATAR_OVERLAY_PATCH!==\`1\`){let codexLinuxAvatarOverlayLayout=this.getLayout(${windowVar}),codexLinuxAvatarOverlayBounds=${windowVar}.getContentBounds(),${targetXVar}=${cursorVar}.x-${dragStateVar}.pointerAnchorX,${targetYVar}=${cursorVar}.y-${dragStateVar}.pointerAnchorY,${easeVar}=${dragStateVar}.usesOrbPhysics?${orbEaseVar}:1,codexLinuxAvatarOverlayAnchor={...this.anchor,x:this.anchor.x+(${targetXVar}-this.anchor.x)*${easeVar},y:this.anchor.y+(${targetYVar}-this.anchor.y)*${easeVar}},codexLinuxAvatarOverlayNext={x:Math.round(codexLinuxAvatarOverlayAnchor.x-codexLinuxAvatarOverlayLayout.mascot.left),y:Math.round(codexLinuxAvatarOverlayAnchor.y-codexLinuxAvatarOverlayLayout.mascot.top),width:codexLinuxAvatarOverlayBounds.width,height:codexLinuxAvatarOverlayBounds.height};this.anchor={...this.anchor,x:codexLinuxAvatarOverlayNext.x+codexLinuxAvatarOverlayLayout.mascot.left,y:codexLinuxAvatarOverlayNext.y+codexLinuxAvatarOverlayLayout.mascot.top,width:this.mascotSize.width,height:this.mascotSize.height};let codexLinuxAvatarOverlayDisplay=${electronVar}.screen.getDisplayNearestPoint({x:this.anchor.x,y:this.anchor.y});${dragStateVar}.recordMove(codexLinuxAvatarOverlayDisplay.bounds),${dragStateVar}.lastScreenPoint=${cursorVar},${dragStateVar}.display=codexLinuxAvatarOverlayDisplay,this.displayId=codexLinuxAvatarOverlayDisplay.id,this.displayBounds=codexLinuxAvatarOverlayDisplay.bounds,this.layout={...codexLinuxAvatarOverlayLayout,windowBounds:codexLinuxAvatarOverlayNext,mascot:{...codexLinuxAvatarOverlayLayout.mascot,left:codexLinuxAvatarOverlayLayout.mascot.left,top:codexLinuxAvatarOverlayLayout.mascot.top},viewport:{width:codexLinuxAvatarOverlayNext.width,height:codexLinuxAvatarOverlayNext.height}},this.setWindowBounds(${windowVar},codexLinuxAvatarOverlayNext,!1,!1),this.sendLayoutToRenderer(${windowVar});return}let ${displayBoundsVar}=${displayFn}(${cursorVar},${dragStateVar}.displayBounds),${displayVar}=${electronVar}.screen.getDisplayMatching(${displayBoundsVar});${dragStateVar}.recordMove(${displayVar}.bounds);let ${targetXVar}=${cursorVar}.x-${dragStateVar}.pointerAnchorX,${targetYVar}=${cursorVar}.y-${dragStateVar}.pointerAnchorY,${easeVar}=${dragStateVar}.usesOrbPhysics?${orbEaseVar}:1,${nextAnchorVar}={...this.anchor,x:this.anchor.x+(${targetXVar}-this.anchor.x)*${easeVar},y:this.anchor.y+(${targetYVar}-this.anchor.y)*${easeVar}},${currentBoundsVar}=${windowVar}.getContentBounds();this.anchor=${nextAnchorVar},this.applyLayout(${windowVar},${displayVar},!1,!1),this.layout!=null&&${equalFn}(${currentBoundsVar},this.layout.windowBounds)&&(this.anchor.x!==Math.round(${nextAnchorVar}.x)||this.anchor.y!==Math.round(${nextAnchorVar}.y))&&this.compositionHost.settleDragFollowSurfaces()}`
      }
    ],
    errorMessage
  );
  updated = replaceFirstMatchingRegexOrThrow(
    updated,
    [
      {
        pattern: LINUX_AVATAR_OVERLAY_END_DRAG_PATTERN,
        replacement: ({ webContentsIdVar, windowVar }) =>
          `endDrag(${webContentsIdVar}){let ${windowVar}=this.window;if(${windowVar}==null||${windowVar}.isDestroyed()||${windowVar}.webContents.id!==${webContentsIdVar})return;if(process.platform===\`linux\`&&process?.env?.CODEX_DESKTOP_DISABLE_LINUX_AVATAR_OVERLAY_PATCH!==\`1\`){let codexLinuxAvatarOverlayDisplay=this.dragState?.display;this.dragState?.hasMoved&&(this.moveDragToCurrentCursor(${windowVar},this.dragState.lastScreenPoint),codexLinuxAvatarOverlayDisplay=this.dragState?.display??codexLinuxAvatarOverlayDisplay),this.dragState=null,this.persistWindowBounds(${windowVar},codexLinuxAvatarOverlayDisplay??this.getCurrentDisplay());return}this.dragState?.hasMoved&&this.moveDragToCurrentCursor(${windowVar}),this.dragState=null,this.reclampWindowToVisibleDisplay({shouldPersist:!0})}`
      },
      {
        pattern: LINUX_AVATAR_OVERLAY_END_DRAG_26_611_PATTERN,
        replacement: ({
          webContentsIdVar,
          pointVar,
          windowVar,
          dragStateVar,
          cursorVar,
          electronVar,
          nextPointVar,
          coercePointFn,
          suppressVar
        }) =>
          `endDrag(${webContentsIdVar},${pointVar}){let ${windowVar}=this.window;if(${windowVar}==null||${windowVar}.isDestroyed()||${windowVar}.webContents.id!==${webContentsIdVar})return;let ${dragStateVar}=this.dragState;if(${dragStateVar}?.hasMovementIntent){let ${cursorVar}=${electronVar}.screen.getCursorScreenPoint(),${nextPointVar}=${dragStateVar}.getCursorPointForSource({native:${dragStateVar}.cursorSource===\`native\`?${coercePointFn}(this.compositionHost.getCursorPosition()):null,renderer:this.codexLinuxAvatarOverlayScreenPoint(${pointVar})??{x:${pointVar}?.pointerScreenX??${cursorVar}.x,y:${pointVar}?.pointerScreenY??${cursorVar}.y}});${nextPointVar}!=null&&this.moveDragToPointer(${windowVar},${nextPointVar})}this.${suppressVar}=${dragStateVar}?.shouldSuppressRendererThrow()??!1;if(process.platform===\`linux\`&&process?.env?.CODEX_DESKTOP_DISABLE_LINUX_AVATAR_OVERLAY_PATCH!==\`1\`){let codexLinuxAvatarOverlayDisplay=${dragStateVar}?.display;this.dragState=null,this.persistWindowBounds(${windowVar},codexLinuxAvatarOverlayDisplay??this.getCurrentDisplay());return}this.dragState=null,this.reclampWindowToVisibleDisplay({shouldPersist:!0})}`
      },
      {
        pattern: LINUX_AVATAR_OVERLAY_END_DRAG_26_623_PATTERN,
        replacement: ({
          webContentsIdVar,
          pointVar,
          windowVar,
          dragStateVar,
          cursorVar,
          electronVar,
          nextPointVar,
          coercePointFn,
          suppressVar,
          dockTargetVar,
          currentAnchorVar,
          anchorFn,
          dockCheckFn
        }) =>
          `endDrag(${webContentsIdVar},${pointVar}){let ${windowVar}=this.window;if(${windowVar}==null||${windowVar}.isDestroyed()||${windowVar}.webContents.id!==${webContentsIdVar})return;this.cancelOrbDragFollow();let ${dragStateVar}=this.dragState;if(${dragStateVar}?.hasMovementIntent){let ${cursorVar}=${electronVar}.screen.getCursorScreenPoint(),${nextPointVar}=${dragStateVar}.getCursorPointForSource({native:${dragStateVar}.cursorSource===\`native\`?${coercePointFn}(this.compositionHost.getCursorPosition()):null,renderer:this.codexLinuxAvatarOverlayScreenPoint(${pointVar})??{x:${pointVar}?.pointerScreenX??${cursorVar}.x,y:${pointVar}?.pointerScreenY??${cursorVar}.y}});${nextPointVar}!=null&&this.moveDragToPointer(${windowVar},${nextPointVar})}this.${suppressVar}=${dragStateVar}?.shouldSuppressRendererThrow()??!1;if(process.platform===\`linux\`&&process?.env?.CODEX_DESKTOP_DISABLE_LINUX_AVATAR_OVERLAY_PATCH!==\`1\`){let codexLinuxAvatarOverlayDisplay=${dragStateVar}?.display;this.dragState=null,this.persistWindowBounds(${windowVar},codexLinuxAvatarOverlayDisplay??this.getCurrentDisplay());let ${dockTargetVar}=this.dockTarget,${currentAnchorVar}=${anchorFn}(this.anchor,this.presentationOffset);${dockTargetVar}!=null&&${dockCheckFn}({current:${currentAnchorVar},next:${currentAnchorVar},target:{x:${dockTargetVar}.anchor.centerX,y:${dockTargetVar}.anchor.centerY}}).shouldDock&&this.dockPresentation(${dockTargetVar}.anchor,${dockTargetVar}.onDock);return}this.dragState=null,this.reclampWindowToVisibleDisplay({shouldPersist:!0});let ${dockTargetVar}=this.dockTarget,${currentAnchorVar}=${anchorFn}(this.anchor,this.presentationOffset);${dockTargetVar}!=null&&${dockCheckFn}({current:${currentAnchorVar},next:${currentAnchorVar},target:{x:${dockTargetVar}.anchor.centerX,y:${dockTargetVar}.anchor.centerY}}).shouldDock&&this.dockPresentation(${dockTargetVar}.anchor,${dockTargetVar}.onDock)}`
      }
    ],
    errorMessage
  );
  updated = replaceFirstMatchingRegexOrThrow(
    updated,
    [
      {
        pattern: LINUX_AVATAR_OVERLAY_THROW_WITH_VELOCITY_PATTERN,
        replacement: ({ webContentsIdVar, velocityXVar, velocityYVar, windowVar }) =>
          `throwWithVelocity(${webContentsIdVar},${velocityXVar},${velocityYVar}){let ${windowVar}=this.window;if(${windowVar}==null||${windowVar}.isDestroyed()||${windowVar}.webContents.id!==${webContentsIdVar}||!Number.isFinite(${velocityXVar})||!Number.isFinite(${velocityYVar})||${velocityXVar}===0&&${velocityYVar}===0)return;if(process.platform===\`linux\`&&process?.env?.CODEX_DESKTOP_DISABLE_LINUX_AVATAR_OVERLAY_PATCH!==\`1\`){this.persistWindowBounds(${windowVar});return}`
      },
      {
        pattern: LINUX_AVATAR_OVERLAY_THROW_WITH_VELOCITY_26_623_PATTERN,
        replacement: ({ webContentsIdVar, velocityXVar, velocityYVar, shouldBounceVar, windowVar }) =>
          `throwWithVelocity(${webContentsIdVar},${velocityXVar},${velocityYVar},${shouldBounceVar}=!1){let ${windowVar}=this.window;if(${windowVar}==null||${windowVar}.isDestroyed()||${windowVar}.webContents.id!==${webContentsIdVar}||!Number.isFinite(${velocityXVar})||!Number.isFinite(${velocityYVar})||${velocityXVar}===0&&${velocityYVar}===0)return;if(process.platform===\`linux\`&&process?.env?.CODEX_DESKTOP_DISABLE_LINUX_AVATAR_OVERLAY_PATCH!==\`1\`){this.persistWindowBounds(${windowVar});return}let codexLinuxAvatarOverlaySuppressThrow=this.suppressNextRendererThrow;this.suppressNextRendererThrow=!1,!(codexLinuxAvatarOverlaySuppressThrow&&!${shouldBounceVar})&&this.startMomentum(${velocityXVar},${velocityYVar},${shouldBounceVar})}`
      }
    ],
    errorMessage
  );
  return updated;
}

export function applyLinuxAvatarOverlayRendererPatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxAvatarOverlayRendererPatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxAvatarOverlayRendererPatch(bundleSource, options = {}) {
  if (bundleSource.includes(LINUX_AVATAR_OVERLAY_DRAG_COORDS_PATCH_MARKER)) {
    return bundleSource;
  }
  const errorMessage = buildLinuxAvatarOverlayRendererPatchErrorMessage(
    bundleSource,
    options.sourceName
  );
  return replaceFirstMatchingRegexOrThrow(
    bundleSource,
    [
      {
        pattern: LINUX_AVATAR_OVERLAY_RENDERER_DRAG_MOVE_PATTERN,
        replacement: ({ sampleVar, sampleFn, eventVar, body }) =>
          `let ${sampleVar}=${sampleFn}(${eventVar});${body}{cursorScreenX:${sampleVar}.screenX,cursorScreenY:${sampleVar}.screenY})/* ${LINUX_AVATAR_OVERLAY_DRAG_COORDS_PATCH_MARKER} */`
      },
      {
        pattern: LINUX_AVATAR_OVERLAY_RENDERER_DRAG_MOVE_POINTER_PATTERN,
        replacement: ({ sampleVar, sampleFn, eventVar, body }) =>
          `let ${sampleVar}=${sampleFn}(${eventVar});${body}{pointerScreenX:${sampleVar}.screenX,pointerScreenY:${sampleVar}.screenY})/* ${LINUX_AVATAR_OVERLAY_DRAG_COORDS_PATCH_MARKER} */`
      }
    ],
    errorMessage
  );
}

export function applyLinuxPetYappingUsagePatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxPetYappingUsagePatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxPetYappingUsagePatch(bundleSource, options = {}) {
  if (bundleSource.includes(LINUX_PET_YAPPING_USAGE_PATCH_MARKER)) {
    return bundleSource;
  }
  const errorMessage = buildLinuxPetYappingUsagePatchErrorMessage(
    bundleSource,
    options.sourceName
  );
  const reactMatch = bundleSource.match(LINUX_PET_YAPPING_USAGE_REACT_VAR_PATTERN);
  if (!reactMatch?.groups?.reactVar) {
    throw new Error(errorMessage);
  }
  const jsxRuntime = findLinuxPetYappingUsageJsxRuntime(bundleSource);
  if (!jsxRuntime) {
    throw new Error(errorMessage);
  }
  let updated = bundleSource;
  if (LINUX_PET_YAPPING_USAGE_VSCODE_API_IMPORT_PATTERN.test(updated)) {
    updated = replaceRegexOrThrow(
      updated,
      LINUX_PET_YAPPING_USAGE_VSCODE_API_IMPORT_PATTERN,
      ({ imports, module }) => {
        const nextImports = appendNamedImportAlias(imports, 'n', 'codexLinuxFetchUsage');
        return `import{${nextImports}}from"${module}";`;
      },
      errorMessage
    );
  } else if (LINUX_PET_YAPPING_USAGE_SETTING_STORAGE_IMPORT_PATTERN.test(updated)) {
    updated = replaceRegexOrThrow(
      updated,
      LINUX_PET_YAPPING_USAGE_SETTING_STORAGE_IMPORT_PATTERN,
      ({ imports, module }) => {
        const nextImports = appendNamedImportAlias(imports, 'l', 'codexLinuxFetchUsage');
        return `import{${nextImports}}from"${module}";`;
      },
      errorMessage
    );
  } else {
    const rolldownImport = findLinuxPetYappingUsageRolldownRequestImport(updated);
    if (!rolldownImport) {
      throw new Error(errorMessage);
    }
    updated = replaceRegexOrThrow(
      updated,
      rolldownImport.pattern,
      ({ imports, module }) => {
        const nextImports = appendNamedImportAlias(
          imports,
          rolldownImport.requestImportName,
          'codexLinuxFetchUsage'
        );
        return `import{${nextImports}}from"${module}";`;
      },
      errorMessage
    );
  }
  const petContext = {
    jsxVar: jsxRuntime.jsxVar,
    reactVar: reactMatch.groups.reactVar
  };
  updated = replaceRegexOrThrow(
    updated,
    jsxRuntime.declarationPattern,
    ({ jsxVar, varTail }) =>
      jsxRuntime.kind === 'assignment'
        ? `${jsxVar}=${jsxRuntime.jsxFactory}();${buildLinuxPetYappingUsageComponent({
            jsxVar: petContext.jsxVar,
            reactVar: petContext.reactVar
          })}`
        : `var ${jsxVar}=${jsxRuntime.jsxFactory}();${buildLinuxPetYappingUsageComponent({
            jsxVar: petContext.jsxVar,
            reactVar: petContext.reactVar
          })}${varTail ? `var ${varTail.slice(1)};` : ''}`,
    errorMessage
  );
  if (
    LINUX_PET_YAPPING_USAGE_MASCOT_HIT_REGION_PATTERN.test(updated) ||
    LINUX_PET_YAPPING_USAGE_MASCOT_HIT_REGION_26_611_PATTERN.test(updated) ||
    LINUX_PET_YAPPING_USAGE_MASCOT_HIT_REGION_26_623_PATTERN.test(updated)
  ) {
    updated = replaceFirstMatchingRegexOrThrow(
      updated,
      [
        {
          pattern: LINUX_PET_YAPPING_USAGE_MASCOT_HIT_REGION_PATTERN,
          replacement: ({ prefix, mascotCall, jsxVar }) =>
            `${prefix}(0,${jsxVar}.jsxs)(${jsxVar}.Fragment,{children:[${mascotCall},(0,${petContext.jsxVar}.jsx)(codexLinuxPetYappingUsage,{})]})/* ${LINUX_PET_YAPPING_USAGE_PATCH_MARKER} */`
        },
        {
          pattern: LINUX_PET_YAPPING_USAGE_MASCOT_HIT_REGION_26_611_PATTERN,
          replacement: ({ prefix, mascotContent, realtimeButton }) =>
            `${prefix}${mascotContent},(0,${petContext.jsxVar}.jsx)(codexLinuxPetYappingUsage,{}),${realtimeButton}]}/* ${LINUX_PET_YAPPING_USAGE_PATCH_MARKER} */`
        },
        {
          pattern: LINUX_PET_YAPPING_USAGE_MASCOT_HIT_REGION_26_623_PATTERN,
          replacement: ({ prefix, mascotContent, suffix }) =>
            `${prefix}[${mascotContent},(0,${petContext.jsxVar}.jsx)(codexLinuxPetYappingUsage,{})]${suffix}/* ${LINUX_PET_YAPPING_USAGE_PATCH_MARKER} */`
        }
      ],
      errorMessage
    );
  } else if (!updated.includes('"data-avatar-overlay-hit-region":`mascot`')) {
    updated = replaceRegexOrThrow(
      updated,
      LINUX_PET_YAPPING_USAGE_MASCOT_CHILDREN_PATTERN,
      ({ avatar, badge }) =>
        `children:[${avatar},(0,${petContext.jsxVar}.jsx)(codexLinuxPetYappingUsage,{}),${badge}]}/* ${LINUX_PET_YAPPING_USAGE_PATCH_MARKER} */`,
      errorMessage
    );
  } else {
    throw new Error(errorMessage);
  }
  updated = replaceRegexOrThrow(
    updated,
    LINUX_PET_YAPPING_USAGE_LAYOUT_QUERY_PATTERN,
    ({ layoutQuery }) => {
      const measureFn = layoutQuery.match(/^([A-Za-z_$][\w$]*)\(/)?.[1] ?? 'ft';
      return `${measureFn}(e.querySelector(\`.codex-usage-yap-wrap\`))??${layoutQuery}`;
    },
    errorMessage
  );
  return updated;
}

export function applyLinuxPetYappingUsageCssPatch(cssSource, options = {}) {
  if (options.skip) {
    return {
      updated: cssSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxPetYappingUsageCssPatch(cssSource, options);
  return {
    updated,
    status: updated === cssSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxPetYappingUsageCssPatch(cssSource, options = {}) {
  if (cssSource.includes(LINUX_PET_YAPPING_USAGE_PATCH_MARKER)) {
    return cssSource;
  }
  if (!cssSource.includes('.codex-avatar-root')) {
    throw new Error(
      buildPatchErrorMessage(LINUX_PET_YAPPING_USAGE_PATCH_BASE_ERROR_MESSAGE, options.sourceName, {
        detected: { avatarStylesheet: false },
        missingAnchors: ['avatar stylesheet root']
      })
    );
  }
  return `${cssSource.trimEnd()}\n\n${buildLinuxPetYappingUsageCss()}\n`;
}

export function applyLinuxWorktreeEnvironmentMainPatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxWorktreeEnvironmentMainPatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxWorktreeEnvironmentMainPatch(bundleSource, options = {}) {
  if (bundleSource.includes(LINUX_WORKTREE_ENVIRONMENT_MAIN_PATCH_MARKER)) {
    return bundleSource;
  }

  const errorMessage = buildLinuxWorktreeEnvironmentMainPatchErrorMessage(
    bundleSource,
    options.sourceName
  );
  const helperMatch = bundleSource.match(LINUX_WORKTREE_ENVIRONMENT_MAIN_HELPER_PATTERN);
  if (!helperMatch?.groups) {
    throw new Error(errorMessage);
  }
  const mainBundleContext = {
    loggerVar: helperMatch.groups.loggerVar
  };
  const pendingMatch = bundleSource.match(LINUX_WORKTREE_ENVIRONMENT_PENDING_REQUEST_PATTERN);
  const managedMatch = bundleSource.match(LINUX_WORKTREE_ENVIRONMENT_MANAGED_REQUEST_PATTERN);
  if (!pendingMatch?.groups || !managedMatch?.groups) {
    throw new Error(errorMessage);
  }
  let updated = replaceRegexOrThrow(
    bundleSource,
    LINUX_WORKTREE_ENVIRONMENT_MAIN_HELPER_PATTERN,
    buildLinuxWorktreeEnvironmentMainHelperReplacement,
    errorMessage
  );
  updated = replaceRegexOrThrow(
    updated,
    LINUX_WORKTREE_ENVIRONMENT_PENDING_REQUEST_PATTERN,
    (groups) => buildLinuxWorktreeEnvironmentPendingRequestReplacement(groups, mainBundleContext),
    errorMessage
  );
  updated = replaceAllSnippetsOrThrow(
    updated,
    `hasLocalEnvironment:${pendingMatch.groups.entryVar}.localEnvironmentConfigPath!=null`,
    LINUX_WORKTREE_ENVIRONMENT_PENDING_READY_LOG_REPLACEMENT_CURRENT,
    errorMessage
  );
  updated = replaceRegexOrThrow(
    updated,
    LINUX_WORKTREE_ENVIRONMENT_MANAGED_REQUEST_PATTERN,
    (groups) => buildLinuxWorktreeEnvironmentManagedRequestReplacement(groups, mainBundleContext),
    errorMessage
  );
  return replaceSnippetOrThrow(
    updated,
    `hasLocalEnvironment:${managedMatch.groups.envVar}!=null`,
    LINUX_WORKTREE_ENVIRONMENT_MANAGED_READY_LOG_REPLACEMENT_CURRENT,
    errorMessage
  );
}

export function applyLinuxWorktreeEnvironmentWorkerPatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxWorktreeEnvironmentWorkerPatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxWorktreeEnvironmentWorkerPatch(bundleSource, options = {}) {
  if (bundleSource.includes(LINUX_WORKTREE_ENVIRONMENT_WORKER_PATCH_MARKER)) {
    return bundleSource;
  }

  const errorMessage = buildLinuxWorktreeEnvironmentWorkerPatchErrorMessage(
    bundleSource,
    options.sourceName
  );
  const cleanupCallMatch = bundleSource.match(LINUX_WORKTREE_ENVIRONMENT_WORKER_CLEANUP_CALL_PATTERN);
  const deleteCleanupMatch = bundleSource.match(
    LINUX_WORKTREE_ENVIRONMENT_WORKER_DELETE_CLEANUP_FUNCTION_PATTERN
  );
  const setupEnvironmentMatch = bundleSource.match(
    /\{\[(?<sourceRootEnvVar>[A-Za-z_$][\w$]*)\]:t,\[(?<worktreeRootEnvVar>[A-Za-z_$][\w$]*)\]:[A-Za-z_$][\w$]*\}/
  );
  const fsApiMatch = bundleSource.match(
    /await (?<fsApiVar>[A-Za-z_$][\w$]*)\.rm\([A-Za-z_$][\w$]*,void 0,[A-Za-z_$][\w$]*\)/
  );
  const loggerMatch = bundleSource.match(
    /(?<loggerFn>[A-Za-z_$][\w$]*)\(\)\.warning\(`\[worktree-delete\] cleanup-config-unavailable`/
  );
  const deleteWorktreeIdMatch = bundleSource.match(
    /async function [A-Za-z_$][\w$]*\(e,t,n(?:=!1)?,r\)\{let [A-Za-z_$][\w$]*=(?<hashFn>[A-Za-z_$][\w$]*)\((?<normalizeFn>[A-Za-z_$][\w$]*)\(e\)\),[A-Za-z_$][\w$]*=/
  );
  if (
    !cleanupCallMatch?.groups ||
    !deleteCleanupMatch?.groups ||
    !setupEnvironmentMatch?.groups ||
    !loggerMatch?.groups
  ) {
    throw new Error(errorMessage);
  }
  const workerBundleContext = {
    cleanupFn: cleanupCallMatch.groups.cleanupFn,
    deleteCleanupFn: deleteCleanupMatch.groups.deleteCleanupFn,
    fsApiVar: fsApiMatch?.groups?.fsApiVar ?? 'cz',
    loggerFn: loggerMatch.groups.loggerFn,
    sourceRootEnvVar: setupEnvironmentMatch.groups.sourceRootEnvVar,
    worktreeRootEnvVar: setupEnvironmentMatch.groups.worktreeRootEnvVar,
    worktreeIdExpression: deleteWorktreeIdMatch?.groups
      ? `${deleteWorktreeIdMatch.groups.hashFn}(${deleteWorktreeIdMatch.groups.normalizeFn}(e.sourceWorktreeRoot))`
      : 'e.sourceWorktreeRoot'
  };
  let updated = replaceRegexOrThrow(
    bundleSource,
    LINUX_WORKTREE_ENVIRONMENT_WORKER_HELPER_PATTERN,
    (groups) => buildLinuxWorktreeEnvironmentWorkerHelperReplacement(groups, workerBundleContext),
    errorMessage
  );
  updated = replaceRegexOrThrow(
    updated,
    LINUX_WORKTREE_ENVIRONMENT_WORKER_CLEANUP_HELPER_PATTERN,
    buildLinuxWorktreeEnvironmentWorkerCleanupHelperReplacement,
    errorMessage
  );
  updated = replaceRegexOrThrow(
    updated,
    LINUX_WORKTREE_ENVIRONMENT_WORKER_CREATE_PATTERN,
    (groups) => buildLinuxWorktreeEnvironmentWorkerCreateReplacement(groups, workerBundleContext),
    errorMessage
  );
  updated = replaceRegexOrThrow(
    updated,
    LINUX_WORKTREE_ENVIRONMENT_WORKER_CLEANUP_CALL_PATTERN,
    (groups) => buildLinuxWorktreeEnvironmentWorkerCleanupCallReplacement(groups, workerBundleContext),
    errorMessage
  );
  updated = replaceRegexOrThrow(
    updated,
    LINUX_WORKTREE_ENVIRONMENT_WORKER_MOVE_TO_LOCAL_SUCCESS_PATTERN,
    (groups) =>
      buildLinuxWorktreeEnvironmentWorkerMoveToLocalReplacement(workerBundleContext, groups),
    errorMessage
  );
  return replaceSnippetOrThrow(
    updated,
    LINUX_WORKTREE_ENVIRONMENT_WORKER_CLEANUP_SKIP_SNIPPET_CURRENT,
    buildLinuxWorktreeEnvironmentWorkerCleanupSkipReplacement(workerBundleContext),
    errorMessage
  );
}

function buildLinuxOpenTargetsBlock({
  targetVar,
  targetList,
  loggerVar,
  loggerObject,
  loggerFactory,
  platformFn,
  platformTargetsVar,
  normalizedTargetsVar,
  normalizeFn,
  editorTargetIdsVar,
  stateVar1,
  stateVar2
}) {
  return `var codexLinuxBuiltins=typeof process.getBuiltinModule===\`function\`?{fs:process.getBuiltinModule(\`node:fs\`),os:process.getBuiltinModule(\`node:os\`),path:process.getBuiltinModule(\`node:path\`)}:{fs:null,os:null,path:null},codexLinuxDesktopExecCache=null;function codexLinuxHomeDir(){let e=codexLinuxBuiltins.os?.homedir?.()??process.env.HOME??\`\`;return e&&e!==\`~\`?e:null}function codexLinuxFallbackPathEntries(){let e=codexLinuxBuiltins.path,t=codexLinuxHomeDir();if(!e)return[];return[t&&e.join(t,\`.local\`,\`bin\`),t&&e.join(t,\`.local\`,\`share\`,\`JetBrains\`,\`Toolbox\`,\`scripts\`),\`/usr/local/bin\`,\`/usr/bin\`,\`/bin\`,\`/snap/bin\`].filter(Boolean)}function codexLinuxPathEntries(){let e=codexLinuxBuiltins.path;if(!e)return[];let t=process.env.PATH??\`\`,n=[...t.split(e.delimiter).map(e=>e.trim()).filter(e=>e.length>0),...codexLinuxFallbackPathEntries()];return Array.from(new Set(n))}function codexLinuxIsExecutable(e){let t=codexLinuxBuiltins.fs;if(!t)return!1;try{return t.accessSync(e,t.constants.X_OK),!0}catch{return!1}}function codexLinuxDetectCommand(e){let t=codexLinuxBuiltins.path;if(!t)return null;for(let n of codexLinuxPathEntries()){let r=t.join(n,e);if(codexLinuxIsExecutable(r))return r}return null}function codexLinuxStripDesktopExec(e){if(typeof e!==\`string\`)return null;let t=e.replace(/%[fFuUdDnNickvm]/g,\` \`).trim();if(t.length===0)return null;let n=t.match(/^"([^"]+)"/);if(n?.[1])return n[1];let[r]=t.split(/\\s+/);return r??null}function codexLinuxDesktopExecs(){let e=codexLinuxBuiltins.fs,n=codexLinuxBuiltins.path;if(codexLinuxDesktopExecCache||!e||!n)return codexLinuxDesktopExecCache??new Map;let r=codexLinuxHomeDir()??\`~\`,i=process.env.XDG_DATA_HOME??n.join(r,\`.local\`,\`share\`),a=new Map,o=[n.join(i,\`applications\`),\`/usr/share/applications\`];for(let t of o){let r;try{r=e.readdirSync(t)}catch{continue}for(let i of r){if(!i.endsWith(\`.desktop\`))continue;let r=n.join(t,i),o;try{o=e.readFileSync(r,\`utf8\`)}catch{continue}let s=o.match(/^Exec=(.+)$/m),c=codexLinuxStripDesktopExec(s?.[1]??\`\`);if(!c)continue;let l=n.basename(c).toLowerCase().replace(/\\.(sh|bin|appimage)$/,\`\`);a.has(l)||a.set(l,c)}}return codexLinuxDesktopExecCache=a,a}function codexLinuxDetectDesktopExec(e){let t=codexLinuxBuiltins.fs,n=codexLinuxBuiltins.path,r=codexLinuxDesktopExecs().get(e.toLowerCase());return!r?null:n&&t&&n.isAbsolute(r)&&t.existsSync(r)?r:codexLinuxDetectCommand(r)}function codexLinuxDetectAny(e){for(let t of e){let n=codexLinuxDetectCommand(t)??codexLinuxDetectDesktopExec(t);if(n)return n}return null}function codexLinuxJetBrainsScript(e){let t=codexLinuxBuiltins.fs,r=codexLinuxBuiltins.path;if(!t||!r)return null;let i=codexLinuxHomeDir();if(!i)return null;let a=r.join(i,\`.local\`,\`share\`,\`JetBrains\`,\`Toolbox\`,\`scripts\`,e);return t.existsSync(a)?a:null}function codexLinuxDetectJetBrains(e){return codexLinuxDetectAny([e])??codexLinuxJetBrainsScript(e)}function codexLinuxVscodeArgs(e,t){return t?[\`--goto\`,\`${"${"}e}:${"${"}t.line}:${"${"}t.column}\`]:[\`--goto\`,e]}function codexLinuxZedArgs(e,t){return t?[\`${"${"}e}:${"${"}t.line}:${"${"}t.column}\`]:[e]}function codexLinuxJetBrainsArgs(e,t){return t?[\`--line\`,t.line.toString(),\`--column\`,t.column.toString(),e]:[e]}var codexLinuxTargets=[{id:\`vscode\`,platforms:{linux:{label:\`VS Code\`,icon:\`apps/vscode.png\`,kind:\`editor\`,detect:()=>codexLinuxDetectAny([\`code\`,\`code-url-handler\`]),args:codexLinuxVscodeArgs}}},{id:\`vscodeInsiders\`,platforms:{linux:{label:\`VS Code Insiders\`,icon:\`apps/vscode-insiders.png\`,kind:\`editor\`,detect:()=>codexLinuxDetectAny([\`code-insiders\`]),args:codexLinuxVscodeArgs}}},{id:\`cursor\`,platforms:{linux:{label:\`Cursor\`,icon:\`apps/cursor.png\`,kind:\`editor\`,detect:()=>codexLinuxDetectAny([\`cursor\`]),args:codexLinuxVscodeArgs}}},{id:\`windsurf\`,platforms:{linux:{label:\`Windsurf\`,icon:\`apps/windsurf.png\`,kind:\`editor\`,detect:()=>codexLinuxDetectAny([\`windsurf\`]),args:codexLinuxVscodeArgs}}},{id:\`zed\`,platforms:{linux:{label:\`Zed\`,icon:\`apps/zed.png\`,kind:\`editor\`,detect:()=>codexLinuxDetectAny([\`zed\`,\`zeditor\`]),args:codexLinuxZedArgs}}},{id:\`androidStudio\`,platforms:{linux:{label:\`Android Studio\`,icon:\`apps/android-studio.png\`,kind:\`editor\`,detect:()=>codexLinuxDetectJetBrains(\`studio\`),args:codexLinuxJetBrainsArgs}}},{id:\`intellij\`,platforms:{linux:{label:\`IntelliJ IDEA\`,icon:\`apps/intellij.png\`,kind:\`editor\`,detect:()=>codexLinuxDetectJetBrains(\`idea\`),args:codexLinuxJetBrainsArgs}}},{id:\`rider\`,platforms:{linux:{label:\`Rider\`,icon:\`apps/rider.png\`,kind:\`editor\`,detect:()=>codexLinuxDetectJetBrains(\`rider\`),args:codexLinuxJetBrainsArgs}}},{id:\`goland\`,platforms:{linux:{label:\`GoLand\`,icon:\`apps/goland.png\`,kind:\`editor\`,detect:()=>codexLinuxDetectJetBrains(\`goland\`),args:codexLinuxJetBrainsArgs}}},{id:\`rustrover\`,platforms:{linux:{label:\`RustRover\`,icon:\`apps/rustrover.png\`,kind:\`editor\`,detect:()=>codexLinuxDetectJetBrains(\`rustrover\`),args:codexLinuxJetBrainsArgs}}},{id:\`pycharm\`,platforms:{linux:{label:\`PyCharm\`,icon:\`apps/pycharm.png\`,kind:\`editor\`,detect:()=>codexLinuxDetectJetBrains(\`pycharm\`),args:codexLinuxJetBrainsArgs}}},{id:\`webstorm\`,platforms:{linux:{label:\`WebStorm\`,icon:\`apps/webstorm.svg\`,kind:\`editor\`,detect:()=>codexLinuxDetectJetBrains(\`webstorm\`),args:codexLinuxJetBrainsArgs}}},{id:\`phpstorm\`,platforms:{linux:{label:\`PhpStorm\`,icon:\`apps/phpstorm.png\`,kind:\`editor\`,detect:()=>codexLinuxDetectJetBrains(\`phpstorm\`),args:codexLinuxJetBrainsArgs}}}];var ${targetVar}=[${targetList}],codexLinuxExistingTargetIds=new Set(${targetVar}.filter(e=>e.platforms.linux).map(e=>e.id));process.platform===\`linux\`&&${targetVar}.push(...codexLinuxTargets.filter(e=>!codexLinuxExistingTargetIds.has(e.id))),${loggerVar}=${loggerObject}.${loggerFactory}(\`open-in-targets\`);function ${platformFn}(e){return ${targetVar}.flatMap(t=>{let n=t.platforms[e];return n?[{id:t.id,...n}]:[]})}var ${platformTargetsVar}=${platformFn}(process.platform),${normalizedTargetsVar}=${normalizeFn}(${platformTargetsVar}),${editorTargetIdsVar}=new Set(${platformTargetsVar}.filter(e=>e.kind===\`editor\`).map(e=>e.id)),${stateVar1}=null,${stateVar2}=null;`;
}

function buildLinuxOpenTargetsWeakMapBlock({
  shortcutReaderObject,
  shortcutReaderVar,
  stateVar1,
  stateVar2,
  ...groups
}) {
  const editorTargetIdsVar = 'codexLinuxUnusedEditorTargetIds';
  const legacyStateVar1 = 'codexLinuxUnusedOpenTargetsState1';
  const legacyStateVar2 = 'codexLinuxUnusedOpenTargetsState2';
  const legacyBlock = buildLinuxOpenTargetsBlock({
    ...groups,
    editorTargetIdsVar,
    stateVar1: legacyStateVar1,
    stateVar2: legacyStateVar2
  });
  const legacySuffix = `var ${groups.platformTargetsVar}=${groups.platformFn}(process.platform),${groups.normalizedTargetsVar}=${groups.normalizeFn}(${groups.platformTargetsVar}),${editorTargetIdsVar}=new Set(${groups.platformTargetsVar}.filter(e=>e.kind===\`editor\`).map(e=>e.id)),${legacyStateVar1}=null,${legacyStateVar2}=null;`;
  if (!legacyBlock.endsWith(legacySuffix)) {
    throw new Error('Could not adapt Linux open-in-targets patch to WeakMap state shape.');
  }
  const weakMapSuffix = `var ${groups.platformTargetsVar}=${groups.platformFn}(process.platform),${groups.normalizedTargetsVar}=${groups.normalizeFn}(${groups.platformTargetsVar}),${stateVar1}=new WeakMap,${stateVar2}=new WeakMap,${shortcutReaderVar}=async e=>${shortcutReaderObject}.shell.readShortcutLink(e);`;
  return `${legacyBlock.slice(0, -legacySuffix.length)}${weakMapSuffix}`;
}

function buildLinuxOpenTargetsWorkerRegistryBlock({ registryVar, targetList }) {
  return `${buildLinuxOpenTargetsSupportBlock()}var codexLinuxWorkerTargets=[${targetList}],codexLinuxWorkerTargetIds=new Set(codexLinuxWorkerTargets.filter(e=>e.platforms.linux).map(e=>e.id));process.platform===\`linux\`&&codexLinuxWorkerTargets.push(...codexLinuxTargets.filter(e=>!codexLinuxWorkerTargetIds.has(e.id)));var ${registryVar}=new Map(codexLinuxWorkerTargets.flatMap(e=>{let t=e.platforms[process.platform];return t==null?[]:[[e.id,{id:e.id,...t}]]}));`;
}

function buildLinuxOpenTargetsDynamicRegistryBlock({
  loggerStatement,
  platformFn,
  platformTargetsVar,
  shortcutReaderObject,
  shortcutReaderVar,
  targetList,
  targetVar
}) {
  return `${buildLinuxOpenTargetsSupportBlock()}var ${targetVar}=[${targetList}],codexLinuxExistingTargetIds=new Set(${targetVar}.filter(e=>e.platforms.linux).map(e=>e.id));process.platform===\`linux\`&&${targetVar}.push(...codexLinuxTargets.filter(e=>!codexLinuxExistingTargetIds.has(e.id)));${loggerStatement}function ${platformFn}(e){return ${targetVar}.flatMap(t=>{let n=t.platforms[e];return n?[{id:t.id,...n}]:[]})}var ${platformTargetsVar}=${platformFn}(process.platform),${shortcutReaderVar}=async e=>${shortcutReaderObject}.shell.readShortcutLink(e);`;
}

function buildLinuxOpenTargetsSupportBlock() {
  const block = buildLinuxOpenTargetsBlock({
    targetVar: 'codexLinuxSourceTargets',
    targetList: '',
    loggerVar: 'codexLinuxOpenTargetsLogger',
    loggerObject: 'codexLinuxOpenTargetsLoggerObject',
    loggerFactory: 'codexLinuxOpenTargetsLoggerFactory',
    platformFn: 'codexLinuxPlatformTargets',
    platformTargetsVar: 'codexLinuxPlatformTargetsResult',
    normalizedTargetsVar: 'codexLinuxNormalizedTargets',
    normalizeFn: 'codexLinuxNormalizeTargets',
    editorTargetIdsVar: 'codexLinuxEditorTargetIds',
    stateVar1: 'codexLinuxOpenTargetState1',
    stateVar2: 'codexLinuxOpenTargetState2'
  });
  const suffix =
    'var codexLinuxSourceTargets=[],codexLinuxExistingTargetIds=new Set(codexLinuxSourceTargets.filter(e=>e.platforms.linux).map(e=>e.id));process.platform===`linux`&&codexLinuxSourceTargets.push(...codexLinuxTargets.filter(e=>!codexLinuxExistingTargetIds.has(e.id))),codexLinuxOpenTargetsLogger=codexLinuxOpenTargetsLoggerObject.codexLinuxOpenTargetsLoggerFactory(`open-in-targets`);function codexLinuxPlatformTargets(e){return codexLinuxSourceTargets.flatMap(t=>{let n=t.platforms[e];return n?[{id:t.id,...n}]:[]})}var codexLinuxPlatformTargetsResult=codexLinuxPlatformTargets(process.platform),codexLinuxNormalizedTargets=codexLinuxNormalizeTargets(codexLinuxPlatformTargetsResult),codexLinuxEditorTargetIds=new Set(codexLinuxPlatformTargetsResult.filter(e=>e.kind===`editor`).map(e=>e.id)),codexLinuxOpenTargetState1=null,codexLinuxOpenTargetState2=null;';
  if (!block.endsWith(suffix)) {
    throw new Error('Could not derive shared Linux open-in-targets support block.');
  }
  return block.slice(0, -suffix.length);
}

async function patchRendererTerminalBundle(extractedAppDir, logger) {
  const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
  const assetNames = await fs.promises.readdir(assetsDir);
  const jsAssets = assetNames.filter((name) => name.endsWith('.js'));
  let sawCandidate = false;
  let lastError = null;

  for (const assetName of jsAssets) {
    const assetPath = path.join(assetsDir, assetName);
    const original = await fs.promises.readFile(assetPath, 'utf8');
    const isCandidate = isTerminalCandidateBundle(original);

    if (!isCandidate) {
      continue;
    }

    sawCandidate = true;
    logger.info(`Resolved renderer terminal bundle ${assetName}`);

    try {
      const result = applyLinuxTerminalLifecyclePatch(original, { sourceName: assetName });
      if (result.updated !== original) {
        await fs.promises.writeFile(assetPath, result.updated, 'utf8');
        logger.info(`Patched Linux terminal lifecycle guard into renderer bundle ${assetName}`);
      }
      return {
        status: result.status,
        sourceName: assetName
      };
    } catch (error) {
      lastError = error;
    }
  }

  if (!sawCandidate) {
    throw new Error('Could not locate the renderer terminal bundle inside the extracted app.');
  }

  throw lastError ?? new Error('Could not patch the renderer terminal lifecycle bundle for Linux.');
}

export function applyLinuxTerminalLifecyclePatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxTerminalLifecyclePatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxTerminalLifecyclePatch(bundleSource, options = {}) {
  if (bundleSource.includes(LINUX_TERMINAL_PATCH_MARKER)) {
    return bundleSource;
  }

  const errorMessage = buildTerminalPatchErrorMessage(bundleSource, options.sourceName);
  let updated = bundleSource;
  updated = replaceRegexOrThrow(
    updated,
    TERMINAL_SESSION_CREATE_PATTERN,
    ({
      createDeclaration,
      createdSessionVar,
      resumeSessionVar,
      service,
      conversationIdVar,
      conversationTitleVar,
      hostIdVar,
      cwdVar,
      sessionRef,
      attachStateRef
    }) =>
      `${buildLinuxTerminalLifecycleHelpers()}${createDeclaration ?? 'let '}${createdSessionVar}=${resumeSessionVar}??${service}.create({${buildTerminalConversationProps({ conversationIdVar, conversationTitleVar, hostIdVar, cwdVar })}}),codexLinuxTerminalMountKey=\`${'${' + hostIdVar + '??`local`}'}:${'${' + createdSessionVar + '}'}\`;codexLinuxResetTerminalMount(codexLinuxTerminalMountKey);codexLinuxTraceTerminalCreate(codexLinuxTerminalMountKey);${sessionRef}.current=${createdSessionVar},${attachStateRef}.current=!1;let codexLinuxAttachFrame=null,codexLinuxDisposeCurrentMount=()=>{};`,
    errorMessage
  );
  updated = replaceFirstMatchingRegexOrThrow(
    updated,
    [
      {
        pattern: TERMINAL_ATTACH_WITH_ATTACH_PATTERN,
        replacement: ({
          resumeSessionVar,
          guardVar,
          service,
          conversationIdVar,
          conversationTitleVar,
          hostIdVar,
          cwdVar,
          terminalVar
        }) =>
          `${resumeSessionVar}&&(codexLinuxTraceTerminalAttachScheduled(codexLinuxTerminalMountKey),codexLinuxAttachFrame=requestAnimationFrame(()=>{codexLinuxAttachFrame=null,${guardVar}||(codexLinuxTraceTerminalAttachStarted(codexLinuxTerminalMountKey),${service}.attach({sessionId:${resumeSessionVar},${buildTerminalConversationProps({ conversationIdVar, conversationTitleVar, hostIdVar, cwdVar })},cols:${terminalVar}.cols,rows:${terminalVar}.rows}))}));`
      },
      {
        pattern: TERMINAL_ATTACH_WITH_CREATE_PATTERN,
        replacement: ({
          resumeSessionVar,
          guardVar,
          service,
          conversationIdVar,
          conversationTitleVar,
          hostIdVar,
          cwdVar,
          terminalVar
        }) =>
          `${resumeSessionVar}&&(codexLinuxTraceTerminalAttachScheduled(codexLinuxTerminalMountKey),codexLinuxAttachFrame=requestAnimationFrame(()=>{codexLinuxAttachFrame=null,${guardVar}||(codexLinuxTraceTerminalAttachStarted(codexLinuxTerminalMountKey),${service}.create({sessionId:${resumeSessionVar},${buildTerminalConversationProps({ conversationIdVar, conversationTitleVar, hostIdVar, cwdVar })},cols:${terminalVar}.cols,rows:${terminalVar}.rows}))}));`
      },
      {
        pattern: TERMINAL_ATTACH_WITH_UNSTARTED_CREATE_PATTERN,
        replacement: ({
          resumeSessionVar,
          guardVar,
          service,
          conversationIdVar,
          conversationTitleVar,
          hostIdVar,
          cwdVar,
          terminalVar
        }) =>
          `${resumeSessionVar}&&!${service}.isSessionStarted(${resumeSessionVar})&&(codexLinuxTraceTerminalAttachScheduled(codexLinuxTerminalMountKey),codexLinuxAttachFrame=requestAnimationFrame(()=>{codexLinuxAttachFrame=null,${guardVar}||(codexLinuxTraceTerminalAttachStarted(codexLinuxTerminalMountKey),${service}.create({sessionId:${resumeSessionVar},${buildTerminalConversationProps({ conversationIdVar, conversationTitleVar, hostIdVar, cwdVar })},cols:${terminalVar}.cols,rows:${terminalVar}.rows}))}));`
      }
    ],
    errorMessage
  );
  updated = replaceFirstMatchingRegexOrThrow(
    updated,
    [
      {
        pattern: TERMINAL_ON_ATTACH_WITH_DETAILS_PREFIX_PATTERN,
        replacement: ({ eventVar, detailsVar, guardVar }) =>
          `onAttach:(${eventVar},${detailsVar})=>{${guardVar}||(codexLinuxTraceTerminalAttached(codexLinuxTerminalMountKey),`
      },
      {
        pattern: TERMINAL_ON_ATTACH_NO_ARGS_PREFIX_PATTERN,
        replacement: ({ guardVar }) =>
          `onAttach:()=>{${guardVar}||(codexLinuxTraceTerminalAttached(codexLinuxTerminalMountKey),`
      }
    ],
    errorMessage
  );
  updated = replaceFirstMatchingRegexOrThrow(
    updated,
    [
      {
        pattern: TERMINAL_CLEANUP_PATTERN_LEGACY,
        replacement: (groups) => buildTerminalCleanupReplacement(groups)
      },
      {
        pattern: TERMINAL_CLEANUP_PATTERN_26_415,
        replacement: (groups) => buildTerminalCleanupReplacement(groups)
      },
      {
        pattern: TERMINAL_CLEANUP_PATTERN_26_611,
        replacement: (groups) => buildTerminalCleanupReplacement(groups)
      }
    ],
    errorMessage
  );
  assertValidLinuxTerminalLifecyclePatchOutput(updated, options.sourceName);
  return updated;
}

function buildTerminalConversationProps({ conversationIdVar, conversationTitleVar, hostIdVar, cwdVar }) {
  const titleProp = conversationTitleVar == null ? '' : `conversationTitle:${conversationTitleVar},`;
  return `conversationId:${conversationIdVar},${titleProp}hostId:${hostIdVar}??null,cwd:${cwdVar}??null`;
}

function buildTerminalCleanupReplacement({
  observerVar,
  guardVar,
  frameVar,
  dataDisposeVar,
  titleDisposeVar,
  keyDisposeVar,
  registerDisposeVar,
  fitRef,
  sessionRef,
  attachStateRef,
  resumeSessionVar,
  service,
  createdSessionVar,
  extraCleanupVar,
  terminalVar,
  terminalRef
}) {
  return `return codexLinuxDisposeCurrentMount=(codexLinuxPreserveSession=!1)=>{if(${guardVar})return;${guardVar}=!0,${frameVar}!=null&&(cancelAnimationFrame(${frameVar}),${frameVar}=null),codexLinuxAttachFrame!=null&&(cancelAnimationFrame(codexLinuxAttachFrame),codexLinuxAttachFrame=null),${observerVar}.disconnect(),${dataDisposeVar}.dispose(),${titleDisposeVar ? `${titleDisposeVar}.dispose(),` : ''}${keyDisposeVar}.dispose(),${registerDisposeVar}(),${fitRef}.current=null,${sessionRef}.current=null,${attachStateRef}.current=!1,codexLinuxPreserveSession||${resumeSessionVar}||${service}.close(${createdSessionVar}),${extraCleanupVar ? `${extraCleanupVar}(),` : ''}${terminalVar}.dispose(),${terminalRef}.current=null,codexLinuxTraceTerminalCleanup(codexLinuxTerminalMountKey),codexLinuxReleaseTerminalMount(codexLinuxTerminalMountKey,codexLinuxDisposeCurrentMount)},codexLinuxSetTerminalMount(codexLinuxTerminalMountKey,codexLinuxDisposeCurrentMount),${observerVar}.observe(e),codexLinuxDisposeCurrentMount`;
}

function buildLinuxTerminalLifecycleHelpers() {
  return 'var codexLinuxTerminalMounts=globalThis.__codexLinuxTerminalMounts??(globalThis.__codexLinuxTerminalMounts=new Map),codexLinuxTerminalTraceState=globalThis.__codexLinuxTerminalTraceState??(globalThis.__codexLinuxTerminalTraceState=new Map),codexLinuxTerminalTraceEnabled=!1;try{codexLinuxTerminalTraceEnabled=process?.env?.CODEX_DESKTOP_TRACE_TERMINAL_PATCH===`1`}catch{}function codexLinuxTerminalTraceNow(){return typeof performance<`u`&&typeof performance.now===`function`?performance.now():Date.now()}function codexLinuxTerminalTraceWarn(e,t,n){if(!codexLinuxTerminalTraceEnabled||typeof console>`u`||typeof console.warn!==`function`)return;let r=n?` ${n}`:``;console.warn(`[codex-linux-terminal] ${e} ${t}${r}`)}function codexLinuxTerminalTraceEntry(e){let t=codexLinuxTerminalTraceState.get(e);return t||(t={createdAt:codexLinuxTerminalTraceNow(),attachScheduleCount:0,attachCompleted:!1},codexLinuxTerminalTraceState.set(e,t)),t}function codexLinuxTraceTerminalCreate(e){codexLinuxTerminalTraceEnabled&&codexLinuxTerminalTraceEntry(e)}function codexLinuxTraceTerminalAttachScheduled(e){if(!codexLinuxTerminalTraceEnabled)return;let t=codexLinuxTerminalTraceEntry(e),n=codexLinuxTerminalTraceNow();t.attachScheduleCount=(t.attachScheduleCount??0)+1,t.attachScheduledAt??=n,t.lastAttachScheduledAt=n,t.attachScheduleCount>1&&codexLinuxTerminalTraceWarn(`repeat-attach-schedule`,e,`count=`+(t.attachScheduleCount??-1))}function codexLinuxTraceTerminalAttachStarted(e){if(!codexLinuxTerminalTraceEnabled)return;let t=codexLinuxTerminalTraceEntry(e);t.attachStartedAt=codexLinuxTerminalTraceNow()}function codexLinuxTraceTerminalAttached(e){if(!codexLinuxTerminalTraceEnabled)return;let t=codexLinuxTerminalTraceEntry(e),n=codexLinuxTerminalTraceNow(),r=t.attachScheduledAt==null?null:Math.round(n-t.attachScheduledAt),i=t.createdAt==null?null:Math.round(n-t.createdAt);t.attachCompleted=!0,t.attachCompletedAt=n,(r!=null&&r>250||i!=null&&i>500)&&codexLinuxTerminalTraceWarn(`slow-attach`,e,`scheduledMs=`+(r??-1)+` createdMs=`+(i??-1))}function codexLinuxTraceTerminalCleanup(e){if(!codexLinuxTerminalTraceEnabled)return;let t=codexLinuxTerminalTraceState.get(e);t&&(t.attachScheduleCount>0&&!t.attachCompleted&&codexLinuxTerminalTraceWarn(`cleanup-before-attach`,e,`attachSchedules=`+(t.attachScheduleCount??-1)),codexLinuxTerminalTraceState.delete(e))}function codexLinuxResetTerminalMount(e){let t=codexLinuxTerminalMounts.get(e);t&&(codexLinuxTerminalTraceWarn(`reset-existing-mount`,e),t(!0)),codexLinuxTerminalMounts.delete(e)}function codexLinuxSetTerminalMount(e,t){codexLinuxTerminalMounts.set(e,t)}function codexLinuxReleaseTerminalMount(e,t){codexLinuxTerminalMounts.get(e)===t&&codexLinuxTerminalMounts.delete(e)}';
}

function assertValidLinuxTerminalLifecyclePatchOutput(bundleSource, sourceName) {
  if (!bundleSource.includes(INVALID_TERMINAL_HELPER_ESCAPE_PATTERN)) {
    return;
  }

  const sourceDetail = sourceName ? ` Source: ${sourceName}.` : '';
  throw new Error(
    `Could not patch the renderer terminal lifecycle bundle for Linux.${sourceDetail} Generated invalid helper output containing ${INVALID_TERMINAL_HELPER_ESCAPE_PATTERN}.`
  );
}

export async function patchRendererNewThreadModelBundle(extractedAppDir, logger) {
  const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
  const assetNames = await fs.promises.readdir(assetsDir);
  const jsAssets = assetNames.filter((name) => name.endsWith('.js'));
  const bundleRecords = [];
  const originalBundleSourcesByAsset = new Map();
  const workingBundleSourcesByAsset = new Map();
  const allBundleSourcesByAsset = new Map();
  let sawCandidate = false;
  let firstAnchorError = null;
  let firstAnchorErrorSourceName = null;

  for (const assetName of jsAssets) {
    const assetPath = path.join(assetsDir, assetName);
    const original = await fs.promises.readFile(assetPath, 'utf8');
    allBundleSourcesByAsset.set(assetName, original);
    const evidence = collectNewThreadModelCandidateEvidence(original);
    const { stateCandidate, submitCandidate } = evidence;
    if (!stateCandidate && !submitCandidate) {
      continue;
    }

    sawCandidate = true;
    bundleRecords.push({
      assetName,
      assetPath,
      stateCandidate,
      submitCandidate,
      evidence
    });
    originalBundleSourcesByAsset.set(assetName, original);
    workingBundleSourcesByAsset.set(assetName, original);
  }
  bundleRecords.sort(
    (left, right) =>
      right.evidence.score - left.evidence.score ||
      Number(right.stateCandidate && right.submitCandidate) -
        Number(left.stateCandidate && left.submitCandidate) ||
      left.assetName.localeCompare(right.assetName)
  );
  const candidateDetails = formatNewThreadModelCandidateDetails(bundleRecords);
  const upstreamSupport = detectUpstreamNewThreadModelSupport(allBundleSourcesByAsset);
  if (upstreamSupport.supported) {
    logger.info(
      `Detected upstream fresh-thread model propagation in renderer bundles ${upstreamSupport.sourceName}`
    );
    return {
      status: 'already-applied',
      sourceName: upstreamSupport.sourceName,
      upstream: true
    };
  }

  const recordAnchorError = (assetName, error) => {
    if (!firstAnchorError) {
      firstAnchorError = error;
      firstAnchorErrorSourceName = assetName;
    }
    logger.warn(
      `Skipping Linux new-thread model patch for ${assetName} because bundle anchors were not compatible: ${error.message}`
    );
  };

  const commitUpdatedBundles = async () => {
    for (const { assetName, assetPath } of bundleRecords) {
      const original = originalBundleSourcesByAsset.get(assetName);
      const updated = workingBundleSourcesByAsset.get(assetName);
      if (updated === original) {
        continue;
      }
      await fs.promises.writeFile(assetPath, updated, 'utf8');
      logger.info(`Patched fresh-thread model selection into renderer bundle ${assetName}`);
    }
  };

  for (const { assetName, stateCandidate, submitCandidate } of bundleRecords) {
    if (!stateCandidate || !submitCandidate) {
      continue;
    }
    logger.info(`Resolved renderer new-thread model bundle ${assetName}`);

    try {
      const current = workingBundleSourcesByAsset.get(assetName);
      const result = applyLinuxNewThreadModelPatch(current, { sourceName: assetName });
      workingBundleSourcesByAsset.set(assetName, result.updated);
      await commitUpdatedBundles();
      return {
        status: result.status,
        sourceName: assetName
      };
    } catch (error) {
      if (isNewThreadModelPatchAnchorError(error)) {
        recordAnchorError(assetName, error);
        continue;
      }
      throw error;
    }
  }

  const applySplitPatchPart = (partName, candidateKey, applyPatch) => {
    for (const record of bundleRecords) {
      if (!record[candidateKey]) {
        continue;
      }
      const { assetName } = record;
      logger.info(`Resolved renderer new-thread model ${partName} bundle ${assetName}`);
      const current = workingBundleSourcesByAsset.get(assetName);
      try {
        const result = applyPatch(current, { sourceName: assetName });
        workingBundleSourcesByAsset.set(assetName, result.updated);
        return {
          assetName,
          result
        };
      } catch (error) {
        if (isNewThreadModelPatchAnchorError(error)) {
          recordAnchorError(assetName, error);
          continue;
        }
        throw error;
      }
    }
    return null;
  };

  const splitStatePatch = applySplitPatchPart(
    'state',
    'stateCandidate',
    applyLinuxNewThreadModelStatePatch
  );
  const splitSubmitPatch = applySplitPatchPart(
    'submit',
    'submitCandidate',
    applyLinuxNewThreadModelSubmitPatch
  );

  if (splitStatePatch && splitSubmitPatch) {
    await commitUpdatedBundles();
    const combinedStatus =
      splitStatePatch.result.status === 'already-applied' &&
      splitSubmitPatch.result.status === 'already-applied'
        ? 'already-applied'
        : 'applied';
    return {
      status: combinedStatus,
      sourceName:
        splitStatePatch.assetName === splitSubmitPatch.assetName
          ? splitStatePatch.assetName
          : `${splitStatePatch.assetName},${splitSubmitPatch.assetName}`,
      stateSourceName: splitStatePatch.assetName,
      submitSourceName: splitSubmitPatch.assetName
    };
  }

  if (!firstAnchorError) {
    const missingPart =
      splitStatePatch == null && splitSubmitPatch == null
        ? 'state and submit'
        : splitStatePatch == null
          ? 'state'
          : 'submit';
    firstAnchorError = new Error(
      `${NEW_THREAD_MODEL_PATCH_BASE_ERROR_MESSAGE} Missing compatible ${missingPart} bundle for split patching.`
    );
    firstAnchorErrorSourceName =
      splitStatePatch?.assetName ??
      splitSubmitPatch?.assetName ??
      bundleRecords[0]?.assetName ??
      null;
  }

  if (!sawCandidate) {
    logger.warn(
      'Skipping Linux new-thread model patch because no new-thread renderer candidate bundle was detected.'
    );
    return {
      status: 'skipped',
      reason: 'bundle-not-found'
    };
  }

  logger.warn(
    `Skipping Linux new-thread model patch because renderer candidates were incompatible with the expected fresh-thread anchors.${firstAnchorErrorSourceName ? ` Source: ${firstAnchorErrorSourceName}.` : ''}${candidateDetails ? ` Candidates: ${candidateDetails}.` : ''}`
  );
  return {
    status: 'skipped',
    reason: 'anchor-mismatch',
    sourceName: firstAnchorErrorSourceName,
    details: firstAnchorError?.message ?? null,
    candidates: candidateDetails || null
  };
}

function detectUpstreamNewThreadModelSupport(bundleSourcesByAsset) {
  let collaborationModeSourceName = null;
  let startParamsSourceName = null;
  let composerSourceName = null;

  for (const [assetName, bundleSource] of bundleSourcesByAsset) {
    if (
      collaborationModeSourceName == null &&
      hasUpstreamNewThreadModelCollaborationMode(bundleSource)
    ) {
      collaborationModeSourceName = assetName;
    }
    if (startParamsSourceName == null && hasUpstreamNewThreadModelStartParams(bundleSource)) {
      startParamsSourceName = assetName;
    }
    if (composerSourceName == null && hasUpstreamNewThreadModelComposerSubmit(bundleSource)) {
      composerSourceName = assetName;
    }
  }

  const supported =
    collaborationModeSourceName != null && startParamsSourceName != null && composerSourceName != null;
  return {
    supported,
    sourceName: supported
      ? [collaborationModeSourceName, startParamsSourceName, composerSourceName].join(',')
      : null
  };
}

function hasUpstreamNewThreadModelCollaborationMode(bundleSource) {
  const hasLegacyCollaborationModeFlow =
    bundleSource.includes('from"./use-model-settings-') &&
    bundleSource.includes('modelSettings:') &&
    bundleSource.includes('settings:{model:') &&
    bundleSource.includes('reasoning_effort:') &&
    bundleSource.includes('activeMode:') &&
    bundleSource.includes('setSelectedMode:') &&
    /\.\.\.[A-Za-z_$][\w$]*\.settings,model:[A-Za-z_$][\w$]*\.model,reasoning_effort:[A-Za-z_$][\w$]*\.reasoningEffort/.test(
      bundleSource
    );
  const hasPendingSettingsFlow =
    bundleSource.includes('setModelAndReasoningEffortForNextTurn') &&
    bundleSource.includes('setModelAndReasoningEffort:') &&
    bundleSource.includes('modelSettings:') &&
    bundleSource.includes('activeMode:') &&
    bundleSource.includes('selectedMode:') &&
    bundleSource.includes('setSelectedMode:') &&
    /\{model:[A-Za-z_$][\w$]*,reasoningEffort:[A-Za-z_$][\w$]*\},\(\)=>[A-Za-z_$][\w$]*\(/.test(
      bundleSource
    ) &&
    /\.\.\.[A-Za-z_$][\w$]*\.settings,model:[A-Za-z_$][\w$]*\.model,reasoning_effort:[A-Za-z_$][\w$]*\.reasoningEffort/.test(
      bundleSource
    );
  return hasLegacyCollaborationModeFlow || hasPendingSettingsFlow;
}

function hasUpstreamNewThreadModelStartParams(bundleSource) {
  const hasStartParamsFunction =
    /function [A-Za-z_$][\w$]*\(\{[^}]*collaborationMode:(?<modeVar>[A-Za-z_$][\w$]*)[^}]*\}\)\{/.test(
      bundleSource
    );
  const hasLegacyPayload =
    /return\{[^}]*input:[A-Za-z_$][\w$]*,[^}]*workspaceRoots:[A-Za-z_$][\w$]*,[^}]*collaborationMode:[A-Za-z_$][\w$]*/.test(
      bundleSource
    );
  const hasCurrentPayload =
    /\{input:[A-Za-z_$][\w$]*,[^}]*workspaceRoots:[A-Za-z_$][\w$]*,[^}]*collaborationMode:[A-Za-z_$][\w$]*/.test(
      bundleSource
    );
  return (
    hasStartParamsFunction &&
    (hasLegacyPayload || hasCurrentPayload) &&
    bundleSource.includes('approvalsReviewer') &&
    bundleSource.includes('workspaceKind:')
  );
}

function hasUpstreamNewThreadModelComposerSubmit(bundleSource) {
  return (
    bundleSource.includes('activeCollaborationMode:') &&
    bundleSource.includes('setEffectiveCollaborationMode') &&
    bundleSource.includes('startConversationWithPrimaryRuntimeForFirstTurn') &&
    bundleSource.includes('collaborationMode:') &&
    bundleSource.includes('startConversationParamsInput') &&
    /collaborationMode:[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?,memoryPreferences:/.test(
      bundleSource
    )
  );
}

export function applyLinuxNewThreadModelPatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxNewThreadModelPatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxNewThreadModelPatch(bundleSource, options = {}) {
  if (bundleSource.includes(LINUX_NEW_THREAD_MODEL_PATCH_MARKER)) {
    return bundleSource;
  }

  try {
    let updated = injectLinuxNewThreadModelStatePatch(bundleSource, options);
    updated = injectLinuxNewThreadModelSubmitPatch(updated, options);
    return updated;
  } catch (error) {
    if (isNewThreadModelPatchAnchorError(error)) {
      throw new Error(buildNewThreadModelPatchErrorMessage(bundleSource, options.sourceName));
    }
    throw error;
  }
}

function applyLinuxNewThreadModelStatePatch(bundleSource, options = {}) {
  const updated = injectLinuxNewThreadModelStatePatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

function injectLinuxNewThreadModelStatePatch(bundleSource, options = {}) {
  if (bundleSource.includes(LINUX_NEW_THREAD_MODEL_PATCH_MARKER)) {
    return bundleSource;
  }

  const errorMessage = buildNewThreadModelStatePatchErrorMessage(bundleSource, options.sourceName);
  if (bundleSource.includes(NEW_THREAD_MODEL_STATE_SNIPPET_26_406)) {
    let updated = bundleSource;
    updated = replaceSnippetOrThrow(
      updated,
      NEW_THREAD_MODEL_STATE_SNIPPET_26_406,
      NEW_THREAD_MODEL_STATE_REPLACEMENT_26_406,
      errorMessage
    );
    updated = replaceSnippetOrThrow(
      updated,
      NEW_THREAD_MODEL_SETTER_SNIPPET_26_406,
      NEW_THREAD_MODEL_SETTER_REPLACEMENT_26_406,
      errorMessage
    );
    return updated;
  }

  if (
    bundleSource.includes(NEW_THREAD_MODEL_STATE_SNIPPET_26_415) ||
    NEW_THREAD_MODEL_STATE_PATTERN_26_415.test(bundleSource)
  ) {
    let updated = patchNewThreadModelState26_415(bundleSource, errorMessage);
    updated = replaceSnippetOrThrow(
      updated,
      NEW_THREAD_MODEL_SETTINGS_SNIPPET_26_415,
      NEW_THREAD_MODEL_SETTINGS_REPLACEMENT_26_415,
      errorMessage
    );
    updated = patchNewThreadModelSetter26_415(updated, errorMessage);
    updated = patchNewThreadModelFreshEffect26_415(updated, errorMessage);
    return updated;
  }

  if (bundleSource.includes(NEW_THREAD_MODEL_STATE_SNIPPET_26_422)) {
    let updated = bundleSource;
    updated = replaceSnippetOrThrow(
      updated,
      NEW_THREAD_MODEL_STATE_SNIPPET_26_422,
      NEW_THREAD_MODEL_STATE_REPLACEMENT_26_422,
      errorMessage
    );
    updated = replaceSnippetOrThrow(
      updated,
      NEW_THREAD_MODEL_SETTINGS_SNIPPET_26_422,
      NEW_THREAD_MODEL_SETTINGS_REPLACEMENT_26_422,
      errorMessage
    );
    updated = replaceSnippetOrThrow(
      updated,
      NEW_THREAD_MODEL_SETTER_SNIPPET_26_422,
      NEW_THREAD_MODEL_SETTER_REPLACEMENT_26_422,
      errorMessage
    );
    return updated;
  }

  if (bundleSource.includes(NEW_THREAD_MODEL_STATE_SNIPPET_26_422_71525)) {
    let updated = bundleSource;
    updated = replaceSnippetOrThrow(
      updated,
      NEW_THREAD_MODEL_STATE_SNIPPET_26_422_71525,
      NEW_THREAD_MODEL_STATE_REPLACEMENT_26_422_71525,
      errorMessage
    );
    updated = replaceSnippetOrThrow(
      updated,
      NEW_THREAD_MODEL_SETTINGS_SNIPPET_26_422_71525,
      NEW_THREAD_MODEL_SETTINGS_REPLACEMENT_26_422_71525,
      errorMessage
    );
    updated = replaceSnippetOrThrow(
      updated,
      NEW_THREAD_MODEL_SETTER_SNIPPET_26_422_71525,
      NEW_THREAD_MODEL_SETTER_REPLACEMENT_26_422_71525,
      errorMessage
    );
    return updated;
  }

  if (bundleSource.includes(NEW_THREAD_MODEL_STATE_SNIPPET_26_519)) {
    let updated = bundleSource;
    updated = replaceSnippetOrThrow(
      updated,
      NEW_THREAD_MODEL_STATE_SNIPPET_26_519,
      NEW_THREAD_MODEL_STATE_REPLACEMENT_26_519,
      errorMessage
    );
    updated = replaceSnippetOrThrow(
      updated,
      NEW_THREAD_MODEL_SETTINGS_SNIPPET_26_519,
      NEW_THREAD_MODEL_SETTINGS_REPLACEMENT_26_519,
      errorMessage
    );
    updated = replaceSnippetOrThrow(
      updated,
      NEW_THREAD_MODEL_SETTER_SNIPPET_26_519,
      NEW_THREAD_MODEL_SETTER_REPLACEMENT_26_519,
      errorMessage
    );
    return updated;
  }

  let updated = bundleSource;
  updated = replaceSnippetOrThrow(
    updated,
    NEW_THREAD_MODEL_STATE_SNIPPET_CURRENT,
    NEW_THREAD_MODEL_STATE_REPLACEMENT_CURRENT,
    errorMessage
  );
  updated = replaceSnippetOrThrow(
    updated,
    NEW_THREAD_MODEL_SETTINGS_SNIPPET_CURRENT,
    NEW_THREAD_MODEL_SETTINGS_REPLACEMENT_CURRENT,
    errorMessage
  );
  updated = replaceSnippetOrThrow(
    updated,
    NEW_THREAD_MODEL_SETTER_SNIPPET_CURRENT,
    NEW_THREAD_MODEL_SETTER_REPLACEMENT_CURRENT,
    errorMessage
  );
  return updated;
}

function patchNewThreadModelState26_415(bundleSource, errorMessage) {
  if (bundleSource.includes(NEW_THREAD_MODEL_STATE_SNIPPET_26_415)) {
    return replaceSnippetOrThrow(
      bundleSource,
      NEW_THREAD_MODEL_STATE_SNIPPET_26_415,
      NEW_THREAD_MODEL_STATE_REPLACEMENT_26_415,
      errorMessage
    );
  }

  return replaceRegexOrThrow(
    bundleSource,
    NEW_THREAD_MODEL_STATE_PATTERN_26_415,
    ({ modelVar, stateVar }) =>
      `let y=${modelVar},b=s?.authMethod===\`copilot\`,codexLinuxIsFreshComposer=n==null||!p,[codexLinuxPendingModelSettings,codexLinuxSetPendingModelSettings]=(0,K.useState)(null),${stateVar};`,
    errorMessage
  );
}

function patchNewThreadModelSetter26_415(bundleSource, errorMessage) {
  if (bundleSource.includes(NEW_THREAD_MODEL_SETTER_SNIPPET_26_415)) {
    return replaceSnippetOrThrow(
      bundleSource,
      NEW_THREAD_MODEL_SETTER_SNIPPET_26_415,
      NEW_THREAD_MODEL_SETTER_REPLACEMENT_26_415,
      errorMessage
    );
  }

  return replaceRegexOrThrow(
    bundleSource,
    NEW_THREAD_MODEL_SETTER_PATTERN_26_415,
    ({ tryBody, catchBody }) =>
      `?(D=async(e,t)=>{try{codexLinuxIsFreshComposer&&codexLinuxSetPendingModelSettings({model:e,reasoningEffort:t,cwd:l});${tryBody}}catch(e){codexLinuxIsFreshComposer&&codexLinuxSetPendingModelSettings(null);${catchBody}}},`,
    errorMessage
  );
}

function patchNewThreadModelFreshEffect26_415(bundleSource, errorMessage) {
  if (bundleSource.includes(NEW_THREAD_MODEL_FRESH_EFFECT_INSERTION_26_415)) {
    return bundleSource;
  }

  const selectorMarkerIndex = bundleSource.indexOf(NEW_THREAD_MODEL_SELECTOR_MARKER_26_415);
  if (selectorMarkerIndex === -1) {
    throw new NewThreadModelPatchAnchorError(errorMessage);
  }

  const selectorFunctionStart = bundleSource.lastIndexOf(
    NEW_THREAD_MODEL_SELECTOR_FUNCTION_MARKER_26_415,
    selectorMarkerIndex
  );
  if (selectorFunctionStart === -1) {
    throw new NewThreadModelPatchAnchorError(errorMessage);
  }

  const nextFunctionStart = bundleSource.indexOf(
    NEW_THREAD_MODEL_SELECTOR_FUNCTION_MARKER_26_415,
    selectorMarkerIndex + NEW_THREAD_MODEL_SELECTOR_MARKER_26_415.length
  );
  const selectorFunctionEnd = nextFunctionStart === -1 ? bundleSource.length : nextFunctionStart;
  const selectorFunctionSource = bundleSource.slice(selectorFunctionStart, selectorFunctionEnd);
  const anchorIndex = selectorFunctionSource.indexOf(NEW_THREAD_MODEL_FRESH_EFFECT_ANCHOR_26_415);
  if (anchorIndex === -1) {
    throw new NewThreadModelPatchAnchorError(errorMessage);
  }

  const patchedSelectorFunctionSource = `${selectorFunctionSource.slice(0, anchorIndex)}${NEW_THREAD_MODEL_FRESH_EFFECT_INSERTION_26_415}${selectorFunctionSource.slice(anchorIndex)}`;
  return `${bundleSource.slice(0, selectorFunctionStart)}${patchedSelectorFunctionSource}${bundleSource.slice(selectorFunctionEnd)}`;
}

function applyLinuxNewThreadModelSubmitPatch(bundleSource, options = {}) {
  const updated = injectLinuxNewThreadModelSubmitPatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

function injectLinuxNewThreadModelSubmitPatch(bundleSource, options = {}) {
  if (bundleSource.includes(LINUX_NEW_THREAD_MODEL_SUBMIT_PATCH_MARKER)) {
    return bundleSource;
  }

  const errorMessage = buildNewThreadModelSubmitPatchErrorMessage(bundleSource, options.sourceName);
  if (bundleSource.includes(NEW_THREAD_MODEL_SUBMIT_SNIPPET_26_406)) {
    return replaceSnippetOrThrow(
      bundleSource,
      NEW_THREAD_MODEL_SUBMIT_SNIPPET_26_406,
      NEW_THREAD_MODEL_SUBMIT_REPLACEMENT_26_406,
      errorMessage
    );
  }

  if (bundleSource.includes(NEW_THREAD_MODEL_SUBMIT_SNIPPET_26_415)) {
    return replaceSnippetOrThrow(
      bundleSource,
      NEW_THREAD_MODEL_SUBMIT_SNIPPET_26_415,
      NEW_THREAD_MODEL_SUBMIT_REPLACEMENT_26_415,
      errorMessage
    );
  }

  if (bundleSource.includes(NEW_THREAD_MODEL_SUBMIT_SNIPPET_26_417)) {
    return replaceSnippetOrThrow(
      bundleSource,
      NEW_THREAD_MODEL_SUBMIT_SNIPPET_26_417,
      NEW_THREAD_MODEL_SUBMIT_REPLACEMENT_26_417,
      errorMessage
    );
  }

  if (bundleSource.includes(NEW_THREAD_MODEL_SUBMIT_SNIPPET_26_422)) {
    return replaceSnippetOrThrow(
      bundleSource,
      NEW_THREAD_MODEL_SUBMIT_SNIPPET_26_422,
      NEW_THREAD_MODEL_SUBMIT_REPLACEMENT_26_422,
      errorMessage
    );
  }

  if (bundleSource.includes(NEW_THREAD_MODEL_SUBMIT_SNIPPET_26_422_71525)) {
    return replaceSnippetOrThrow(
      bundleSource,
      NEW_THREAD_MODEL_SUBMIT_SNIPPET_26_422_71525,
      NEW_THREAD_MODEL_SUBMIT_REPLACEMENT_26_422_71525,
      errorMessage
    );
  }

  if (bundleSource.includes(NEW_THREAD_MODEL_SUBMIT_SNIPPET_26_519)) {
    return replaceSnippetOrThrow(
      bundleSource,
      NEW_THREAD_MODEL_SUBMIT_SNIPPET_26_519,
      NEW_THREAD_MODEL_SUBMIT_REPLACEMENT_26_519,
      errorMessage
    );
  }

  return replaceSnippetOrThrow(
    bundleSource,
    NEW_THREAD_MODEL_SUBMIT_SNIPPET_CURRENT,
    NEW_THREAD_MODEL_SUBMIT_REPLACEMENT_CURRENT,
    errorMessage
  );
}

function isNewThreadModelPatchAnchorError(error) {
  return (
    error instanceof Error && error.message.startsWith(NEW_THREAD_MODEL_PATCH_BASE_ERROR_MESSAGE)
  );
}

export async function patchRendererTodoProgressBundle(extractedAppDir, logger) {
  const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
  const assetNames = await fs.promises.readdir(assetsDir);
  const jsAssets = assetNames.filter((name) => name.endsWith('.js'));
  let sawCandidate = false;
  let firstAnchorError = null;
  let firstAnchorErrorSourceName = null;

  for (const assetName of jsAssets) {
    const assetPath = path.join(assetsDir, assetName);
    const original = await fs.promises.readFile(assetPath, 'utf8');
    const analysis = analyzeTodoProgressBundle(original);
    const isCandidate =
      analysis.detected.todoListCase &&
      analysis.detected.expandedTodoSummary &&
      analysis.detected.compactTodoSummary;

    if (!isCandidate) {
      continue;
    }

    sawCandidate = true;
    logger.info(`Resolved renderer todo progress bundle ${assetName}`);

    let result;
    try {
      result = applyLinuxTodoProgressPatch(original, { sourceName: assetName });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith(TODO_PROGRESS_PATCH_BASE_ERROR_MESSAGE)
      ) {
        if (!firstAnchorError) {
          firstAnchorError = error;
          firstAnchorErrorSourceName = assetName;
        }
        logger.warn(
          `Skipping Linux todo progress patch for ${assetName} because bundle anchors were not compatible: ${error.message}`
        );
        continue;
      }
      throw error;
    }

    if (result.updated !== original) {
      await fs.promises.writeFile(assetPath, result.updated, 'utf8');
      logger.info(`Patched Linux todo progress rendering into renderer bundle ${assetName}`);
    }
    return {
      status: result.status,
      sourceName: assetName
    };
  }

  if (!sawCandidate) {
    logger.warn(
      'Skipping Linux todo progress patch because no todo-progress renderer candidate bundle was detected.'
    );
    return {
      status: 'skipped',
      reason: 'bundle-not-found'
    };
  }

  logger.warn(
    `Skipping Linux todo progress patch because renderer candidates were incompatible with the expected cache-shape anchors.${firstAnchorErrorSourceName ? ` Source: ${firstAnchorErrorSourceName}.` : ''}`
  );
  return {
    status: 'skipped',
    reason: 'anchor-mismatch',
    sourceName: firstAnchorErrorSourceName,
    details: firstAnchorError?.message ?? null
  };
}

export function applyLinuxTodoProgressPatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxTodoProgressPatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxTodoProgressPatch(bundleSource, options = {}) {
  if (bundleSource.includes(LINUX_TODO_PROGRESS_PATCH_MARKER)) {
    return bundleSource;
  }

  const errorMessage = buildTodoProgressPatchErrorMessage(bundleSource, options.sourceName);
  const componentNames = resolveTodoComponentNames(bundleSource);
  if (!componentNames.expanded || !componentNames.compact) {
    throw new Error(errorMessage);
  }

  let includeMarker = true;
  let updated = bundleSource;
  updated = patchTodoPlanComponentCacheSignatures({
    source: updated,
    anchorMarker: 'localConversationPage.planItemsCompleted',
    errorMessage,
    includeMarker: () => {
      const nextValue = includeMarker;
      includeMarker = false;
      return nextValue;
    }
  });
  updated = patchTodoPlanComponentCacheSignatures({
    source: updated,
    anchorMarker: 'codex.plan.tasksCompletedSummary',
    errorMessage,
    includeMarker: () => {
      const nextValue = includeMarker;
      includeMarker = false;
      return nextValue;
    }
  });
  updated = patchTodoCompactItemRenderCache({
    source: updated,
    errorMessage,
    compactComponentName: componentNames.compact,
    includeMarker: () => {
      const nextValue = includeMarker;
      includeMarker = false;
      return nextValue;
    }
  });
  updated = patchTodoExpandedItemRenderCache({
    source: updated,
    errorMessage,
    expandedComponentName: componentNames.expanded,
    includeMarker: () => {
      const nextValue = includeMarker;
      includeMarker = false;
      return nextValue;
    }
  });
  return updated;
}

export async function patchRendererLinuxVisualCompat(extractedAppDir, logger) {
  const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
  const assetNames = await fs.promises.readdir(assetsDir);
  const cssAssets = assetNames.filter((name) => name.endsWith('.css'));
  const jsAssets = assetNames.filter((name) => name.endsWith('.js'));
  let cssResult = null;
  let jsResult = null;
  let cssSourceName = null;
  let jsSourceName = null;
  let firstCssError = null;
  let firstCssErrorSourceName = null;
  let firstJsError = null;
  let firstJsErrorSourceName = null;

  for (const assetName of cssAssets) {
    const assetPath = path.join(assetsDir, assetName);
    const original = await fs.promises.readFile(assetPath, 'utf8');
    const isCandidate = LINUX_VISUAL_COMPAT_CSS_CANDIDATE_MARKER_SETS.some((markerSet) =>
      markerSet.every((marker) => original.includes(marker))
    );

    if (!isCandidate) {
      continue;
    }

    cssSourceName = assetName;
    logger.info(`Resolved renderer Linux visual-compat stylesheet ${assetName}`);

    try {
      cssResult = applyLinuxVisualCompatCssPatch(original, { sourceName: assetName });
      if (cssResult.updated !== original) {
        await fs.promises.writeFile(assetPath, cssResult.updated, 'utf8');
        logger.info(`Patched Linux visual-compat CSS into renderer asset ${assetName}`);
      }
      break;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith(LINUX_VISUAL_COMPAT_CSS_PATCH_BASE_ERROR_MESSAGE)
      ) {
        if (!firstCssError) {
          firstCssError = error;
          firstCssErrorSourceName = assetName;
        }
        logger.warn(
          `Skipping Linux visual-compat CSS patch for ${assetName} because bundle anchors were not compatible: ${error.message}`
        );
        continue;
      }
      throw error;
    }
  }

  for (const assetName of jsAssets) {
    const assetPath = path.join(assetsDir, assetName);
    const original = await fs.promises.readFile(assetPath, 'utf8');
    const isCandidate = LINUX_VISUAL_COMPAT_JS_CANDIDATE_MARKERS.every((marker) =>
      original.includes(marker)
    );

    if (!isCandidate) {
      continue;
    }

    jsSourceName = assetName;
    logger.info(`Resolved renderer Linux visual-compat script ${assetName}`);

    try {
      jsResult = applyLinuxVisualCompatJsPatch(original, { sourceName: assetName });
      if (jsResult.updated !== original) {
        await fs.promises.writeFile(assetPath, jsResult.updated, 'utf8');
        logger.info(`Patched Linux visual-compat JS into renderer asset ${assetName}`);
      }
      break;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith(LINUX_VISUAL_COMPAT_JS_PATCH_BASE_ERROR_MESSAGE)
      ) {
        if (!firstJsError) {
          firstJsError = error;
          firstJsErrorSourceName = assetName;
        }
        logger.warn(
          `Skipping Linux visual-compat JS patch for ${assetName} because bundle anchors were not compatible: ${error.message}`
        );
        continue;
      }
      throw error;
    }
  }

  if (!cssResult) {
    if (firstCssError) {
      logger.warn(
        `Skipping Linux visual-compat CSS patch because renderer candidates were incompatible with the expected anchors.${firstCssErrorSourceName ? ` Source: ${firstCssErrorSourceName}.` : ''}`
      );
    } else {
      logger.warn(
        'Skipping Linux visual-compat CSS patch because no renderer stylesheet candidate bundle was detected.'
      );
    }
    cssResult = {
      status: 'skipped',
      reason: firstCssError ? 'anchor-mismatch' : 'bundle-not-found',
      sourceName: firstCssErrorSourceName,
      details: firstCssError?.message ?? null
    };
  }
  if (!jsResult) {
    if (firstJsError) {
      logger.warn(
        `Skipping Linux visual-compat JS patch because renderer candidates were incompatible with the expected anchors.${firstJsErrorSourceName ? ` Source: ${firstJsErrorSourceName}.` : ''}`
      );
    } else {
      logger.warn(
        'Skipping Linux visual-compat JS patch because no renderer script candidate bundle was detected.'
      );
    }
    jsResult = {
      status: 'skipped',
      reason: firstJsError ? 'anchor-mismatch' : 'bundle-not-found',
      sourceName: firstJsErrorSourceName,
      details: firstJsError?.message ?? null
    };
  }

  const hasSkippedSubpatch = cssResult.status === 'skipped' || jsResult.status === 'skipped';
  return {
    status: hasSkippedSubpatch
      ? 'skipped'
      : cssResult.status === 'already-applied' && jsResult.status === 'already-applied'
        ? 'already-applied'
        : 'applied',
    sourceName: `${cssSourceName ?? 'none'},${jsSourceName ?? 'none'}`,
    reason: hasSkippedSubpatch ? 'partial-or-unavailable' : undefined
  };
}

export function applyLinuxVisualCompatCssPatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxVisualCompatCssPatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxVisualCompatCssPatch(bundleSource, options = {}) {
  if (bundleSource.includes(LINUX_VISUAL_COMPAT_PATCH_MARKER)) {
    return bundleSource;
  }

  const analysis = analyzeLinuxVisualCompatCssBundle(bundleSource);
  if (analysis.missingAnchors.length > 0) {
    throw new Error(
      buildPatchErrorMessage(
        LINUX_VISUAL_COMPAT_CSS_PATCH_BASE_ERROR_MESSAGE,
        options.sourceName,
        analysis
      )
    );
  }

  return `${bundleSource}\n${buildLinuxVisualCompatCssOverride()}\n`;
}

export function applyLinuxVisualCompatJsPatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxVisualCompatJsPatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxVisualCompatJsPatch(bundleSource, options = {}) {
  if (bundleSource.includes(LINUX_TITLE_BAR_OVERLAY_THEME_SYNC_PATCH_MARKER)) {
    return bundleSource;
  }
  if (bundleSource.includes(LINUX_VISUAL_COMPAT_PATCH_MARKER)) {
    const updated = bundleSource.replace(
      /classList\.toggle\(`codex-linux-visual-compat`,r\);/,
      (match) => `${match}${buildLinuxTitleBarOverlayThemeSyncJs()}`
    );
    if (updated === bundleSource) {
      throw new Error(buildLinuxVisualCompatJsPatchErrorMessage(bundleSource, options.sourceName));
    }
    return updated;
  }

  return replaceFirstMatchingRegexOrThrow(
    bundleSource,
    [
      {
        pattern: LINUX_VISUAL_COMPAT_JS_TARGET_PATTERN,
        replacement: ({
          elementVar,
          windowStateVar,
          legacyWindowStateVar,
          extraOpaqueCondition,
          opaqueGuardFn
        }) => {
          const resolvedWindowStateVar = windowStateVar ?? legacyWindowStateVar;
          const upstreamOpaqueCondition = `${resolvedWindowStateVar}.opaqueWindows${extraOpaqueCondition ?? ''}`;
          return buildLinuxVisualCompatJsReplacement({
            elementVar,
            opaqueGuardFn,
            upstreamOpaqueCondition
          });
        }
      },
      {
        pattern: LINUX_VISUAL_COMPAT_JS_TARGET_SIMPLE_PATTERN,
        replacement: ({ elementVar, opaqueCondition, opaqueGuardFn }) =>
          buildLinuxVisualCompatJsReplacement({
            elementVar,
            opaqueGuardFn,
            upstreamOpaqueCondition: opaqueCondition
          })
      }
    ],
    buildLinuxVisualCompatJsPatchErrorMessage(bundleSource, options.sourceName)
  );
}

function buildLinuxVisualCompatJsReplacement({
  elementVar,
  opaqueGuardFn,
  upstreamOpaqueCondition
}) {
  return `if(${elementVar}){/* codexLinuxVisualCompat */let t=document.documentElement.dataset.codexOs===\`linux\`,n=!1;try{n=process?.env?.CODEX_DESKTOP_DISABLE_LINUX_VISUAL_COMPAT===\`1\`}catch{}let r=t&&!n;${elementVar}.classList.toggle(\`codex-linux-visual-compat\`,r);${buildLinuxTitleBarOverlayThemeSyncJs(`document.body??${elementVar}??document.documentElement`)}${buildLinuxRightPanelTabMetricsJs()}if((${upstreamOpaqueCondition}||r)&&!${opaqueGuardFn}()){${elementVar}.classList.add(\`electron-opaque\`);return}${elementVar}.classList.remove(\`electron-opaque\`)}`;
}

function buildLinuxTitleBarOverlayThemeSyncJs(
  targetExpression = 'document.body??document.documentElement'
) {
  return `if(r){let i=()=>{try{let codexLinuxTitleBarOverlayTarget=${targetExpression};if(!codexLinuxTitleBarOverlayTarget)return;let codexLinuxTitleBarOverlayProbe=document.createElement(\`span\`);codexLinuxTitleBarOverlayProbe.style.cssText=\`position:absolute;left:-9999px;top:-9999px;pointer-events:none;color:var(--color-token-foreground,var(--color-token-description-foreground));background:var(--color-background-surface-under,var(--color-token-editor-background))\`,codexLinuxTitleBarOverlayTarget.appendChild(codexLinuxTitleBarOverlayProbe);let t=getComputedStyle(codexLinuxTitleBarOverlayProbe),n=t.backgroundColor,a=t.color;codexLinuxTitleBarOverlayProbe.remove();if(!n||!a||n===\`rgba(0, 0, 0, 0)\`)return;let o=\`\${n}|\${a}\`;if(globalThis.codexLinuxTitleBarOverlayThemeSyncLast===o)return;globalThis.codexLinuxTitleBarOverlayThemeSyncLast=o,window.electronBridge?.sendMessageFromView?.({type:\`codex-linux-title-bar-overlay-theme-set\`,color:n,symbolColor:a})?.catch?.(()=>{})}catch{}};i(),globalThis.codexLinuxTitleBarOverlayThemeSync||(globalThis.codexLinuxTitleBarOverlayThemeSync=1,globalThis.MutationObserver&&(()=>{let e={attributes:!0,attributeFilter:[\`class\`,\`style\`,\`data-theme\`,\`data-codex-theme\`,\`data-codex-color-scheme\`]},t=n=>{try{n&&new MutationObserver(i).observe(n,e)}catch{}};t(document.documentElement),t(document.body),t(${targetExpression})})(),window.electronBridge?.subscribeToSystemThemeVariant?.(i),setTimeout(i,50),setTimeout(i,300),setTimeout(i,1000),setInterval(i,1000))}/* ${LINUX_TITLE_BAR_OVERLAY_THEME_SYNC_PATCH_MARKER} */`;
}

export async function patchRendererLinuxBrowserViewportSurfaceBundle(extractedAppDir, logger) {
  const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
  const assetNames = await fs.promises.readdir(assetsDir);
  const jsAssets = assetNames.filter((name) => name.endsWith('.js'));
  let sawCandidate = false;
  let firstAnchorError = null;
  let firstAnchorErrorSourceName = null;

  for (const assetName of jsAssets) {
    const assetPath = path.join(assetsDir, assetName);
    const original = await fs.promises.readFile(assetPath, 'utf8');
    const isCandidate = LINUX_BROWSER_VIEWPORT_SURFACE_CANDIDATE_MARKERS.every((marker) =>
      original.includes(marker)
    );
    if (!isCandidate) {
      continue;
    }

    sawCandidate = true;
    logger.info(`Resolved renderer Browser viewport surface bundle ${assetName}`);

    let result;
    try {
      result = applyLinuxBrowserViewportSurfacePatch(original, { sourceName: assetName });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith(LINUX_BROWSER_VIEWPORT_SURFACE_PATCH_BASE_ERROR_MESSAGE)
      ) {
        if (!firstAnchorError) {
          firstAnchorError = error;
          firstAnchorErrorSourceName = assetName;
        }
        logger.warn(
          `Skipping Linux Browser viewport surface patch for ${assetName} because bundle anchors were not compatible: ${error.message}`
        );
        continue;
      }
      throw error;
    }

    if (result.updated !== original) {
      await fs.promises.writeFile(assetPath, result.updated, 'utf8');
      logger.info(`Patched Linux Browser viewport surface into renderer bundle ${assetName}`);
    }
    return {
      status: result.status,
      sourceName: assetName
    };
  }

  if (!sawCandidate) {
    logger.warn(
      'Skipping Linux Browser viewport surface patch because no renderer candidate bundle was detected.'
    );
    return {
      status: 'skipped',
      reason: 'bundle-not-found'
    };
  }

  logger.warn(
    `Skipping Linux Browser viewport surface patch because renderer candidates were incompatible with the expected anchors.${firstAnchorErrorSourceName ? ` Source: ${firstAnchorErrorSourceName}.` : ''}`
  );
  return {
    status: 'skipped',
    reason: 'anchor-mismatch',
    sourceName: firstAnchorErrorSourceName,
    details: firstAnchorError?.message ?? null
  };
}

export function applyLinuxBrowserViewportSurfacePatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxBrowserViewportSurfacePatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxBrowserViewportSurfacePatch(bundleSource, options = {}) {
  const hasViewportMarker = bundleSource.includes(LINUX_BROWSER_VIEWPORT_SURFACE_PATCH_MARKER);
  const hasPanelHostMarker = bundleSource.includes(LINUX_BROWSER_WEBVIEW_PANEL_HOST_PATCH_MARKER);
  const hasVisibleWhenUrlMarker = bundleSource.includes(
    LINUX_BROWSER_WEBVIEW_VISIBLE_WHEN_URL_PATCH_MARKER
  );
  const hasManagedWebviewHost = hasLinuxBrowserManagedWebviewHost(bundleSource);
  const hasImportedManagedWebviewHost = hasLinuxBrowserImportedManagedWebviewHost(bundleSource);
  const hasManagedWebviewVisibilityFlow =
    hasLinuxBrowserManagedWebviewVisibilityFlow(bundleSource);
  const hasVisibleWhenUrl =
    LINUX_BROWSER_WEBVIEW_VISIBLE_WHEN_URL_PATTERN.test(bundleSource) ||
    LINUX_BROWSER_WEBVIEW_VISIBLE_WHEN_URL_26_527_PATTERN.test(bundleSource) ||
    LINUX_BROWSER_WEBVIEW_VISIBLE_WHEN_URL_DIRECT_PATTERN.test(bundleSource) ||
    hasManagedWebviewVisibilityFlow ||
    hasVisibleWhenUrlMarker;
  if (
    hasViewportMarker &&
    (hasPanelHostMarker || hasManagedWebviewHost || hasImportedManagedWebviewHost) &&
    hasVisibleWhenUrl
  ) {
    return bundleSource;
  }
  if (
    !hasViewportMarker &&
    (hasManagedWebviewHost || hasImportedManagedWebviewHost) &&
    hasVisibleWhenUrl &&
    !LINUX_BROWSER_VIEWPORT_SURFACE_PATTERN.test(bundleSource)
  ) {
    return bundleSource;
  }

  const errorMessage = buildLinuxBrowserViewportSurfacePatchErrorMessage(
    bundleSource,
    options.sourceName
  );
  let updated = bundleSource;
  if (!hasViewportMarker) {
    updated = replaceRegexOrThrow(
      updated,
      LINUX_BROWSER_VIEWPORT_SURFACE_PATTERN,
      ({ refVar, backgroundVar }) =>
        `ref:${refVar},"data-codex-linux-browser-viewport":!0,/* ${LINUX_BROWSER_VIEWPORT_SURFACE_PATCH_MARKER} */className:\`relative h-full min-h-0 min-w-0 overflow-hidden codex-linux-browser-viewport-surface\`,style:{backgroundColor:${backgroundVar}},children:[`,
      errorMessage
    );
  }
  if (!hasPanelHostMarker && !hasManagedWebviewHost && !hasImportedManagedWebviewHost) {
    updated = replaceRegexOrThrow(
      updated,
      LINUX_BROWSER_WEBVIEW_PANEL_HOST_SIGNATURE_PATTERN,
      ({
        componentName,
        boundsVar,
        conversationVar,
        scaleVar,
        transferVar,
        urlVar,
        visibleVar,
        webviewRefVar,
        zoomVar
      }) =>
        `function ${componentName}({bounds:${boundsVar},conversationId:${conversationVar},hostRef:codexLinuxBrowserWebviewHostRef,initialUrl:${urlVar},isVisible:${visibleVar},scale:${scaleVar},transferSourceConversationId:${transferVar},webviewRef:${webviewRefVar},windowZoom:${zoomVar}})`,
      errorMessage
    );
    updated = replaceRegexOrThrow(
      updated,
      LINUX_BROWSER_WEBVIEW_PANEL_HOST_SYNC_PATTERN,
      ({ boundsVar, managerRef, scaleVar, visibleVar, webviewRefVar, zoomVar }) =>
        `${managerRef}.current?.sync({bounds:${boundsVar},isVisible:${visibleVar},scale:${scaleVar},windowZoom:${zoomVar}},${webviewRefVar},codexLinuxBrowserWebviewHostRef)`,
      errorMessage
    );
    updated = replaceRegexOrThrow(
      updated,
      LINUX_BROWSER_WEBVIEW_PANEL_HOST_CALL_PATTERN,
      ({ prefix, zoomVar, suffix }) =>
        `${prefix}hostRef:N,windowZoom:${zoomVar}${suffix}/* ${LINUX_BROWSER_WEBVIEW_PANEL_HOST_PATCH_MARKER} */`,
      errorMessage
    );
  }
  if (!hasVisibleWhenUrlMarker) {
    updated = replaceFirstMatchingRegexOrThrow(
      updated,
      [
        {
          pattern: LINUX_BROWSER_WEBVIEW_VISIBLE_WHEN_URL_PATTERN,
          replacement: ({ prefix, suffix, urlVar, visibleVar }) =>
            `${prefix}${visibleVar}||${urlVar}!=null/* ${LINUX_BROWSER_WEBVIEW_VISIBLE_WHEN_URL_PATCH_MARKER} */${suffix}`
        },
        {
          pattern: LINUX_BROWSER_WEBVIEW_VISIBLE_WHEN_URL_26_527_PATTERN,
          replacement: ({ prefix, suffix, urlState, visibleExpr }) =>
            `${prefix}${visibleExpr}||${urlState}.length>0/* ${LINUX_BROWSER_WEBVIEW_VISIBLE_WHEN_URL_PATCH_MARKER} */${suffix}`
        },
        {
          pattern: LINUX_BROWSER_WEBVIEW_VISIBLE_WHEN_URL_DIRECT_PATTERN,
          replacement: ({ prefix, suffix, urlState, visibleVar }) =>
            `${prefix}${visibleVar}||${urlState}.length>0/* ${LINUX_BROWSER_WEBVIEW_VISIBLE_WHEN_URL_PATCH_MARKER} */${suffix}`
        }
      ],
      errorMessage
    );
  }
  return updated;
}

function hasLinuxBrowserManagedWebviewHost(bundleSource) {
  return (
    (bundleSource.includes('pt.getWebview') &&
      bundleSource.includes('shouldBootstrapWhenHidden') &&
      bundleSource.includes('shouldPaint:')) ||
    hasLinuxBrowserManagedWebviewVisibilityFlow(bundleSource) ||
    (bundleSource.includes('.getRetainedWebview(') &&
      bundleSource.includes('browser-sidebar-sync') &&
      bundleSource.includes('sync({bounds:') &&
      bundleSource.includes('webviewRef:') &&
      bundleSource.includes('windowZoom:'))
  );
}

function hasLinuxBrowserManagedWebviewVisibilityFlow(bundleSource) {
  return (
    bundleSource.includes('.getWebview(') &&
    bundleSource.includes('shouldBootstrapWhenHidden') &&
    bundleSource.includes('shouldPaint:') &&
    bundleSource.includes('browser-sidebar-sync') &&
    bundleSource.includes('webviewRef:') &&
    bundleSource.includes('windowZoom:')
  );
}

function hasLinuxBrowserImportedManagedWebviewHost(bundleSource) {
  return (
    bundleSource.includes('browser-sidebar-retained-webview-') &&
    bundleSource.includes('browser-sidebar-webview-') &&
    bundleSource.includes('browser-sidebar-sync')
  );
}

export async function patchRendererLinuxBrowserWebviewStackingBundle(extractedAppDir, logger) {
  const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
  const assetNames = await fs.promises.readdir(assetsDir);
  const jsAssets = assetNames.filter((name) => name.endsWith('.js'));
  let sawCandidate = false;
  let firstAnchorError = null;
  let firstAnchorErrorSourceName = null;

  for (const assetName of jsAssets) {
    const assetPath = path.join(assetsDir, assetName);
    const original = await fs.promises.readFile(assetPath, 'utf8');
    const isCandidate = isLinuxBrowserWebviewStackingCandidateBundle(original);
    if (!isCandidate) {
      continue;
    }

    sawCandidate = true;
    logger.info(`Resolved renderer Browser webview stacking bundle ${assetName}`);

    let result;
    try {
      result = applyLinuxBrowserWebviewStackingPatch(original, { sourceName: assetName });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith(LINUX_BROWSER_WEBVIEW_STACKING_PATCH_BASE_ERROR_MESSAGE)
      ) {
        if (!firstAnchorError) {
          firstAnchorError = error;
          firstAnchorErrorSourceName = assetName;
        }
        logger.warn(
          `Skipping Linux Browser webview stacking patch for ${assetName} because bundle anchors were not compatible: ${error.message}`
        );
        continue;
      }
      throw error;
    }

    if (result.updated !== original) {
      await fs.promises.writeFile(assetPath, result.updated, 'utf8');
      logger.info(`Patched Linux Browser webview stacking into renderer bundle ${assetName}`);
    }
    return {
      status: result.status,
      sourceName: assetName
    };
  }

  if (!sawCandidate) {
    logger.warn(
      'Skipping Linux Browser webview stacking patch because no renderer candidate bundle was detected.'
    );
    return {
      status: 'skipped',
      reason: 'bundle-not-found'
    };
  }

  logger.warn(
    `Skipping Linux Browser webview stacking patch because renderer candidates were incompatible with the expected anchors.${firstAnchorErrorSourceName ? ` Source: ${firstAnchorErrorSourceName}.` : ''}`
  );
  return {
    status: 'skipped',
    reason: 'anchor-mismatch',
    sourceName: firstAnchorErrorSourceName,
    details: firstAnchorError?.message ?? null
  };
}

export function applyLinuxBrowserWebviewStackingPatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxBrowserWebviewStackingPatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxBrowserWebviewStackingPatch(bundleSource, options = {}) {
  if (hasLinuxBrowserManagedWebviewManager(bundleSource)) {
    return bundleSource;
  }
  const hasStackingMarker = bundleSource.includes(LINUX_BROWSER_WEBVIEW_STACKING_PATCH_MARKER);
  const hasCaptureSurfaceMarker = bundleSource.includes(
    LINUX_BROWSER_WEBVIEW_CAPTURE_SURFACE_PATCH_MARKER
  );
  const hasVisibleCaptureMarker = bundleSource.includes(
    LINUX_BROWSER_WEBVIEW_VISIBLE_CAPTURE_PATCH_MARKER
  );
  const hasHostAttachMarker = bundleSource.includes(
    LINUX_BROWSER_WEBVIEW_HOST_ATTACH_PATCH_MARKER
  );
  const hasHostContainerMarker = bundleSource.includes(
    LINUX_BROWSER_WEBVIEW_HOST_CONTAINER_PATCH_MARKER
  );
  const hasDetachDelayMarker = bundleSource.includes(LINUX_BROWSER_WEBVIEW_DETACH_DELAY_PATCH_MARKER);
  const hasHostPositionMarker = bundleSource.includes(
    LINUX_BROWSER_WEBVIEW_HOST_POSITION_PATCH_MARKER
  );
  if (
    hasStackingMarker &&
    hasCaptureSurfaceMarker &&
    hasVisibleCaptureMarker &&
    hasHostAttachMarker &&
    hasHostContainerMarker &&
    hasDetachDelayMarker &&
    hasHostPositionMarker
  ) {
    return bundleSource;
  }

  const errorMessage = buildLinuxBrowserWebviewStackingPatchErrorMessage(
    bundleSource,
    options.sourceName
  );
  let updated = bundleSource;
  if (!hasHostPositionMarker) {
    updated = replaceRegexOrThrow(
      updated,
      LINUX_BROWSER_WEBVIEW_VISIBLE_FUNCTION_PATTERN,
      ({
        boundsVar,
        combinedScaleVar,
        containerVar,
        functionName,
        scaleVar,
        webviewVar,
        windowZoomVar
      }) =>
        `function ${functionName}(${containerVar},${webviewVar},${boundsVar},${scaleVar},${windowZoomVar}){let ${combinedScaleVar}=${scaleVar}*${windowZoomVar},codexLinuxBrowserHost=${containerVar}.parentElement?.dataset?.codexLinuxBrowserWebviewHost===\`panel\`?${containerVar}.parentElement.getBoundingClientRect():null,codexLinuxBrowserLeft=codexLinuxBrowserHost?Math.max(0,${boundsVar}.x*${windowZoomVar}-codexLinuxBrowserHost.x):${boundsVar}.x*${windowZoomVar},codexLinuxBrowserTop=codexLinuxBrowserHost?Math.max(0,${boundsVar}.y*${windowZoomVar}-codexLinuxBrowserHost.y):${boundsVar}.y*${windowZoomVar};Object.assign(${containerVar}.style,{contain:\`\`,height:\`\${Math.round(${boundsVar}.height*${combinedScaleVar})}px\`,left:\`\${codexLinuxBrowserLeft}px\`,opacity:\`1\`,overflow:\`hidden\`,pointerEvents:\`\`,position:codexLinuxBrowserHost?\`absolute\`:\`fixed\`,top:\`\${codexLinuxBrowserTop}px\`,transform:\`\`,transformOrigin:\`\`,visibility:\`visible\`,willChange:\`\`,width:\`\${Math.round(${boundsVar}.width*${combinedScaleVar})}px\`,zIndex:codexLinuxBrowserHost?\`1\`:\`2147483646\`/* ${LINUX_BROWSER_WEBVIEW_STACKING_PATCH_MARKER} */}),Object.assign(${webviewVar}.style,{height:\`\${${boundsVar}.height}px\`,transform:${combinedScaleVar}===1?\`\`:\`scale(\${${combinedScaleVar}})\`,transformOrigin:\`top left\`,willChange:${combinedScaleVar}===1?\`\`:\`transform\`,width:\`\${${boundsVar}.width}px\`})}/* ${LINUX_BROWSER_WEBVIEW_HOST_POSITION_PATCH_MARKER} */`,
      errorMessage
    );
  } else if (!hasStackingMarker) {
    updated = replaceRegexOrThrow(
      updated,
      LINUX_BROWSER_WEBVIEW_VISIBLE_STYLE_PATTERN,
      ({ prefix }) =>
        `${prefix}\`2147483646\`/* ${LINUX_BROWSER_WEBVIEW_STACKING_PATCH_MARKER} */`,
      errorMessage
    );
  }
  if (!hasCaptureSurfaceMarker) {
    updated = replaceRegexOrThrow(
      updated,
      LINUX_BROWSER_WEBVIEW_CAPTURE_SURFACE_PATTERN,
      ({ boundsVar }) =>
        `if(this.browserUseCaptureSurfaceSize!=null){if(this.state.isVisible&&${boundsVar}!=null){this.lastVisibleBounds=${boundsVar},B(this.container,this.webview,${boundsVar},this.state.scale,this.state.windowZoom??1);return}H(this.container,this.webview,${boundsVar});return}/* ${LINUX_BROWSER_WEBVIEW_CAPTURE_SURFACE_PATCH_MARKER} ${LINUX_BROWSER_WEBVIEW_VISIBLE_CAPTURE_PATCH_MARKER} */if(this.state.isVisible){this.lastVisibleBounds=${boundsVar},B(this.container,this.webview,${boundsVar},this.state.scale,this.state.windowZoom??1);return}`,
      errorMessage
    );
  } else if (!hasVisibleCaptureMarker) {
    updated = replaceRegexOrThrow(
      updated,
      LINUX_BROWSER_WEBVIEW_CAPTURE_SURFACE_CURRENT_PATTERN,
      ({ boundsVar }) =>
        `if(this.browserUseCaptureSurfaceSize!=null){if(this.state.isVisible&&${boundsVar}!=null){this.lastVisibleBounds=${boundsVar},B(this.container,this.webview,${boundsVar},this.state.scale,this.state.windowZoom??1);return}H(this.container,this.webview,${boundsVar});return}/* ${LINUX_BROWSER_WEBVIEW_CAPTURE_SURFACE_PATCH_MARKER} ${LINUX_BROWSER_WEBVIEW_VISIBLE_CAPTURE_PATCH_MARKER} */if(this.state.isVisible){this.lastVisibleBounds=${boundsVar},B(this.container,this.webview,${boundsVar},this.state.scale,this.state.windowZoom??1);return}`,
      errorMessage
    );
  }
  if (!hasHostAttachMarker) {
    updated = replaceRegexOrThrow(
      updated,
      LINUX_BROWSER_WEBVIEW_SYNC_METHOD_PATTERN,
      ({ backgroundVar, stateArg, webviewRefArg }) =>
        `sync(${stateArg},${webviewRefArg},codexLinuxBrowserWebviewHostRef){this.isAttached=!0,this.state=${stateArg},this.webview.style.backgroundColor=${backgroundVar},K(${webviewRefArg},this.webview),this.attachToLinuxHost(codexLinuxBrowserWebviewHostRef?.current),this.syncContainerStyle()}`,
      errorMessage
    );
    updated = replaceRegexOrThrow(
      updated,
      LINUX_BROWSER_WEBVIEW_ATTACH_METHOD_INSERT_PATTERN,
      ({ refArg }) =>
        `attachToLinuxHost(e){if(e instanceof HTMLElement){e.dataset.codexLinuxBrowserWebviewHost=\`panel\`,this.container.dataset.codexLinuxBrowserWebviewHost=\`panel\`,this.container.parentElement!==e&&e.append(this.container)}}/* ${LINUX_BROWSER_WEBVIEW_HOST_ATTACH_PATCH_MARKER} ${LINUX_BROWSER_WEBVIEW_HOST_CONTAINER_PATCH_MARKER} */detach(${refArg}){`,
      errorMessage
    );
  } else if (!hasHostContainerMarker) {
    updated = replaceRegexOrThrow(
      updated,
      LINUX_BROWSER_WEBVIEW_ATTACH_METHOD_CURRENT_PATTERN,
      () =>
        `attachToLinuxHost(e){if(e instanceof HTMLElement){e.dataset.codexLinuxBrowserWebviewHost=\`panel\`,this.container.dataset.codexLinuxBrowserWebviewHost=\`panel\`,this.container.parentElement!==e&&e.append(this.container)}}/* ${LINUX_BROWSER_WEBVIEW_HOST_ATTACH_PATCH_MARKER} ${LINUX_BROWSER_WEBVIEW_HOST_CONTAINER_PATCH_MARKER} */`,
      errorMessage
    );
  }
  if (!hasDetachDelayMarker) {
    updated = replaceRegexOrThrow(
      updated,
      LINUX_BROWSER_WEBVIEW_SYNC_METHOD_WITH_HOST_PATTERN,
      ({ backgroundVar, stateArg, webviewRefArg }) =>
        `sync(${stateArg},${webviewRefArg},codexLinuxBrowserWebviewHostRef){this.codexLinuxBrowserDetachTimer!=null&&(clearTimeout(this.codexLinuxBrowserDetachTimer),this.codexLinuxBrowserDetachTimer=null),this.isAttached=!0,this.state=${stateArg},this.webview.style.backgroundColor=${backgroundVar},K(${webviewRefArg},this.webview),this.attachToLinuxHost(codexLinuxBrowserWebviewHostRef?.current),this.syncContainerStyle()}`,
      errorMessage
    );
    if (LINUX_BROWSER_WEBVIEW_DETACH_METHOD_PATTERN.test(updated)) {
      updated = replaceRegexOrThrow(
        updated,
        LINUX_BROWSER_WEBVIEW_DETACH_METHOD_PATTERN,
        ({ backgroundVar, loggerVar, refArg }) =>
          `detach(${refArg}){this.isAttached=!1,this.codexLinuxBrowserDetachTimer!=null&&clearTimeout(this.codexLinuxBrowserDetachTimer),this.codexLinuxBrowserDetachTimer=setTimeout(()=>{if(this.isAttached)return;this.state={bounds:this.state.bounds,isVisible:!1,scale:this.state.scale,windowZoom:this.state.windowZoom},this.webview.style.backgroundColor=${backgroundVar},K(${refArg},null,this.webview),this.syncContainerStyle(),${loggerVar}.info(\`IAB_LIFECYCLE renderer detached visible browser sidebar webview\`,{safe:{conversationId:this.conversationId}})},120)}/* ${LINUX_BROWSER_WEBVIEW_DETACH_DELAY_PATCH_MARKER} */`,
        errorMessage
      );
    } else {
      updated = replaceRegexOrThrow(
        updated,
        LINUX_BROWSER_WEBVIEW_DETACH_METHOD_SIMPLE_PATTERN,
        ({ refArg }) =>
          `detach(${refArg}){this.isAttached=!1,this.codexLinuxBrowserDetachTimer!=null&&clearTimeout(this.codexLinuxBrowserDetachTimer),this.codexLinuxBrowserDetachTimer=setTimeout(()=>{if(this.isAttached)return;K(${refArg},null,this.webview),this.syncContainerStyle()},120)}/* ${LINUX_BROWSER_WEBVIEW_DETACH_DELAY_PATCH_MARKER} */`,
        errorMessage
      );
    }
  }
  return updated;
}

function isLinuxBrowserWebviewStackingCandidateBundle(bundleSource) {
  return (
    LINUX_BROWSER_WEBVIEW_STACKING_CANDIDATE_MARKERS.every((marker) =>
      bundleSource.includes(marker)
    ) || hasLinuxBrowserManagedWebviewManager(bundleSource)
  );
}

function hasLinuxBrowserManagedWebviewManager(bundleSource) {
  return (
    bundleSource.includes('data-browser-sidebar-webview-host-root') &&
    bundleSource.includes('mountGeneration:0') &&
    bundleSource.includes('shouldBootstrap') &&
    bundleSource.includes('IAB_LIFECYCLE renderer created browser sidebar webview')
  );
}

export async function patchRendererLinuxRightPanelPaneTabsBundle(extractedAppDir, logger) {
  const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
  const assetNames = await fs.promises.readdir(assetsDir);
  const jsAssets = assetNames.filter((name) => name.endsWith('.js'));
  let sawCandidate = false;
  let firstAnchorError = null;
  let firstAnchorErrorSourceName = null;

  for (const assetName of jsAssets) {
    const assetPath = path.join(assetsDir, assetName);
    const original = await fs.promises.readFile(assetPath, 'utf8');
    const isCandidate = LINUX_RIGHT_PANEL_PANE_TABS_CANDIDATE_MARKERS.every((marker) =>
      original.includes(marker)
    );
    if (!isCandidate) {
      continue;
    }

    sawCandidate = true;
    logger.info(`Resolved renderer right panel pane-tabs bundle ${assetName}`);

    let result;
    try {
      result = applyLinuxRightPanelPaneTabsPatch(original, { sourceName: assetName });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith(LINUX_RIGHT_PANEL_PANE_TABS_PATCH_BASE_ERROR_MESSAGE)
      ) {
        if (!firstAnchorError) {
          firstAnchorError = error;
          firstAnchorErrorSourceName = assetName;
        }
        logger.warn(
          `Skipping Linux right panel pane-tabs patch for ${assetName} because bundle anchors were not compatible: ${error.message}`
        );
        continue;
      }
      throw error;
    }

    if (result.updated !== original) {
      await fs.promises.writeFile(assetPath, result.updated, 'utf8');
      logger.info(`Patched Linux right panel pane tabs into renderer bundle ${assetName}`);
    }
    return {
      status: result.status,
      sourceName: assetName
    };
  }

  if (!sawCandidate) {
    logger.warn(
      'Skipping Linux right panel pane-tabs patch because no renderer candidate bundle was detected.'
    );
    return {
      status: 'skipped',
      reason: 'bundle-not-found'
    };
  }

  logger.warn(
    `Skipping Linux right panel pane-tabs patch because renderer candidates were incompatible with the expected anchors.${firstAnchorErrorSourceName ? ` Source: ${firstAnchorErrorSourceName}.` : ''}`
  );
  return {
    status: 'skipped',
    reason: 'anchor-mismatch',
    sourceName: firstAnchorErrorSourceName,
    details: firstAnchorError?.message ?? null
  };
}

export function applyLinuxRightPanelPaneTabsPatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxRightPanelPaneTabsPatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxRightPanelPaneTabsPatch(bundleSource, options = {}) {
  const hasPaneTabsMarker = bundleSource.includes(LINUX_RIGHT_PANEL_PANE_TABS_PATCH_MARKER);
  const hasTabsFirstMarker = bundleSource.includes(LINUX_RIGHT_PANEL_TABS_FIRST_PATCH_MARKER);
  const hasTabsFallbackMarker = bundleSource.includes(
    LINUX_RIGHT_PANEL_TABS_FALLBACK_PATCH_MARKER
  );
  const hasUpstreamPaneTabs = LINUX_RIGHT_PANEL_PANE_TABS_UPSTREAM_PATTERN.test(bundleSource);
  const hasDirectPaneTabsRegistrar = LINUX_RIGHT_PANEL_CHILDREN_ORDER_26_601_PATTERN.test(
    bundleSource
  );
  const hasLegacyRightPanelToolbarHeader =
    LINUX_RIGHT_PANEL_PANE_TABS_HEADER_PATTERN.test(bundleSource) &&
    LINUX_RIGHT_PANEL_PANE_TABS_BEFORE_LIST_PATTERN.test(bundleSource) &&
    LINUX_RIGHT_PANEL_PANE_TABS_AFTER_LIST_PATTERN.test(bundleSource);
  const hasUpstreamToolbarTabs = hasLinuxRightPanelUpstreamToolbarTabs(bundleSource);
  const tabsOrderState = getLinuxRightPanelTabsOrderState(bundleSource);
  if (hasUpstreamToolbarTabs && tabsOrderState === 'unknown') {
    return bundleSource;
  }
  if (
    hasUpstreamPaneTabs &&
    !hasLegacyRightPanelToolbarHeader &&
    hasTabsFirstMarker &&
    tabsOrderState === 'tabs-first'
  ) {
    return bundleSource;
  }
  if (
    hasPaneTabsMarker &&
    hasTabsFirstMarker &&
    (hasTabsFallbackMarker || hasDirectPaneTabsRegistrar) &&
    tabsOrderState === 'tabs-first'
  ) {
    return bundleSource;
  }

  const errorMessage = buildLinuxRightPanelPaneTabsPatchErrorMessage(
    bundleSource,
    options.sourceName
  );
  let updated = bundleSource;
  if (!hasPaneTabsMarker && hasLegacyRightPanelToolbarHeader) {
    updated = replaceRegexOrThrow(
      updated,
      LINUX_RIGHT_PANEL_PANE_TABS_HEADER_PATTERN,
      ({ prop }) => `${prop}:\`pane\`/* ${LINUX_RIGHT_PANEL_PANE_TABS_PATCH_MARKER} */`,
      errorMessage
    );
    updated = replaceRegexOrThrow(
      updated,
      LINUX_RIGHT_PANEL_PANE_TABS_BEFORE_LIST_PATTERN,
      ({ beforeListVar }) => `beforeList:${beforeListVar},`,
      errorMessage
    );
    updated = replaceRegexOrThrow(
      updated,
      LINUX_RIGHT_PANEL_PANE_TABS_AFTER_LIST_PATTERN,
      ({ afterListVar, expandButtonVar, jsxVar }) =>
        `afterList:(0,${jsxVar}.jsxs)(${jsxVar}.Fragment,{children:[${afterListVar},(0,${jsxVar}.jsx)(${expandButtonVar},{})]}),controller:`,
      errorMessage
    );
  }
  if (!hasTabsFirstMarker || getLinuxRightPanelTabsOrderState(updated) !== 'tabs-first') {
    const tabsVar = getLinuxRightPanelTabsVar(updated);
    updated = replaceFirstMatchingRegexOrThrow(
      updated,
      [
        {
          pattern: LINUX_RIGHT_PANEL_CHILDREN_ORDER_PATTERN,
          replacement: ({ firstVar, prefix, secondVar, suffix }) => {
            if (tabsVar != null && firstVar === tabsVar) {
              return `${prefix}${firstVar},/* ${LINUX_RIGHT_PANEL_TABS_FIRST_PATCH_MARKER} */${secondVar}${suffix}`;
            }
            if (tabsVar != null && secondVar === tabsVar) {
              return `${prefix}${secondVar},/* ${LINUX_RIGHT_PANEL_TABS_FIRST_PATCH_MARKER} */${firstVar}${suffix}`;
            }
            throw new Error(errorMessage);
          }
        },
        {
          pattern: LINUX_RIGHT_PANEL_CHILDREN_ORDER_26_601_PATTERN,
          replacement: ({ firstVar, prefix, registeredVar, secondVar, slotVar, suffix }) => {
            if (firstVar === registeredVar && secondVar === slotVar) {
              return `${prefix}${firstVar},/* ${LINUX_RIGHT_PANEL_TABS_FIRST_PATCH_MARKER} */${secondVar}${suffix}`;
            }
            if (firstVar === slotVar && secondVar === registeredVar) {
              return `${prefix}${secondVar},/* ${LINUX_RIGHT_PANEL_TABS_FIRST_PATCH_MARKER} */${firstVar}${suffix}`;
            }
            throw new Error(errorMessage);
          }
        },
        {
          pattern: LINUX_RIGHT_PANEL_CHILDREN_ORDER_26_527_PATTERN,
          replacement: ({ firstVar, prefix, registeredVar, secondVar, suffix }) => {
            if (firstVar === registeredVar) {
              return `${prefix}${firstVar},/* ${LINUX_RIGHT_PANEL_TABS_FIRST_PATCH_MARKER} */${secondVar}${suffix}`;
            }
            if (secondVar === registeredVar) {
              return `${prefix}${secondVar},/* ${LINUX_RIGHT_PANEL_TABS_FIRST_PATCH_MARKER} */${firstVar}${suffix}`;
            }
            throw new Error(errorMessage);
          }
        }
      ],
      errorMessage
    );
  }
  if (
    !hasUpstreamPaneTabs &&
    !hasTabsFallbackMarker &&
    !LINUX_RIGHT_PANEL_CHILDREN_ORDER_26_601_PATTERN.test(updated)
  ) {
    updated = replaceRegexOrThrow(
      updated,
      LINUX_RIGHT_PANEL_OUTLET_FALLBACK_PATTERN,
      ({ tabsVar }) =>
        `${tabsVar}=C(G)??(0,Q.jsx)($t,{})/* ${LINUX_RIGHT_PANEL_TABS_FALLBACK_PATCH_MARKER} */`,
      errorMessage
    );
  }
  return updated;
}

function getLinuxRightPanelTabsVar(bundleSource) {
  return LINUX_RIGHT_PANEL_OUTLET_FALLBACK_PATTERN.exec(bundleSource)?.groups?.tabsVar ?? null;
}

function getLinuxRightPanelTabsOrderState(bundleSource) {
  const tabsVar = getLinuxRightPanelTabsVar(bundleSource);
  const childrenMatch = LINUX_RIGHT_PANEL_CHILDREN_ORDER_PATTERN.exec(bundleSource);
  if (tabsVar == null || !childrenMatch?.groups) {
    const currentChildrenMatch =
      LINUX_RIGHT_PANEL_CHILDREN_ORDER_26_601_PATTERN.exec(bundleSource) ??
      LINUX_RIGHT_PANEL_CHILDREN_ORDER_26_527_PATTERN.exec(bundleSource);
    if (currentChildrenMatch?.groups) {
      const { firstVar, registeredVar, secondVar, slotVar } = currentChildrenMatch.groups;
      if (firstVar === registeredVar) {
        return 'tabs-first';
      }
      if (secondVar === registeredVar || (slotVar != null && firstVar === slotVar)) {
        return 'slot-first';
      }
    }
    return 'unknown';
  }
  if (childrenMatch.groups.firstVar === tabsVar) {
    return 'tabs-first';
  }
  if (childrenMatch.groups.secondVar === tabsVar) {
    return 'slot-first';
  }
  return 'unknown';
}

function hasLinuxRightPanelUpstreamToolbarTabs(bundleSource) {
  return (
    bundleSource.includes('data-app-shell-tab-strip-controller') &&
    bundleSource.includes('right-panel-tab-bar-header-spacer') &&
    bundleSource.includes('RightPanelTabs') &&
    bundleSource.includes('codex.rightPanel.expandFullWidth') &&
    LINUX_RIGHT_PANEL_PANE_TABS_HEADER_PATTERN.test(bundleSource) &&
    LINUX_RIGHT_PANEL_PANE_TABS_BEFORE_LIST_PATTERN.test(bundleSource) &&
    LINUX_RIGHT_PANEL_PANE_TABS_AFTER_LIST_PATTERN.test(bundleSource)
  );
}

function buildLinuxVisualCompatCssOverride() {
  return `/* ${LINUX_VISUAL_COMPAT_PATCH_MARKER} */
[data-codex-window-type=electron][data-codex-os=linux].codex-linux-visual-compat:not(.compact-window){
  background-color:var(--color-background-surface-under)!important;
  background-image:none!important
}
[data-codex-window-type=electron][data-codex-os=linux].codex-linux-visual-compat:not(.compact-window) body{
  background:var(--color-background-surface-under)!important;
  background-image:none!important;
  --color-background-elevated-primary:var(--color-background-elevated-primary-opaque)
}
[data-codex-window-type=electron][data-codex-os=linux].codex-linux-visual-compat.compact-window,
[data-codex-window-type=electron][data-codex-os=linux].codex-linux-visual-compat.compact-window body{
  background:transparent!important;
  background-image:none!important;
  background-color:transparent!important
}
[data-codex-window-type=electron][data-codex-os=linux].codex-linux-visual-compat .window-fx-sidebar-surface,
[data-codex-window-type=electron][data-codex-os=linux].codex-linux-visual-compat .app-header-tint,
[data-codex-window-type=electron][data-codex-os=linux].codex-linux-visual-compat .app-shell-left-panel{
  background:var(--color-token-side-bar-background)!important;
  background-image:none!important;
  transition:none!important
}
[data-codex-window-type=electron][data-codex-os=linux].codex-linux-visual-compat .sidebar-resize-handle-line{
  background:var(--color-token-border)!important;
  transition:none!important
}
[data-codex-window-type=electron][data-codex-os=linux].codex-linux-visual-compat .window-fx-sidebar-surface{
  transition:none!important
}
[data-codex-window-type=electron][data-codex-os=linux].codex-linux-visual-compat [data-codex-linux-browser-viewport],
[data-codex-window-type=electron][data-codex-os=linux].codex-linux-visual-compat .codex-linux-browser-viewport-surface{
  background:transparent!important;
  background-color:transparent!important;
  background-image:none!important
}
[data-codex-window-type=electron][data-codex-os=linux].codex-linux-visual-compat [data-app-shell-focus-area=right-panel] div:has(>[data-app-shell-tab-strip-controller]){
  /* ${LINUX_RIGHT_PANEL_TABS_VISIBLE_PATCH_MARKER} */
  /* ${LINUX_RIGHT_PANEL_HEADER_PASSTHROUGH_PATCH_MARKER} */
  /* ${LINUX_RIGHT_PANEL_HEADER_OFFSET_PATCH_MARKER} */
  display:flex!important;
  min-height:var(--height-toolbar)!important;
  height:var(--height-toolbar)!important;
  flex-shrink:0!important;
  margin-top:var(--height-toolbar)!important;
  position:relative!important;
  z-index:45!important;
  width:100%!important;
  max-width:100%!important;
  min-width:0!important;
  pointer-events:none!important;
  background:transparent!important;
  background-color:transparent!important;
  background-image:none!important
}
[data-codex-window-type=electron][data-codex-os=linux].codex-linux-visual-compat [data-app-shell-focus-area=right-panel] [data-app-shell-tab-strip-controller]{
  display:flex!important;
  min-height:var(--height-toolbar)!important;
  height:var(--height-toolbar)!important;
  flex-shrink:0!important;
  position:relative!important;
  z-index:45!important;
  width:max-content!important;
  max-width:100%!important;
  min-width:0!important;
  pointer-events:auto!important;
  background:var(--color-token-main-surface-primary)!important
}
[data-codex-window-type=electron][data-codex-os=linux].codex-linux-visual-compat [data-app-shell-focus-area=right-panel] [data-app-shell-tab-strip-controller]{
  flex:0 1 auto!important
}
[data-codex-window-type=electron][data-codex-os=linux].codex-linux-visual-compat [data-app-shell-focus-area=right-panel] [data-app-shell-tab-strip-controller] [role=tablist],
[data-codex-window-type=electron][data-codex-os=linux].codex-linux-visual-compat [data-app-shell-focus-area=right-panel] [data-app-shell-tab-strip-controller] [data-app-shell-tab-controller]{
  display:flex!important;
  align-items:center!important;
  min-height:28px!important;
  visibility:visible!important;
  flex-shrink:0!important
}
[data-codex-window-type=electron][data-codex-os=linux].codex-linux-visual-compat [data-app-shell-focus-area=right-panel] [data-app-shell-tab-strip-controller] [role=tablist]{
  flex:0 1 max-content!important;
  width:max-content!important;
  max-width:none!important;
  min-width:0!important;
  overflow:hidden!important
}
[data-codex-window-type=electron][data-codex-os=linux].codex-linux-visual-compat [data-app-shell-focus-area=right-panel] [data-app-shell-tab-strip-controller] [data-app-shell-tab-controller]{
  flex:0 1 max-content!important;
  min-width:min(6rem,100%)!important;
  width:max-content!important;
  max-width:min(14rem,100%)!important
}
[data-codex-window-type=electron][data-codex-os=linux].codex-linux-visual-compat [data-app-shell-focus-area=right-panel] [data-app-shell-tab-strip-controller] [role=tab]{
  display:flex!important;
  align-items:center!important;
  min-width:0!important;
  width:auto!important;
  max-width:100%!important;
  height:28px!important;
  overflow:hidden!important;
  visibility:visible!important;
  pointer-events:auto!important
}
[data-codex-window-type=electron][data-codex-os=linux].codex-linux-visual-compat [data-app-shell-focus-area=right-panel] [data-app-shell-tab-strip-controller]>div:has(>button:not([role=tab])){
  display:flex!important;
  align-items:center!important;
  width:auto!important;
  min-width:28px!important;
  flex:0 0 28px!important;
  height:28px!important;
  position:relative!important;
  margin-left:0!important;
  visibility:visible!important;
  opacity:1!important;
  pointer-events:auto!important;
  z-index:30!important
}
[data-codex-window-type=electron][data-codex-os=linux].codex-linux-visual-compat [data-app-shell-focus-area=right-panel] [data-app-shell-tab-strip-controller]>div:has(>button:not([role=tab]))>button:not([role=tab]){
  display:flex!important;
  visibility:visible!important;
  opacity:1!important;
  pointer-events:auto!important
}
[data-codex-window-type=electron][data-codex-os=linux].codex-linux-visual-compat [data-app-shell-focus-area=right-panel] div:has(>[data-app-shell-tab-strip-controller])>[role=presentation]{
  display:flex!important;
  align-items:center!important;
  min-height:var(--height-toolbar)!important;
  height:var(--height-toolbar)!important;
  flex-shrink:0!important;
  position:relative!important;
  z-index:46!important;
  pointer-events:auto!important;
  background:transparent!important;
  background-color:transparent!important;
  background-image:none!important
}
[data-codex-window-type=electron][data-codex-os=linux].codex-linux-visual-compat [data-app-shell-focus-area=right-panel] div:has(>[data-app-shell-tab-strip-controller])>[role=presentation] button{
  pointer-events:auto!important
}
[data-codex-window-type=electron][data-codex-os=linux].codex-linux-visual-compat #browser-device-preset{
  color-scheme:dark!important;
  background:var(--color-token-main-surface-primary,var(--color-background-surface-under))!important;
  color:var(--color-token-text-primary,var(--color-token-foreground))!important
}
[data-codex-window-type=electron][data-codex-os=linux].codex-linux-visual-compat #browser-device-preset option{
  background:var(--color-token-main-surface-primary,var(--color-background-surface-under))!important;
  color:var(--color-token-text-primary,var(--color-token-foreground))!important
}
[data-codex-window-type=electron][data-codex-os=linux].codex-linux-visual-compat .no-underline\\!{
  text-decoration:underline!important;
  text-underline-offset:2px
}
[data-codex-window-type=electron][data-codex-os=linux].codex-linux-visual-compat [data-browser-comment-editor-surface]:not(:has([data-browser-comment-design-prompt-shell])){
  /* ${LINUX_BROWSER_ADJUST_EDITOR_SURFACE_PATCH_MARKER} */
  /* ${LINUX_BROWSER_COMMENT_COMPOSER_LAYOUT_PATCH_MARKER} */
  display:flex!important;
  flex-wrap:wrap!important;
  align-items:flex-start!important;
  align-content:flex-start!important;
  box-sizing:border-box!important;
  gap:8px!important;
  min-height:72px!important;
  max-height:clamp(72px,28vh,180px)!important;
  overflow:hidden!important
}
[data-codex-window-type=electron][data-codex-os=linux].codex-linux-visual-compat [data-browser-comment-editor-surface]:not(:has([data-browser-comment-design-prompt-shell]))>*{
  min-width:0!important
}
[data-codex-window-type=electron][data-codex-os=linux].codex-linux-visual-compat [data-browser-comment-editor-surface]:not(:has([data-browser-comment-design-prompt-shell])) :is(textarea,[contenteditable=true],[role=textbox]){
  box-sizing:border-box!important;
  order:1!important;
  flex:1 1 100%!important;
  width:100%!important;
  min-width:0!important;
  max-width:100%!important;
  max-height:calc(180px - 56px)!important;
  overflow:auto!important;
  overflow-wrap:anywhere!important;
  word-break:break-word!important;
  white-space:pre-wrap!important
}
[data-codex-window-type=electron][data-codex-os=linux].codex-linux-visual-compat [data-browser-comment-editor-surface]:not(:has([data-browser-comment-design-prompt-shell])) button{
  flex:0 0 auto!important;
  white-space:nowrap!important;
  overflow:visible!important;
  pointer-events:auto!important
}
[data-codex-window-type=electron][data-codex-os=linux].codex-linux-visual-compat [data-browser-comment-editor-surface]:not(:has([data-browser-comment-design-prompt-shell])) button:not(:has(svg)){
  order:2!important;
  align-self:flex-end!important
}
[data-codex-window-type=electron][data-codex-os=linux].codex-linux-visual-compat [data-browser-comment-editor-surface]:not(:has([data-browser-comment-design-prompt-shell])) button:not(:has(svg)):has(+ button:not(:has(svg))){
  margin-left:auto!important
}
`;
}

function buildLinuxVisualCompatJsPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    LINUX_VISUAL_COMPAT_JS_PATCH_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeLinuxVisualCompatJsBundle(bundleSource)
  );
}

function buildLinuxBrowserViewportSurfacePatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    LINUX_BROWSER_VIEWPORT_SURFACE_PATCH_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeLinuxBrowserViewportSurfaceBundle(bundleSource)
  );
}

function buildLinuxBrowserWebviewStackingPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    LINUX_BROWSER_WEBVIEW_STACKING_PATCH_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeLinuxBrowserWebviewStackingBundle(bundleSource)
  );
}

function buildLinuxRightPanelPaneTabsPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    LINUX_RIGHT_PANEL_PANE_TABS_PATCH_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeLinuxRightPanelPaneTabsBundle(bundleSource)
  );
}

function buildLinuxRightPanelTabMetricsJs() {
  return `if(r&&!globalThis.${LINUX_RIGHT_PANEL_TAB_METRICS_PATCH_MARKER}){globalThis.${LINUX_RIGHT_PANEL_TAB_METRICS_PATCH_MARKER}=1;setTimeout(()=>{let e=0,t=e=>{let t=e.querySelector?.(\`[role=tab]\`),n=Math.max(e.getBoundingClientRect().width,e.scrollWidth||0,t?.getBoundingClientRect().width||0,t?.scrollWidth||0),r=e.style.cssText;e.style.setProperty(\`width\`,\`max-content\`,\`important\`),e.style.setProperty(\`max-width\`,\`none\`,\`important\`),e.style.setProperty(\`min-width\`,\`0\`,\`important\`),e.style.setProperty(\`flex\`,\`0 0 auto\`,\`important\`);try{n=Math.max(n,e.getBoundingClientRect().width,e.scrollWidth||0,t?.getBoundingClientRect().width||0,t?.scrollWidth||0)}finally{e.style.cssText=r}return Math.ceil(n)},n=()=>{cancelAnimationFrame(e),e=requestAnimationFrame(()=>{for(let e of document.querySelectorAll(\`[data-app-shell-focus-area=right-panel] [data-app-shell-tab-strip-controller]\`)){let n=e.querySelector(\`[role=tablist]\`),r=[...e.children].find(e=>e.matches?.(\`div:has(>button:not([role=tab]))\`)),i=e.parentElement,a=e.closest(\`[data-app-shell-focus-area=right-panel]\`);if(!n||!i)continue;let o=[...n.querySelectorAll(\`[data-app-shell-tab-controller]\`)];if(o.length===0)continue;let s=getComputedStyle(n),c=parseFloat(s.columnGap||s.gap)||0,l=o.reduce((e,n)=>e+t(n),0)+Math.max(0,o.length-1)*c,u=r?.getBoundingClientRect().width||28,d=[...i.children].filter(t=>t!==e&&getComputedStyle(t).display!==\`none\`).reduce((e,t)=>e+t.getBoundingClientRect().width,0),f=i.getBoundingClientRect().width||a?.clientWidth||innerWidth,p=Math.max(0,f-d),m=Math.max(0,p-u),h=Math.min(m,o.length===1?96:56),g=Math.max(0,Math.min(m,Math.max(h,l))),_=g+u;_>0&&(n.style.setProperty(\`width\`,g+\`px\`,\`important\`),n.style.setProperty(\`flex\`,\`0 0 \${g}px\`,\`important\`),e.style.setProperty(\`width\`,_+\`px\`,\`important\`),e.style.setProperty(\`flex\`,\`0 0 \${_}px\`,\`important\`))}})};n();setTimeout(n,80);setTimeout(n,300);new MutationObserver(n).observe(document.documentElement,{childList:!0,subtree:!0});globalThis.ResizeObserver&&new ResizeObserver(n).observe(document.documentElement)},500)}`;
}

function analyzeLinuxVisualCompatCssBundle(bundleSource) {
  const detected = {
    electronWindowTypeSelector: bundleSource.includes('[data-codex-window-type=electron]'),
    sidebarSurfaceClass: [
      '.window-fx-sidebar-surface',
      '.app-header-tint',
      '.app-shell-left-panel'
    ].some((marker) => bundleSource.includes(marker)),
    sidebarResizeHandleClass: ['.sidebar-resize-handle-line', 'electron-opaque'].some((marker) =>
      bundleSource.includes(marker)
    )
  };

  return {
    detected,
    missingAnchors: [
      !detected.electronWindowTypeSelector && 'electron window type selector',
      !detected.sidebarSurfaceClass && 'sidebar surface class',
      !detected.sidebarResizeHandleClass && 'sidebar resize handle class'
    ].filter(Boolean)
  };
}

function analyzeLinuxVisualCompatJsBundle(bundleSource) {
  const detected = {
    electronWindowSelector: bundleSource.includes('[data-codex-window-type="electron"]'),
    electronOpaqueClass: bundleSource.includes('electron-opaque'),
    codexOsDataset: bundleSource.includes('dataset.codexOs'),
    opaqueEffectBlock:
      LINUX_VISUAL_COMPAT_JS_TARGET_PATTERN.test(bundleSource) ||
      LINUX_VISUAL_COMPAT_JS_TARGET_SIMPLE_PATTERN.test(bundleSource)
  };

  return {
    detected,
    missingAnchors: [
      !detected.electronWindowSelector && 'electron window selector',
      !detected.electronOpaqueClass && 'electron-opaque class',
      !detected.codexOsDataset && 'codexOs dataset access',
      !detected.opaqueEffectBlock && 'opaque window effect block'
    ].filter(Boolean)
  };
}

function analyzeLinuxBrowserViewportSurfaceBundle(bundleSource) {
  const hasManagedWebviewHost = hasLinuxBrowserManagedWebviewHost(bundleSource);
  const hasImportedManagedWebviewHost = hasLinuxBrowserImportedManagedWebviewHost(bundleSource);
  const hasVisibleWhenUrl =
    LINUX_BROWSER_WEBVIEW_VISIBLE_WHEN_URL_PATTERN.test(bundleSource) ||
    LINUX_BROWSER_WEBVIEW_VISIBLE_WHEN_URL_26_527_PATTERN.test(bundleSource) ||
    LINUX_BROWSER_WEBVIEW_VISIBLE_WHEN_URL_DIRECT_PATTERN.test(bundleSource) ||
    hasLinuxBrowserManagedWebviewVisibilityFlow(bundleSource) ||
    bundleSource.includes(LINUX_BROWSER_WEBVIEW_VISIBLE_WHEN_URL_PATCH_MARKER);
  const detected = {
    browserSyncMessage: bundleSource.includes('browser-sidebar-sync'),
    webviewRefProp: bundleSource.includes('webviewRef:'),
    viewportSurface:
      LINUX_BROWSER_VIEWPORT_SURFACE_PATTERN.test(bundleSource) ||
      hasManagedWebviewHost ||
      hasImportedManagedWebviewHost,
    webviewPanelHostSignature:
      hasManagedWebviewHost ||
      hasImportedManagedWebviewHost ||
      LINUX_BROWSER_WEBVIEW_PANEL_HOST_SIGNATURE_PATTERN.test(bundleSource),
    webviewPanelHostSync:
      hasManagedWebviewHost ||
      hasImportedManagedWebviewHost ||
      LINUX_BROWSER_WEBVIEW_PANEL_HOST_SYNC_PATTERN.test(bundleSource),
    webviewPanelHostCall:
      hasManagedWebviewHost ||
      hasImportedManagedWebviewHost ||
      LINUX_BROWSER_WEBVIEW_PANEL_HOST_CALL_PATTERN.test(bundleSource),
    webviewVisibleWhenUrl:
      hasVisibleWhenUrl
  };

  return {
    detected,
    missingAnchors: [
      !detected.browserSyncMessage && 'browser sidebar sync event marker',
      !detected.webviewRefProp && 'browser webview ref prop',
      !detected.viewportSurface && 'browser viewport surface div',
      !detected.webviewPanelHostSignature && 'browser webview panel host signature',
      !detected.webviewPanelHostSync && 'browser webview panel host sync',
      !detected.webviewPanelHostCall && 'browser webview panel host call',
      !detected.webviewVisibleWhenUrl && 'browser webview visible-when-url prop'
    ].filter(Boolean)
  };
}

function analyzeLinuxBrowserWebviewStackingBundle(bundleSource) {
  const hasManagedWebviewManager = hasLinuxBrowserManagedWebviewManager(bundleSource);
  const detected = {
    browserWebviewElement: bundleSource.includes('document.createElement(`webview`)'),
    browserWebviewLifecycleLog:
      hasManagedWebviewManager ||
      bundleSource.includes('IAB_LIFECYCLE renderer created hidden browser sidebar webview'),
    visibleWebviewStyleBlock:
      hasManagedWebviewManager ||
      LINUX_BROWSER_WEBVIEW_VISIBLE_STYLE_PATTERN.test(bundleSource) ||
      LINUX_BROWSER_WEBVIEW_VISIBLE_FUNCTION_PATTERN.test(bundleSource) ||
      bundleSource.includes(LINUX_BROWSER_WEBVIEW_HOST_POSITION_PATCH_MARKER),
    webviewSyncMethod:
      hasManagedWebviewManager || LINUX_BROWSER_WEBVIEW_SYNC_METHOD_PATTERN.test(bundleSource),
    webviewDetachMethod:
      hasManagedWebviewManager ||
      LINUX_BROWSER_WEBVIEW_ATTACH_METHOD_INSERT_PATTERN.test(bundleSource),
    captureSurfaceVisibleBranch:
      hasManagedWebviewManager ||
      LINUX_BROWSER_WEBVIEW_CAPTURE_SURFACE_PATTERN.test(bundleSource) ||
      LINUX_BROWSER_WEBVIEW_CAPTURE_SURFACE_CURRENT_PATTERN.test(bundleSource)
  };

  return {
    detected,
    missingAnchors: [
      !detected.browserWebviewElement && 'browser webview element',
      !detected.browserWebviewLifecycleLog && 'browser webview lifecycle log',
      !detected.visibleWebviewStyleBlock && 'visible webview style block',
      !detected.webviewSyncMethod && 'browser webview sync method',
      !detected.webviewDetachMethod && 'browser webview detach method',
      !detected.captureSurfaceVisibleBranch && 'capture-surface visible branch'
    ].filter(Boolean)
  };
}

function analyzeLinuxRightPanelPaneTabsBundle(bundleSource) {
  const hasUpstreamPaneTabs = LINUX_RIGHT_PANEL_PANE_TABS_UPSTREAM_PATTERN.test(bundleSource);
  const hasUpstreamToolbarTabs = hasLinuxRightPanelUpstreamToolbarTabs(bundleSource);
  const hasRightPanelOutletOrderAnchor =
    LINUX_RIGHT_PANEL_CHILDREN_ORDER_PATTERN.test(bundleSource) ||
    LINUX_RIGHT_PANEL_CHILDREN_ORDER_26_527_PATTERN.test(bundleSource) ||
    LINUX_RIGHT_PANEL_CHILDREN_ORDER_26_601_PATTERN.test(bundleSource);
  const detected = {
    rightPanelHeaderSpacer:
      hasUpstreamPaneTabs || bundleSource.includes('right-panel-tab-bar-header-spacer'),
    rightPanelTabsExport: bundleSource.includes('RightPanelTabs'),
    rightPanelExpandButton:
      hasUpstreamPaneTabs || bundleSource.includes('codex.rightPanel.expandFullWidth'),
    toolbarHeaderHeight:
      hasUpstreamPaneTabs || LINUX_RIGHT_PANEL_PANE_TABS_HEADER_PATTERN.test(bundleSource),
    headerBeforeList:
      hasUpstreamPaneTabs || LINUX_RIGHT_PANEL_PANE_TABS_BEFORE_LIST_PATTERN.test(bundleSource),
    headerAfterList:
      hasUpstreamPaneTabs || LINUX_RIGHT_PANEL_PANE_TABS_AFTER_LIST_PATTERN.test(bundleSource),
    outletAfterSlot: hasRightPanelOutletOrderAnchor || hasUpstreamToolbarTabs
  };

  return {
    detected,
    missingAnchors: [
      !detected.rightPanelHeaderSpacer && 'right panel header spacer',
      !detected.rightPanelTabsExport && 'right panel tabs export',
      !detected.rightPanelExpandButton && 'right panel expand button',
      !detected.toolbarHeaderHeight && 'toolbar header height',
      !detected.headerBeforeList && 'header before-list spacer',
      !detected.headerAfterList && 'header after-list spacer',
      !detected.outletAfterSlot && 'right panel outlet order'
    ].filter(Boolean)
  };
}

export async function patchRendererCompactSlashCommandBundle(extractedAppDir, logger) {
  const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
  const assetNames = await fs.promises.readdir(assetsDir);
  const jsAssets = assetNames.filter((name) => name.endsWith('.js'));
  let sawCandidate = false;
  let firstAnchorError = null;
  let firstAnchorErrorSourceName = null;

  for (const assetName of jsAssets) {
    const assetPath = path.join(assetsDir, assetName);
    const original = await fs.promises.readFile(assetPath, 'utf8');
    if (!isCompactSlashCommandCandidateBundle(original)) {
      continue;
    }

    sawCandidate = true;
    logger.info(`Resolved renderer compact slash command bundle ${assetName}`);
    const analysis = analyzeCompactSlashCommandBundle(original);
    if (analysis.missingAnchors.length > 0) {
      const error = new Error(buildCompactSlashCommandVerificationErrorMessage(original, assetName));
      if (!firstAnchorError) {
        firstAnchorError = error;
        firstAnchorErrorSourceName = assetName;
      }
      logger.warn(
        `Skipping Linux compact slash command verification for ${assetName} because bundle anchors were not compatible: ${error.message}`
      );
      continue;
    }

    logger.info(`Verified compact slash command support in renderer bundle ${assetName}`);
    return {
      status: 'already-applied',
      sourceName: assetName
    };
  }

  if (!sawCandidate) {
    logger.warn(
      'Skipping Linux compact slash command verification because no renderer candidate bundle was detected.'
    );
    return {
      status: 'skipped',
      reason: 'bundle-not-found'
    };
  }

  logger.warn(
    `Skipping Linux compact slash command verification because renderer candidates were incompatible with the expected anchors.${firstAnchorErrorSourceName ? ` Source: ${firstAnchorErrorSourceName}.` : ''}`
  );
  return {
    status: 'skipped',
    reason: 'anchor-mismatch',
    sourceName: firstAnchorErrorSourceName,
    details: firstAnchorError?.message ?? null
  };
}

function isCompactSlashCommandCandidateBundle(bundleSource) {
  const analysis = analyzeCompactSlashCommandBundle(bundleSource);
  return analysis.detected.commandId || analysis.detected.commandAction;
}

function analyzeCompactSlashCommandBundle(bundleSource) {
  const detected = {
    commandTitle: bundleSource.includes('composer.compactSlashCommand.title'),
    commandDescription: bundleSource.includes('composer.compactSlashCommand.description'),
    commandId: COMPACT_SLASH_COMMAND_ID_MARKERS.some((marker) => bundleSource.includes(marker)),
    commandAction:
      bundleSource.includes('compactThread(') || bundleSource.includes('`compact-thread`'),
    requiresEmptyComposer: bundleSource.includes('requiresEmptyComposer:!0')
  };

  return {
    detected,
    missingAnchors: [
      !detected.commandTitle && 'compact slash command title',
      !detected.commandDescription && 'compact slash command description',
      !detected.commandId && 'compact slash command id',
      !detected.commandAction && 'compact slash command action',
      !detected.requiresEmptyComposer && 'compact slash command empty-composer gate'
    ].filter(Boolean)
  };
}

function buildCompactSlashCommandVerificationErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    COMPACT_SLASH_COMMAND_VERIFICATION_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeCompactSlashCommandBundle(bundleSource)
  );
}

export async function patchRendererLinuxBrowserCommentPositionBundle(extractedAppDir, logger) {
  const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
  const assetNames = await fs.promises.readdir(assetsDir);
  const jsAssets = assetNames.filter((name) => name.endsWith('.js'));
  let sawCandidate = false;
  let firstAnchorError = null;
  let firstAnchorErrorSourceName = null;

  for (const assetName of jsAssets) {
    const assetPath = path.join(assetsDir, assetName);
    const original = await fs.promises.readFile(assetPath, 'utf8');
    const isCandidate = LINUX_BROWSER_COMMENT_POSITION_CANDIDATE_MARKERS.every((marker) =>
      original.includes(marker)
    );
    if (!isCandidate) {
      continue;
    }

    sawCandidate = true;
    logger.info(`Resolved renderer Linux browser-comment positioning bundle ${assetName}`);

    let result;
    try {
      result = applyLinuxBrowserCommentPositionPatch(original, { sourceName: assetName });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith(LINUX_BROWSER_COMMENT_POSITION_PATCH_BASE_ERROR_MESSAGE)
      ) {
        if (!firstAnchorError) {
          firstAnchorError = error;
          firstAnchorErrorSourceName = assetName;
        }
        logger.warn(
          `Skipping Linux browser-comment positioning patch for ${assetName} because bundle anchors were not compatible: ${error.message}`
        );
        continue;
      }
      throw error;
    }

    if (result.updated !== original) {
      await fs.promises.writeFile(assetPath, result.updated, 'utf8');
      logger.info(
        `Patched Linux browser-comment positioning behavior into renderer bundle ${assetName}`
      );
    }
    return {
      status: result.status,
      sourceName: assetName
    };
  }

  if (!sawCandidate) {
    logger.warn(
      'Skipping Linux browser-comment positioning patch because no renderer candidate bundle was detected.'
    );
    return {
      status: 'skipped',
      reason: 'bundle-not-found'
    };
  }

  logger.warn(
    `Skipping Linux browser-comment positioning patch because renderer candidates were incompatible with the expected anchors.${firstAnchorErrorSourceName ? ` Source: ${firstAnchorErrorSourceName}.` : ''}`
  );
  return {
    status: 'skipped',
    reason: 'anchor-mismatch',
    sourceName: firstAnchorErrorSourceName,
    details: firstAnchorError?.message ?? null
  };
}

export function applyLinuxBrowserCommentPositionPatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxBrowserCommentPositionPatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxBrowserCommentPositionPatch(bundleSource, options = {}) {
  if (bundleSource.includes(LINUX_BROWSER_COMMENT_POSITION_PATCH_MARKER)) {
    return bundleSource;
  }

  const errorMessage = buildLinuxBrowserCommentPositionPatchErrorMessage(
    bundleSource,
    options.sourceName
  );
  const overlayStateMatch = bundleSource.match(LINUX_BROWSER_COMMENT_POSITION_OVERLAY_STATE_PATTERN);
  if (!overlayStateMatch?.groups?.messageVar || !overlayStateMatch?.groups?.popupVar) {
    throw new Error(errorMessage);
  }

  const { messageVar, popupVar } = overlayStateMatch.groups;
  let updated = replaceRegexOrThrow(
    bundleSource,
    LINUX_BROWSER_COMMENT_POSITION_POPUP_OPEN_PATTERN,
    ({
      xVar,
      yVar,
      widthVar,
      heightVar,
      boundsVar,
      popupVar: popupWindowVar,
      openerVar,
      frameNameVar
    }) =>
      `let{x:${xVar},y:${yVar},width:${widthVar},height:${heightVar}}=${boundsVar}.overlayWindowBounds,${popupWindowVar}=${openerVar}.open(\`about:blank\`,${frameNameVar},[\`popup=yes\`,\`left=\${Math.round(${xVar})}\`,\`top=\${Math.round(${yVar})}\`,\`width=\${Math.round(${widthVar})}\`,\`height=\${Math.round(${heightVar})}\`].join(\`,\`));if(${popupWindowVar}!=null){/* ${LINUX_BROWSER_COMMENT_POSITION_PATCH_MARKER} */let e=document.documentElement.dataset.codexOs===\`linux\`,t=!1;try{t=process?.env?.CODEX_DESKTOP_DISABLE_LINUX_BROWSER_COMMENT_POSITION_PATCH===\`1\`}catch{}if(e&&!t)try{${popupWindowVar}.moveTo(Math.round(${xVar}),Math.round(${yVar})),${popupWindowVar}.resizeTo(Math.round(${widthVar}),Math.round(${heightVar}))}catch{}}return ${popupWindowVar}==null?null:{frameName:${frameNameVar},window:${popupWindowVar}}`,
    errorMessage
  );
  updated = replaceRegexOrThrow(
    updated,
    buildLinuxBrowserCommentPositionFramePattern(messageVar),
    ({ frameVar }) =>
      `${frameVar}=(()=>{let e={left:${messageVar}.editorFrame.x,top:${messageVar}.editorFrame.y,width:${messageVar}.editorFrame.width,height:${messageVar}.editorFrame.height},t=document.documentElement.dataset.codexOs===\`linux\`,n=!1;try{n=process?.env?.CODEX_DESKTOP_DISABLE_LINUX_BROWSER_COMMENT_POSITION_PATCH===\`1\`}catch{}if(t&&!n){let r=typeof ${popupVar}.screenX===\`number\`?${popupVar}.screenX:typeof ${popupVar}.screenLeft===\`number\`?${popupVar}.screenLeft:null,i=typeof ${popupVar}.screenY===\`number\`?${popupVar}.screenY:typeof ${popupVar}.screenTop===\`number\`?${popupVar}.screenTop:null;if(r!=null&&i!=null&&${messageVar}.overlayWindowBounds!=null){let a=r-${messageVar}.overlayWindowBounds.x,o=i-${messageVar}.overlayWindowBounds.y,s=Math.max(${messageVar}.overlayWindowBounds.width-${messageVar}.editorFrame.width,0),c=Math.max(${messageVar}.overlayWindowBounds.height-${messageVar}.editorFrame.height,0),l=Math.min(Math.max(${messageVar}.editorFrame.x-a,0),s),u=Math.min(Math.max(${messageVar}.editorFrame.y-o,0),c);e={left:l,top:u,width:${messageVar}.editorFrame.width,height:${messageVar}.editorFrame.height}}}return e})()`,
    errorMessage
  );
  return updated;
}

export async function patchRendererLinuxBrowserCommentSubmitModeBundle(extractedAppDir, logger) {
  const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
  const assetNames = await fs.promises.readdir(assetsDir);
  const jsAssets = assetNames.filter((name) => name.endsWith('.js'));
  let sawCandidate = false;
  let firstAnchorError = null;
  let firstAnchorErrorSourceName = null;

  for (const assetName of jsAssets) {
    const assetPath = path.join(assetsDir, assetName);
    const original = await fs.promises.readFile(assetPath, 'utf8');
    const isCandidate = LINUX_BROWSER_COMMENT_SUBMIT_MODE_CANDIDATE_MARKERS.every((marker) =>
      original.includes(marker)
    );
    if (!isCandidate) {
      continue;
    }

    sawCandidate = true;
    logger.info(`Resolved renderer browser-comment submit mode bundle ${assetName}`);

    let result;
    try {
      result = applyLinuxBrowserCommentSubmitModePatch(original, { sourceName: assetName });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith(LINUX_BROWSER_COMMENT_SUBMIT_MODE_PATCH_BASE_ERROR_MESSAGE)
      ) {
        if (!firstAnchorError) {
          firstAnchorError = error;
          firstAnchorErrorSourceName = assetName;
        }
        logger.warn(
          `Skipping Linux browser-comment submit mode patch for ${assetName} because bundle anchors were not compatible: ${error.message}`
        );
        continue;
      }
      throw error;
    }

    if (result.updated !== original) {
      await fs.promises.writeFile(assetPath, result.updated, 'utf8');
      logger.info(`Patched browser-comment submit mode into renderer bundle ${assetName}`);
    }
    return {
      status: result.status,
      sourceName: assetName
    };
  }

  if (!sawCandidate) {
    logger.warn(
      'Skipping Linux browser-comment submit mode patch because no renderer candidate bundle was detected.'
    );
    return {
      status: 'skipped',
      reason: 'bundle-not-found'
    };
  }

  logger.warn(
    `Skipping Linux browser-comment submit mode patch because renderer candidates were incompatible with the expected anchors.${firstAnchorErrorSourceName ? ` Source: ${firstAnchorErrorSourceName}.` : ''}`
  );
  return {
    status: 'skipped',
    reason: 'anchor-mismatch',
    sourceName: firstAnchorErrorSourceName,
    details: firstAnchorError?.message ?? null
  };
}

export function applyLinuxBrowserCommentSubmitModePatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxBrowserCommentSubmitModePatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxBrowserCommentSubmitModePatch(bundleSource, options = {}) {
  const hasMarker = bundleSource.includes(LINUX_BROWSER_COMMENT_SUBMIT_MODE_PATCH_MARKER);
  const hasDirectMode =
    LINUX_BROWSER_COMMENT_SUBMIT_MODE_PATTERN.test(bundleSource) ||
    LINUX_BROWSER_COMMENT_SUBMIT_MODE_FALLBACK_PATTERN.test(bundleSource) ||
    LINUX_BROWSER_COMMENT_SUBMIT_MODE_CALLER_PATTERN.test(bundleSource);
  const hasSavedDefault =
    bundleSource.includes('browser-sidebar-comment-overlay-submit') &&
    bundleSource.includes('defaultCreateSubmitMode') &&
    !hasDirectMode;
  if (hasMarker && !hasDirectMode) {
    return bundleSource;
  }
  if (hasSavedDefault) {
    return bundleSource;
  }

  const errorMessage = buildLinuxBrowserCommentSubmitModePatchErrorMessage(
    bundleSource,
    options.sourceName
  );
  let updated = bundleSource;
  let includeMarker = !hasMarker;
  const takeMarker = () => {
    if (!includeMarker) {
      return '';
    }
    includeMarker = false;
    return `/* ${LINUX_BROWSER_COMMENT_SUBMIT_MODE_PATCH_MARKER} */`;
  };

  updated = updated.replace(LINUX_BROWSER_COMMENT_SUBMIT_MODE_PATTERN, (_, prop) => {
    return `${prop}:\`saved\`${takeMarker()}`;
  });
  updated = updated.replace(
    LINUX_BROWSER_COMMENT_SUBMIT_MODE_FALLBACK_PATTERN,
    (_, modeVar, propVar) => `${modeVar}=${propVar}===void 0?\`saved\`:${propVar}${takeMarker()}`
  );
  updated = updated.replace(
    LINUX_BROWSER_COMMENT_SUBMIT_MODE_CALLER_PATTERN,
    (_, prop) => `${prop}:\`saved\`${takeMarker()}`
  );

  if (updated === bundleSource) {
    throw new Error(errorMessage);
  }
  return updated;
}

export async function patchRendererLinuxBrowserCommentSubmitCleanupBundle(extractedAppDir, logger) {
  const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
  const assetNames = await fs.promises.readdir(assetsDir);
  const jsAssets = assetNames.filter((name) => name.endsWith('.js'));
  let sawCandidate = false;
  let firstAnchorError = null;
  let firstAnchorErrorSourceName = null;

  for (const assetName of jsAssets) {
    const assetPath = path.join(assetsDir, assetName);
    const original = await fs.promises.readFile(assetPath, 'utf8');
    const isCandidate = LINUX_BROWSER_COMMENT_SUBMIT_CLEANUP_CANDIDATE_MARKERS.every((marker) =>
      original.includes(marker)
    );
    if (!isCandidate) {
      continue;
    }

    sawCandidate = true;
    logger.info(`Resolved renderer browser-comment submit cleanup bundle ${assetName}`);

    let result;
    try {
      result = applyLinuxBrowserCommentSubmitCleanupPatch(original, { sourceName: assetName });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith(LINUX_BROWSER_COMMENT_SUBMIT_MODE_PATCH_BASE_ERROR_MESSAGE)
      ) {
        if (!firstAnchorError) {
          firstAnchorError = error;
          firstAnchorErrorSourceName = assetName;
        }
        logger.warn(
          `Skipping Linux browser-comment submit cleanup patch for ${assetName} because bundle anchors were not compatible: ${error.message}`
        );
        continue;
      }
      throw error;
    }

    if (result.updated !== original) {
      await fs.promises.writeFile(assetPath, result.updated, 'utf8');
      logger.info(`Patched browser-comment submit cleanup into renderer bundle ${assetName}`);
    }
    return {
      status: result.status,
      sourceName: assetName
    };
  }

  if (!sawCandidate) {
    logger.warn(
      'Skipping Linux browser-comment submit cleanup patch because no renderer candidate bundle was detected.'
    );
    return {
      status: 'skipped',
      reason: 'bundle-not-found'
    };
  }

  logger.warn(
    `Skipping Linux browser-comment submit cleanup patch because renderer candidates were incompatible with the expected anchors.${firstAnchorErrorSourceName ? ` Source: ${firstAnchorErrorSourceName}.` : ''}`
  );
  return {
    status: 'skipped',
    reason: 'anchor-mismatch',
    sourceName: firstAnchorErrorSourceName,
    details: firstAnchorError?.message ?? null
  };
}

export function applyLinuxBrowserCommentSubmitCleanupPatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxBrowserCommentSubmitCleanupPatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxBrowserCommentSubmitCleanupPatch(bundleSource, options = {}) {
  if (bundleSource.includes(LINUX_BROWSER_COMMENT_SUBMIT_CLEANUP_PATCH_MARKER)) {
    return bundleSource;
  }

  const currentStateMatch =
    LINUX_BROWSER_COMMENT_SUBMIT_CLEANUP_REMOVE_BROWSER_COMMENTS_PATTERN.exec(bundleSource);
  const hasCurrentContext =
    LINUX_BROWSER_COMMENT_SUBMIT_CLEANUP_CONTEXT_26_616_PATTERN.test(bundleSource);
  if (currentStateMatch && hasCurrentContext) {
    return replaceRegexOrThrow(
      bundleSource,
      LINUX_BROWSER_COMMENT_SUBMIT_CLEANUP_CONTEXT_26_616_PATTERN,
      ({ prefix, buildContextFn, suffix }) =>
        `${prefix}async(...codexLinuxBrowserCommentSubmitCleanupArgs)=>{let codexLinuxBrowserCommentSubmitCleanupContext=await ${buildContextFn}(...codexLinuxBrowserCommentSubmitCleanupArgs);${currentStateMatch.groups.removeBrowserCommentsFn}();return codexLinuxBrowserCommentSubmitCleanupContext}/* ${LINUX_BROWSER_COMMENT_SUBMIT_CLEANUP_PATCH_MARKER} */${suffix}`,
      buildLinuxBrowserCommentSubmitCleanupPatchErrorMessage(bundleSource, options.sourceName)
    );
  }

  const stateMatch = LINUX_BROWSER_COMMENT_SUBMIT_CLEANUP_STATE_PATTERN.exec(bundleSource);
  const filterFn = stateMatch
    ? findLinuxBrowserCommentAttachmentFilter(bundleSource, {
        commentsVar: stateMatch.groups.commentsVar,
        onCommentsChangeVar: stateMatch.groups.onCommentsChangeVar
      })
    : null;
  if (!stateMatch || !filterFn) {
    throw new Error(
      buildLinuxBrowserCommentSubmitCleanupPatchErrorMessage(bundleSource, options.sourceName)
    );
  }
  const {
    browserConversationVar,
    browserTabVar,
    clearFn,
    commentsVar,
    fallbackConversationVar,
    onCommentsChangeVar
  } = stateMatch.groups;

  return replaceRegexOrThrow(
    bundleSource,
    LINUX_BROWSER_COMMENT_SUBMIT_CLEANUP_CONTEXT_PATTERN,
    ({
      contextVar,
      buildContextFn,
      promptVar,
      conversationVar,
      objectiveVar,
      analyticsFn,
      submitActionVar,
      serviceTierVar,
      pendingFn,
      submitFn
    }) => {
      const contextBuild = `let ${contextVar}=await ${buildContextFn}(${promptVar},void 0,${conversationVar},${objectiveVar}??void 0)`;
      const clearBrowserSidebar = `${clearFn}({browserConversationId:${browserConversationVar},browserTabId:${browserTabVar},fallbackBrowserConversationId:${fallbackConversationVar},comments:${commentsVar},onCommentsChange:()=>{}})`;
      const clearComposerPill =
        `${onCommentsChangeVar}(${filterFn}(${commentsVar}))` +
        `/* ${LINUX_BROWSER_COMMENT_SUBMIT_CLEANUP_PATCH_MARKER} */`;
      return `${contextBuild};${clearBrowserSidebar},${clearComposerPill},${analyticsFn}(${submitActionVar},${serviceTierVar}),${pendingFn}(!0);let ${submitFn}=async()=>`;
    },
    buildLinuxBrowserCommentSubmitCleanupPatchErrorMessage(bundleSource, options.sourceName)
  );
}

function findLinuxBrowserCommentAttachmentFilter(bundleSource, { commentsVar, onCommentsChangeVar }) {
  const escapedComments = escapeRegExp(commentsVar);
  const escapedOnChange = escapeRegExp(onCommentsChangeVar);
  const match = new RegExp(
    `=\\(\\)=>\\{${escapedOnChange}\\((?<filterFn>[A-Za-z_$][\\w$]*)\\(${escapedComments}\\)\\)\\}`
  ).exec(bundleSource);
  return match?.groups?.filterFn ?? null;
}

export async function patchRendererBackgroundSubagentsPanelBundle(extractedAppDir, logger) {
  const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
  const assetNames = await fs.promises.readdir(assetsDir);
  const jsAssets = assetNames.filter((name) => name.endsWith('.js'));
  let sawCandidate = false;
  let firstAnchorError = null;
  let firstAnchorErrorSourceName = null;

  for (const assetName of jsAssets) {
    const assetPath = path.join(assetsDir, assetName);
    const original = await fs.promises.readFile(assetPath, 'utf8');
    const isCandidate = LINUX_BACKGROUND_SUBAGENTS_PANEL_CANDIDATE_MARKERS.every((marker) =>
      original.includes(marker)
    );
    if (!isCandidate) {
      continue;
    }

    sawCandidate = true;
    logger.info(`Resolved renderer background subagents panel bundle ${assetName}`);

    let result;
    try {
      result = applyLinuxBackgroundSubagentsPanelPatch(original, { sourceName: assetName });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith(LINUX_BACKGROUND_SUBAGENTS_PANEL_PATCH_BASE_ERROR_MESSAGE)
      ) {
        if (!firstAnchorError) {
          firstAnchorError = error;
          firstAnchorErrorSourceName = assetName;
        }
        logger.warn(
          `Skipping Linux background subagents panel patch for ${assetName} because bundle anchors were not compatible: ${error.message}`
        );
        continue;
      }
      throw error;
    }

    if (result.updated !== original) {
      await fs.promises.writeFile(assetPath, result.updated, 'utf8');
      logger.info(`Patched Linux background subagents panel behavior into renderer bundle ${assetName}`);
    }
    return {
      status: result.status,
      sourceName: assetName
    };
  }

  if (!sawCandidate) {
    logger.warn(
      'Skipping Linux background subagents panel patch because no renderer candidate bundle was detected.'
    );
    return {
      status: 'skipped',
      reason: 'bundle-not-found'
    };
  }

  logger.warn(
    `Skipping Linux background subagents panel patch because renderer candidates were incompatible with the expected anchors.${firstAnchorErrorSourceName ? ` Source: ${firstAnchorErrorSourceName}.` : ''}`
  );
  return {
    status: 'skipped',
    reason: 'anchor-mismatch',
    sourceName: firstAnchorErrorSourceName,
    details: firstAnchorError?.message ?? null
  };
}

export function applyLinuxBackgroundSubagentsPanelPatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxBackgroundSubagentsPanelPatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxBackgroundSubagentsPanelPatch(bundleSource, options = {}) {
  if (bundleSource.includes(LINUX_BACKGROUND_SUBAGENTS_PANEL_PATCH_MARKER)) {
    return bundleSource;
  }
  if (LINUX_BACKGROUND_SUBAGENTS_PANEL_FALSE_GATE_PATTERN.test(bundleSource)) {
    return bundleSource;
  }

  const errorMessage = buildLinuxBackgroundSubagentsPanelPatchErrorMessage(
    bundleSource,
    options.sourceName
  );
  if (LINUX_BACKGROUND_SUBAGENTS_PANEL_VISIBILITY_PATTERN.test(bundleSource)) {
    return replaceRegexOrThrow(
      bundleSource,
      LINUX_BACKGROUND_SUBAGENTS_PANEL_VISIBILITY_PATTERN,
      ({ visibleVar, rowsVar, firstGuard, toggleGuard, thirdGuard, fourthGuard }) =>
        `/* ${LINUX_BACKGROUND_SUBAGENTS_PANEL_PATCH_MARKER} */${visibleVar}=${rowsVar}.length>0&&!${firstGuard}&&(typeof process<\`u\`&&process?.env?.CODEX_DESKTOP_DISABLE_LINUX_BACKGROUND_SUBAGENTS_PANEL_PATCH===\`1\`?${toggleGuard}:!1)&&!${thirdGuard}&&!${fourthGuard}`,
      errorMessage
    );
  }
  return replaceRegexOrThrow(
    bundleSource,
    LINUX_BACKGROUND_SUBAGENTS_PANEL_CURRENT_VISIBILITY_PATTERN,
    ({ visibleVar, rowsVar, guardVar }) =>
      `/* ${LINUX_BACKGROUND_SUBAGENTS_PANEL_PATCH_MARKER} */${visibleVar}=${rowsVar}.length>0&&(typeof process<\`u\`&&process?.env?.CODEX_DESKTOP_DISABLE_LINUX_BACKGROUND_SUBAGENTS_PANEL_PATCH===\`1\`?!${guardVar}:!1)`,
    errorMessage
  );
}

export async function patchRendererLatestAgentTurnExpansionBundle(extractedAppDir, logger) {
  const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
  const assetNames = await fs.promises.readdir(assetsDir);
  const jsAssets = assetNames.filter((name) => name.endsWith('.js'));
  let sawCandidate = false;
  let firstAnchorError = null;
  let firstAnchorErrorSourceName = null;

  for (const assetName of jsAssets) {
    const assetPath = path.join(assetsDir, assetName);
    const original = await fs.promises.readFile(assetPath, 'utf8');
    const isCandidate = LINUX_LATEST_AGENT_TURN_EXPANSION_CANDIDATE_MARKERS.every((marker) =>
      original.includes(marker)
    );
    if (!isCandidate) {
      continue;
    }

    sawCandidate = true;
    logger.info(`Resolved renderer latest agent turn expansion bundle ${assetName}`);

    let result;
    try {
      result = applyLinuxLatestAgentTurnExpansionPatch(original, { sourceName: assetName });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith(LINUX_LATEST_AGENT_TURN_EXPANSION_PATCH_BASE_ERROR_MESSAGE)
      ) {
        if (!firstAnchorError) {
          firstAnchorError = error;
          firstAnchorErrorSourceName = assetName;
        }
        logger.warn(
          `Skipping Linux latest agent turn expansion patch for ${assetName} because bundle anchors were not compatible: ${error.message}`
        );
        continue;
      }
      throw error;
    }

    if (result.updated !== original) {
      await fs.promises.writeFile(assetPath, result.updated, 'utf8');
      logger.info(`Patched Linux latest agent turn expansion behavior into renderer bundle ${assetName}`);
    }
    return {
      status: result.status,
      sourceName: assetName
    };
  }

  if (!sawCandidate) {
    logger.warn(
      'Skipping Linux latest agent turn expansion patch because no renderer candidate bundle was detected.'
    );
    return {
      status: 'skipped',
      reason: 'bundle-not-found'
    };
  }

  logger.warn(
    `Skipping Linux latest agent turn expansion patch because renderer candidates were incompatible with the expected anchors.${firstAnchorErrorSourceName ? ` Source: ${firstAnchorErrorSourceName}.` : ''}`
  );
  return {
    status: 'skipped',
    reason: 'anchor-mismatch',
    sourceName: firstAnchorErrorSourceName,
    details: firstAnchorError?.message ?? null
  };
}

export function applyLinuxLatestAgentTurnExpansionPatch(bundleSource, options = {}) {
  if (options.skip) {
    return {
      updated: bundleSource,
      status: 'skipped'
    };
  }
  const updated = injectLinuxLatestAgentTurnExpansionPatch(bundleSource, options);
  return {
    updated,
    status: updated === bundleSource ? 'already-applied' : 'applied'
  };
}

export function injectLinuxLatestAgentTurnExpansionPatch(bundleSource, options = {}) {
  if (bundleSource.includes(LINUX_LATEST_AGENT_TURN_EXPANSION_PATCH_MARKER)) {
    return bundleSource;
  }

  return replaceRegexOrThrow(
    bundleSource,
    LINUX_LATEST_AGENT_TURN_EXPANSION_PATTERN,
    ({ persistedCollapsedVar }) =>
      `persistedCollapsed:/* ${LINUX_LATEST_AGENT_TURN_EXPANSION_PATCH_MARKER} */S?(${persistedCollapsedVar}??!1):${persistedCollapsedVar}}),`,
    buildLinuxLatestAgentTurnExpansionPatchErrorMessage(bundleSource, options.sourceName)
  );
}

function buildLinuxBrowserCommentPositionFramePattern(messageVar) {
  const escapedMessageVar = escapeRegExp(messageVar);
  return new RegExp(
    `(?<frameVar>[A-Za-z_$][\\w$]*)=\\{left:${escapedMessageVar}\\.editorFrame\\.x,top:${escapedMessageVar}\\.editorFrame\\.y,width:${escapedMessageVar}\\.editorFrame\\.width,height:${escapedMessageVar}\\.editorFrame\\.height\\}`
  );
}

function buildLinuxBrowserCommentPositionPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    LINUX_BROWSER_COMMENT_POSITION_PATCH_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeLinuxBrowserCommentPositionBundle(bundleSource)
  );
}

function buildLinuxBrowserCommentSubmitModePatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    LINUX_BROWSER_COMMENT_SUBMIT_MODE_PATCH_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeLinuxBrowserCommentSubmitModeBundle(bundleSource)
  );
}

function buildLinuxBrowserCommentSubmitCleanupPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    LINUX_BROWSER_COMMENT_SUBMIT_MODE_PATCH_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeLinuxBrowserCommentSubmitCleanupBundle(bundleSource)
  );
}

function buildLinuxBackgroundSubagentsPanelPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    LINUX_BACKGROUND_SUBAGENTS_PANEL_PATCH_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeLinuxBackgroundSubagentsPanelBundle(bundleSource)
  );
}

function buildLinuxLatestAgentTurnExpansionPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    LINUX_LATEST_AGENT_TURN_EXPANSION_PATCH_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeLinuxLatestAgentTurnExpansionBundle(bundleSource)
  );
}

function analyzeLinuxBrowserCommentPositionBundle(bundleSource) {
  const detected = {
    overlaySessionMessage: bundleSource.includes('browser-sidebar-comment-overlay-session'),
    overlayBoundsPayload: bundleSource.includes('overlayWindowBounds'),
    popupWindowBinding: LINUX_BROWSER_COMMENT_POSITION_OVERLAY_STATE_PATTERN.test(bundleSource),
    popupOpenCall: LINUX_BROWSER_COMMENT_POSITION_POPUP_OPEN_PATTERN.test(bundleSource),
    editorFrameAssignment:
      /editorFrame\.x,top:[A-Za-z_$][\w$]*\.editorFrame\.y,width:[A-Za-z_$][\w$]*\.editorFrame\.width,height:[A-Za-z_$][\w$]*\.editorFrame\.height/.test(
        bundleSource
      )
  };

  return {
    detected,
    missingAnchors: [
      !detected.overlaySessionMessage && 'overlay session event marker',
      !detected.overlayBoundsPayload && 'overlay window bounds payload',
      !detected.popupWindowBinding && 'popup window binding',
      !detected.popupOpenCall && 'popup window open block',
      !detected.editorFrameAssignment && 'editor frame style assignment'
    ].filter(Boolean)
  };
}

function analyzeLinuxBrowserCommentSubmitModeBundle(bundleSource) {
  const detected = {
    overlaySubmitMessage: bundleSource.includes('browser-sidebar-comment-overlay-submit'),
    submitModeProp: bundleSource.includes('defaultCreateSubmitMode'),
    directSubmitMode:
      LINUX_BROWSER_COMMENT_SUBMIT_MODE_PATTERN.test(bundleSource) ||
      LINUX_BROWSER_COMMENT_SUBMIT_MODE_FALLBACK_PATTERN.test(bundleSource) ||
      LINUX_BROWSER_COMMENT_SUBMIT_MODE_CALLER_PATTERN.test(bundleSource)
  };

  return {
    detected,
    missingAnchors: [
      !detected.overlaySubmitMessage && 'overlay submit event marker',
      !detected.submitModeProp && 'default create submit mode prop',
      !detected.directSubmitMode && 'direct create submit mode value'
    ].filter(Boolean)
  };
}

function analyzeLinuxBrowserCommentSubmitCleanupBundle(bundleSource) {
  const stateMatch = LINUX_BROWSER_COMMENT_SUBMIT_CLEANUP_STATE_PATTERN.exec(bundleSource);
  const currentStateMatch =
    LINUX_BROWSER_COMMENT_SUBMIT_CLEANUP_REMOVE_BROWSER_COMMENTS_PATTERN.exec(bundleSource);
  const hasCurrentContext =
    LINUX_BROWSER_COMMENT_SUBMIT_CLEANUP_CONTEXT_26_616_PATTERN.test(bundleSource);
  const detected = {
    overlaySubmitMessage: bundleSource.includes('browser-sidebar-comment-overlay-submit'),
    commentAttachments: bundleSource.includes('commentAttachments:'),
    submitContext:
      LINUX_BROWSER_COMMENT_SUBMIT_CLEANUP_CONTEXT_PATTERN.test(bundleSource) ||
      hasCurrentContext,
    cleanupState: stateMatch != null || (currentStateMatch != null && hasCurrentContext),
    browserCommentFilter:
      (stateMatch != null &&
        findLinuxBrowserCommentAttachmentFilter(bundleSource, {
          commentsVar: stateMatch.groups.commentsVar,
          onCommentsChangeVar: stateMatch.groups.onCommentsChangeVar
        }) != null) ||
      (currentStateMatch != null && hasCurrentContext)
  };

  return {
    detected,
    missingAnchors: [
      !detected.overlaySubmitMessage && 'overlay submit event marker',
      !detected.commentAttachments && 'comment attachments field',
      !detected.submitContext && 'submit context creation block',
      !detected.cleanupState && 'browser comment cleanup state',
      !detected.browserCommentFilter && 'browser comment attachment filter'
    ].filter(Boolean)
  };
}

function analyzeLinuxBackgroundSubagentsPanelBundle(bundleSource) {
  const detected = {
    panelSummary: bundleSource.includes('composer.backgroundSubagents.summary'),
    panelPlaceholderState: bundleSource.includes('isBackgroundSubagentsPanelVisible:'),
    panelVisibilityGate:
      LINUX_BACKGROUND_SUBAGENTS_PANEL_VISIBILITY_PATTERN.test(bundleSource) ||
      LINUX_BACKGROUND_SUBAGENTS_PANEL_CURRENT_VISIBILITY_PATTERN.test(bundleSource) ||
      LINUX_BACKGROUND_SUBAGENTS_PANEL_FALSE_GATE_PATTERN.test(bundleSource)
  };

  return {
    detected,
    missingAnchors: [
      !detected.panelSummary && 'background subagents summary marker',
      !detected.panelPlaceholderState && 'background subagents placeholder state',
      !detected.panelVisibilityGate && 'background subagents visibility gate'
    ].filter(Boolean)
  };
}

function analyzeLinuxLatestAgentTurnExpansionBundle(bundleSource) {
  const detected = {
    collapseToggleSummary: bundleSource.includes('collapsedMessageCount:'),
    latestTurnFlag: bundleSource.includes('shouldAutoExpandMcpApps:'),
    persistedCollapsedState: bundleSource.includes('persistedCollapsed:'),
    collapseDefaultGate: LINUX_LATEST_AGENT_TURN_EXPANSION_PATTERN.test(bundleSource)
  };

  return {
    detected,
    missingAnchors: [
      !detected.collapseToggleSummary && 'collapsed message summary marker',
      !detected.latestTurnFlag && 'latest turn expansion flag',
      !detected.persistedCollapsedState && 'persisted collapsed state',
      !detected.collapseDefaultGate && 'latest agent turn collapse default gate'
    ].filter(Boolean)
  };
}

function buildLinuxWorktreeEnvironmentMainPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    LINUX_WORKTREE_ENVIRONMENT_MAIN_PATCH_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeLinuxWorktreeEnvironmentMainBundle(bundleSource)
  );
}

function buildLinuxWorktreeEnvironmentWorkerPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    LINUX_WORKTREE_ENVIRONMENT_WORKER_PATCH_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeLinuxWorktreeEnvironmentWorkerBundle(bundleSource)
  );
}

function analyzeLinuxWorktreeEnvironmentMainBundle(bundleSource) {
  const pendingMatch = bundleSource.match(LINUX_WORKTREE_ENVIRONMENT_PENDING_REQUEST_PATTERN);
  const managedMatch = bundleSource.match(LINUX_WORKTREE_ENVIRONMENT_MANAGED_REQUEST_PATTERN);
  const detected = {
    worktreeServiceClass: LINUX_WORKTREE_ENVIRONMENT_MAIN_HELPER_PATTERN.test(bundleSource),
    pendingCreateRequest: pendingMatch != null,
    pendingReadyLog:
      pendingMatch?.groups != null &&
      bundleSource.includes(
        `hasLocalEnvironment:${pendingMatch.groups.entryVar}.localEnvironmentConfigPath!=null`
      ),
    managedCreateRequest: managedMatch != null,
    managedReadyLog:
      managedMatch?.groups != null &&
      bundleSource.includes(`hasLocalEnvironment:${managedMatch.groups.envVar}!=null`)
  };

  return {
    detected,
    missingAnchors: [
      !detected.worktreeServiceClass && 'worktree service class marker',
      !detected.pendingCreateRequest && 'pending worktree create request',
      !detected.pendingReadyLog && 'pending worktree ready log',
      !detected.managedCreateRequest && 'managed worktree create request',
      !detected.managedReadyLog && 'managed worktree ready log'
    ].filter(Boolean)
  };
}

function analyzeLinuxWorktreeEnvironmentWorkerBundle(bundleSource) {
  const detected = {
    createWorktreeFunction: LINUX_WORKTREE_ENVIRONMENT_WORKER_HELPER_PATTERN.test(bundleSource),
    cleanupHelper: LINUX_WORKTREE_ENVIRONMENT_WORKER_CLEANUP_HELPER_PATTERN.test(bundleSource),
    storedEnvironmentSelection: LINUX_WORKTREE_ENVIRONMENT_WORKER_CREATE_PATTERN.test(bundleSource),
    setupSkipBranch: bundleSource.includes('No local environment selected'),
    cleanupCall: LINUX_WORKTREE_ENVIRONMENT_WORKER_CLEANUP_CALL_PATTERN.test(bundleSource),
    moveToLocalSuccess: LINUX_WORKTREE_ENVIRONMENT_WORKER_MOVE_TO_LOCAL_SUCCESS_PATTERN.test(
      bundleSource
    ),
    cleanupSkipBranch: bundleSource.includes('if(i==null||i===`__none__`)return;')
  };

  return {
    detected,
    missingAnchors: [
      !detected.createWorktreeFunction && 'create-worktree function marker',
      !detected.cleanupHelper && 'cleanup helper function',
      !detected.storedEnvironmentSelection && 'stored environment selection branch',
      !detected.setupSkipBranch && 'missing-environment setup skip branch',
      !detected.cleanupCall && 'cleanup invocation',
      !detected.moveToLocalSuccess && 'move-thread-to-local success path',
      !detected.cleanupSkipBranch && 'cleanup skip branch'
    ].filter(Boolean)
  };
}

function replaceSnippetOrThrow(source, target, replacement, errorMessage) {
  if (!source.includes(target)) {
    throw new Error(errorMessage);
  }
  return source.replace(target, replacement);
}

function replaceAllSnippetsOrThrow(source, target, replacement, errorMessage) {
  if (!source.includes(target)) {
    throw new Error(errorMessage);
  }
  return source.replaceAll(target, replacement);
}

function replaceFirstMatchingSnippetOrThrow(source, variants, errorMessage) {
  for (const { target, replacement } of variants) {
    if (!source.includes(target)) {
      continue;
    }
    return source.replace(target, replacement);
  }
  throw new Error(errorMessage);
}

function replaceRegexOrThrow(source, pattern, replacement, errorMessage) {
  const match = source.match(pattern);
  if (!match?.groups) {
    throw new Error(errorMessage);
  }
  return source.replace(pattern, () =>
    typeof replacement === 'function' ? replacement(match.groups, match) : replacement
  );
}

function replaceFirstMatchingRegexOrThrow(source, variants, errorMessage) {
  for (const { pattern, replacement } of variants) {
    const match = source.match(pattern);
    if (!match?.groups) {
      continue;
    }
    return source.replace(pattern, () =>
      typeof replacement === 'function' ? replacement(match.groups, match) : replacement
    );
  }
  throw new Error(errorMessage);
}

function buildOpenTargetsPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    'Could not patch the upstream open-in-targets registry for Linux.',
    sourceName,
    analyzeOpenTargetsBundle(bundleSource)
  );
}

function analyzeOpenTargetsBundle(bundleSource) {
  const weakMapPatternDetected = OPEN_TARGETS_BLOCK_WEAKMAP_PATTERN.test(bundleSource);
  const workerRegistryDetected = OPEN_TARGETS_WORKER_REGISTRY_PATTERN.test(bundleSource);
  const dynamicRegistryDetected = OPEN_TARGETS_DYNAMIC_REGISTRY_PATTERN.test(bundleSource);
  const detected = {
    openInTargets: bundleSource.includes('`open-in-targets`'),
    targetRegistryDeclaration:
      OPEN_TARGETS_BLOCK_PATTERN.test(bundleSource) ||
      weakMapPatternDetected ||
      workerRegistryDetected ||
      dynamicRegistryDetected,
    platformFlatten:
      /function [A-Za-z_$][\w$]*\(e\)\{return [A-Za-z_$][\w$]*\.flatMap\(t=>\{let n=t\.platforms\[e\];return n\?\[\{id:t\.id,\.\.\.n\}\]:\[\]\}\)\}/.test(
        bundleSource
      ) || workerRegistryDetected,
    editorTargetIdSet:
      /new Set\([A-Za-z_$][\w$]*\.filter\(e=>e\.kind===`editor`\)\.map\(e=>e\.id\)\)/.test(
        bundleSource
      ) ||
      /function [A-Za-z_$][\w$]*\(e,t=[A-Za-z_$][\w$]*\)\{return t\.some\(t=>t\.id===e&&t\.kind===`editor`\)\}/.test(
        bundleSource
      ) ||
      workerRegistryDetected
  };

  return {
    detected,
    missingAnchors: [
      !detected.openInTargets && 'open-in-targets marker',
      !detected.targetRegistryDeclaration && 'target registry declaration',
      !detected.platformFlatten && 'platform target flatten function',
      !detected.editorTargetIdSet && 'editor target id set'
    ].filter(Boolean)
  };
}

function buildLinuxMenuBarPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    'Could not patch Linux native menu-bar auto-hide behavior in the Electron main bundle.',
    sourceName,
    analyzeLinuxMenuBarBundle(bundleSource)
  );
}

function buildLinuxTitleBarOverlayPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    LINUX_TITLE_BAR_OVERLAY_PATCH_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeLinuxTitleBarOverlayBundle(bundleSource)
  );
}

function buildLinuxTitleBarOverlayThemeSyncPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    LINUX_TITLE_BAR_OVERLAY_PATCH_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeLinuxTitleBarOverlayThemeSyncBundle(bundleSource)
  );
}

function buildLinuxNativeWindowFramePatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    LINUX_NATIVE_WINDOW_FRAME_PATCH_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeLinuxNativeWindowFrameBundle(bundleSource)
  );
}

function buildLinuxPrimaryWindowModeControlsPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    LINUX_PRIMARY_WINDOW_MODE_CONTROLS_PATCH_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeLinuxPrimaryWindowModeControlsBundle(bundleSource)
  );
}

function buildLinuxWindowFocusableOptionPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    LINUX_WINDOW_FOCUSABLE_OPTION_PATCH_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeLinuxWindowFocusableOptionBundle(bundleSource)
  );
}

function buildLinuxWindowIconPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    LINUX_WINDOW_ICON_PATCH_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeLinuxWindowIconBundle(bundleSource)
  );
}

function buildLinuxAboutDialogPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    'Could not patch Linux About dialog fallback in the Electron main bundle.',
    sourceName,
    analyzeLinuxAboutDialogBundle(bundleSource)
  );
}

function buildLinuxCloseCancelPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    'Could not patch Linux close-cancel behavior in the Electron main bundle.',
    sourceName,
    analyzeLinuxCloseCancelBundle(bundleSource)
  );
}

function buildLinuxNotificationSoundPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    LINUX_NOTIFICATION_SOUND_PATCH_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeLinuxNotificationSoundBundle(bundleSource)
  );
}

function buildLinuxBrowserUseHostFetchPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    LINUX_BROWSER_USE_HOST_FETCH_PATCH_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeLinuxBrowserUseHostFetchBundle(bundleSource)
  );
}

function buildLinuxBrowserUseRuntimePathsPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    LINUX_BROWSER_USE_RUNTIME_PATHS_PATCH_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeLinuxBrowserUseRuntimePathsBundle(bundleSource)
  );
}

function buildLinuxBundledBrowserChromePluginsPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    LINUX_BUNDLED_BROWSER_CHROME_PLUGINS_PATCH_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeLinuxBundledBrowserChromePluginsBundle(bundleSource)
  );
}

function buildLinuxChromeExtensionSettingsPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    LINUX_CHROME_EXTENSION_SETTINGS_PATCH_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeLinuxChromeExtensionSettingsBundle(bundleSource)
  );
}

function buildLinuxChromeNativeHostRuntimePathsPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    LINUX_CHROME_NATIVE_HOST_RUNTIME_PATHS_PATCH_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeLinuxChromeNativeHostRuntimePathsBundle(bundleSource)
  );
}

function buildLinuxOwlFeatureBindingPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    LINUX_OWL_FEATURE_BINDING_PATCH_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeLinuxOwlFeatureBindingBundle(bundleSource)
  );
}

function buildLinuxRemoteControlPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    LINUX_REMOTE_CONTROL_PATCH_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeLinuxRemoteControlBundle(bundleSource)
  );
}

function buildLinuxRemoteControlVisibilityPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    LINUX_REMOTE_CONTROL_VISIBILITY_PATCH_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeLinuxRemoteControlVisibilityBundle(bundleSource)
  );
}

function buildLinuxComputerUseUiPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    LINUX_COMPUTER_USE_UI_PATCH_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeLinuxComputerUseUiBundle(bundleSource)
  );
}

function buildLinuxPowerSaveBlockerPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    LINUX_POWER_SAVE_BLOCKER_PATCH_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeLinuxPowerSaveBlockerBundle(bundleSource)
  );
}

function buildLinuxRemoteControlKeepAwakePatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    LINUX_REMOTE_CONTROL_KEEP_AWAKE_PATCH_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeLinuxRemoteControlKeepAwakeBundle(bundleSource)
  );
}

function buildLinuxAvatarOverlayPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    LINUX_AVATAR_OVERLAY_PATCH_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeLinuxAvatarOverlayBundle(bundleSource)
  );
}

function buildLinuxAvatarOverlayRendererPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    LINUX_AVATAR_OVERLAY_RENDERER_PATCH_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeLinuxAvatarOverlayRendererBundle(bundleSource)
  );
}

function buildLinuxPetYappingUsagePatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    LINUX_PET_YAPPING_USAGE_PATCH_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeLinuxPetYappingUsageBundle(bundleSource)
  );
}

function buildLinuxPetYappingUsageMainPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    LINUX_PET_YAPPING_USAGE_MAIN_PATCH_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeLinuxPetYappingUsageMainBundle(bundleSource)
  );
}

function analyzeLinuxMenuBarBundle(bundleSource) {
  const hasWin32OnlyAutoHideMenuBarTernary = bundleSource.includes(
    LINUX_MENU_BAR_AUTO_HIDE_SNIPPET_CURRENT
  );
  const hasWin32OrLinuxAutoHideMenuBarTernary = bundleSource.includes(
    LINUX_MENU_BAR_AUTO_HIDE_SNIPPET_26_609
  );
  const detected = {
    browserWindowConstructor: /new [A-Za-z_$][\w$]*\.BrowserWindow\(\{/.test(bundleSource),
    autoHideMenuBarOption: bundleSource.includes('autoHideMenuBar:!0'),
    win32AutoHideMenuBarTernary: hasWin32OnlyAutoHideMenuBarTernary,
    win32OrLinuxAutoHideMenuBarTernary: hasWin32OrLinuxAutoHideMenuBarTernary
  };

  return {
    detected,
    missingAnchors: [
      !detected.browserWindowConstructor && 'BrowserWindow constructor',
      !detected.autoHideMenuBarOption && 'autoHideMenuBar option',
      !hasWin32OnlyAutoHideMenuBarTernary &&
        !hasWin32OrLinuxAutoHideMenuBarTernary &&
        'supported autoHideMenuBar platform ternary'
    ].filter(Boolean)
  };
}

function analyzeLinuxTitleBarOverlayBundle(bundleSource) {
  const hasOverlayOptionsFunction =
    LINUX_TITLE_BAR_OVERLAY_OPTIONS_PATTERN.test(bundleSource) ||
    LINUX_TITLE_BAR_OVERLAY_PATCHED_OPTIONS_PATTERN.test(bundleSource) ||
    LINUX_TITLE_BAR_OVERLAY_CURRENT_PATCHED_OPTIONS_PATTERN.test(bundleSource);
  const detected = {
    titleBarOverlayOption: bundleSource.includes('titleBarOverlay'),
    nativeThemeDarkColorCheck: bundleSource.includes('.nativeTheme.shouldUseDarkColors'),
    symbolColorOption: bundleSource.includes('symbolColor:'),
    overlayOptionsFunction: hasOverlayOptionsFunction
  };

  return {
    detected,
    missingAnchors: [
      !detected.titleBarOverlayOption && 'titleBarOverlay option',
      !detected.nativeThemeDarkColorCheck && 'nativeTheme dark-color check',
      !detected.symbolColorOption && 'symbolColor option',
      !detected.overlayOptionsFunction && 'titleBarOverlay options helper'
    ].filter(Boolean)
  };
}

function analyzeLinuxTitleBarOverlayThemeSyncBundle(bundleSource) {
  const detected = {
    setTitleBarOverlayCall: bundleSource.includes('setTitleBarOverlay('),
    windowZoomState: bundleSource.includes('windowZooms=new Map'),
    windowZoomMethod: LINUX_TITLE_BAR_OVERLAY_WINDOW_ZOOM_PATTERN.test(bundleSource),
    powerSaveDispatchCase: LINUX_TITLE_BAR_OVERLAY_MESSAGE_CASE_PATTERN.test(bundleSource)
  };

  return {
    detected,
    missingAnchors: [
      !detected.setTitleBarOverlayCall && 'setTitleBarOverlay call',
      !detected.windowZoomState && 'window zoom state',
      !detected.windowZoomMethod && 'setWindowZoom method',
      !detected.powerSaveDispatchCase && 'message dispatch switch'
    ].filter(Boolean)
  };
}

function analyzeLinuxNativeWindowFrameBundle(bundleSource) {
  const detected = {
    titleBarStyleHidden: bundleSource.includes('titleBarStyle:`hidden`'),
    titleBarStyleDefault: bundleSource.includes('titleBarStyle:`default`'),
    linuxHiddenTitleBarBranch: LINUX_NATIVE_WINDOW_FRAME_PRIMARY_BRANCH_PATTERN.test(bundleSource),
    titleBarOverlayOption: bundleSource.includes('titleBarOverlay')
  };

  return {
    detected,
    missingAnchors: [
      !detected.titleBarStyleHidden && 'hidden titleBarStyle option',
      !detected.titleBarStyleDefault && 'default titleBarStyle option',
      !detected.titleBarOverlayOption && 'titleBarOverlay option',
      !detected.linuxHiddenTitleBarBranch && 'Linux hidden titlebar primary branch'
    ].filter(Boolean)
  };
}

function analyzeLinuxPrimaryWindowModeControlsBundle(bundleSource) {
  const detected = {
    windowModeMessage: bundleSource.includes('electron-set-window-mode'),
    primaryWindowModeState: bundleSource.includes('primaryWindowMode'),
    disableControlsSequence: LINUX_PRIMARY_WINDOW_MODE_DISABLE_CONTROLS_PATTERN.test(bundleSource)
  };

  return {
    detected,
    missingAnchors: [
      !detected.windowModeMessage && 'window mode message',
      !detected.primaryWindowModeState && 'primary window mode state',
      !detected.disableControlsSequence && 'primary window mode disable controls sequence'
    ].filter(Boolean)
  };
}

function analyzeLinuxWindowFocusableOptionBundle(bundleSource) {
  const detected = {
    browserWindowConstructor: /new [A-Za-z_$][\w$]*\.BrowserWindow\(\{/.test(bundleSource),
    parentOption: bundleSource.includes('parent:'),
    focusableOption: bundleSource.includes('focusable:'),
    unconditionalFocusableOption: LINUX_WINDOW_FOCUSABLE_OPTION_PATTERN.test(bundleSource)
  };

  return {
    detected,
    missingAnchors: [
      !detected.browserWindowConstructor && 'BrowserWindow constructor',
      !detected.parentOption && 'parent option',
      !detected.focusableOption && 'focusable option',
      !detected.unconditionalFocusableOption && 'unconditional focusable option'
    ].filter(Boolean)
  };
}

function analyzeLinuxWindowIconBundle(bundleSource) {
  const detected = {
    browserWindowConstructor: /new [A-Za-z_$][\w$]*\.BrowserWindow\(\{/.test(bundleSource),
    mainWindowBackdropCall: bundleSource.includes('this.applyWindowBackdrop'),
    webPreferencesOption: bundleSource.includes('webPreferences:'),
    mainBrowserWindowConstructor: LINUX_WINDOW_ICON_BROWSER_WINDOW_PATTERN.test(bundleSource)
  };

  return {
    detected,
    missingAnchors: [
      !detected.browserWindowConstructor && 'BrowserWindow constructor',
      !detected.mainWindowBackdropCall && 'main window backdrop call',
      !detected.webPreferencesOption && 'webPreferences option',
      !detected.mainBrowserWindowConstructor && 'main BrowserWindow constructor'
    ].filter(Boolean)
  };
}

function analyzeLinuxAboutDialogBundle(bundleSource) {
  const detected = {
    aboutDialogIntlId: bundleSource.includes('codex.aboutDialog.title'),
    aboutDialogDefaultTitle: bundleSource.includes('About {appName}'),
    aboutDialogMenuClick: LINUX_ABOUT_DIALOG_CLICK_PATTERN.test(bundleSource),
    browserWindowConstructor: /new [A-Za-z_$][\w$]*\.BrowserWindow\(\{/.test(bundleSource),
    dialogShowMessageBox: /[A-Za-z_$][\w$]*\.dialog\.showMessageBox/.test(bundleSource)
  };

  return {
    detected,
    missingAnchors: [
      !detected.aboutDialogIntlId && 'About dialog intl id',
      !detected.aboutDialogDefaultTitle && 'About dialog default title',
      !detected.aboutDialogMenuClick && 'About menu click handler',
      !detected.browserWindowConstructor && 'BrowserWindow constructor',
      !detected.dialogShowMessageBox && 'dialog showMessageBox support'
    ].filter(Boolean)
  };
}

function analyzeLinuxCloseCancelBundle(bundleSource) {
  const detected = {
    beforeQuitHandler: /[A-Za-z_$][\w$]*\.app\.on\(`before-quit`/.test(bundleSource),
    quitCancelPrompt: bundleSource.includes('buttons:[`Quit`,`Cancel`]'),
    cancelPreventDefault: /[A-Za-z_$][\w$]*\.preventDefault\(\);return/.test(bundleSource),
    showLastActivePrimaryWindow: bundleSource.includes('showLastActivePrimaryWindow()'),
    ensureWindowDependency:
      bundleSource.includes('ensureHostWindow:') || bundleSource.includes('ensureLocalWindow:')
  };

  return {
    detected,
    missingAnchors: [
      !detected.beforeQuitHandler && 'before-quit handler',
      !detected.quitCancelPrompt && 'Quit/Cancel confirmation dialog',
      !detected.cancelPreventDefault && 'cancel preventDefault branch',
      !detected.showLastActivePrimaryWindow && 'showLastActivePrimaryWindow hook',
      !detected.ensureWindowDependency && 'ensure window dependency'
    ].filter(Boolean)
  };
}

function analyzeLinuxNotificationSoundBundle(bundleSource) {
  const detected = {
    notificationManager: bundleSource.includes('desktop-notifications'),
    macosSoundOption: bundleSource.includes('sound:this.options.platform===`darwin`'),
    notificationShowCall: LINUX_NOTIFICATION_SOUND_SHOW_PATTERN.test(bundleSource),
    resourceSoundPath: bundleSource.includes('process.resourcesPath') && bundleSource.includes('.wav'),
    childProcessImport: LINUX_NOTIFICATION_SOUND_CHILD_PROCESS_PATTERN.test(bundleSource)
  };

  return {
    detected,
    missingAnchors: [
      !detected.notificationManager && 'desktop-notifications logger',
      !detected.macosSoundOption && 'macOS sound option',
      !detected.notificationShowCall && 'notification show call',
      !detected.resourceSoundPath && 'resource notification sound path',
      !detected.childProcessImport && 'child_process import'
    ].filter(Boolean)
  };
}

function analyzeLinuxBrowserUseHostFetchBundle(bundleSource) {
  const detected = {
    authHeaderHelper: BROWSER_USE_AUTH_HEADER_HELPER_PATTERN.test(bundleSource),
    desktopOriginator:
      BROWSER_USE_DESKTOP_ORIGINATOR_OPTIONS_PATTERN.test(bundleSource) ||
      BROWSER_USE_DESKTOP_ORIGINATOR_LEGACY_PATTERN.test(bundleSource),
    nativePipeRegistry:
      BROWSER_USE_HOST_FETCH_HELPER_ANCHOR_PATTERN.test(bundleSource) ||
      BROWSER_USE_HOST_FETCH_INLINE_STATE_PATTERN.test(bundleSource) ||
      BROWSER_USE_IAB_REGISTRY_OPTIONS_26_616_PATTERN.test(bundleSource),
    iabApiClass: BROWSER_USE_IAB_API_PING_ANCHOR_PATTERN.test(bundleSource),
    iabRegistryOptions:
      BROWSER_USE_IAB_REGISTRY_OPTIONS_PATTERN.test(bundleSource) ||
      BROWSER_USE_IAB_REGISTRY_OPTIONS_26_527_PATTERN.test(bundleSource) ||
      BROWSER_USE_IAB_REGISTRY_OPTIONS_26_616_PATTERN.test(bundleSource),
    registryInstantiation: BROWSER_SESSION_REGISTRY_INSTANTIATION_PATTERN.test(bundleSource)
  };

  return {
    detected,
    missingAnchors: [
      !detected.authHeaderHelper && 'authenticated API header helper',
      !detected.desktopOriginator && 'desktop originator value',
      !detected.nativePipeRegistry && 'Browser Use native pipe registry',
      !detected.iabApiClass && 'IAB API class',
      !detected.iabRegistryOptions && 'IAB route backend options',
      !detected.registryInstantiation && 'Browser session registry instantiation'
    ].filter(Boolean)
  };
}

function analyzeLinuxBrowserUseRuntimePathsBundle(bundleSource) {
  const detected = {
    runtimeResolver: BROWSER_USE_RUNTIME_PATHS_FUNCTION_PATTERN.test(bundleSource),
    runtimeReturn: BROWSER_USE_RUNTIME_PATHS_RETURN_PATTERN.test(bundleSource),
    nodeReplPath: bundleSource.includes('nodeReplPath'),
    resourcesPath: bundleSource.includes('resourcesPath')
  };

  return {
    detected,
    missingAnchors: [
      !detected.runtimeResolver && 'Browser Use runtime path resolver',
      !detected.runtimeReturn && 'Browser Use runtime path return object',
      !detected.nodeReplPath && 'nodeReplPath field',
      !detected.resourcesPath && 'resourcesPath field'
    ].filter(Boolean)
  };
}

function analyzeLinuxBundledBrowserChromePluginsBundle(bundleSource) {
  const detected = {
    reconcilerAnchor: BUNDLED_PLUGIN_RECONCILER_ANCHOR_PATTERN.test(bundleSource),
    reconcilerContext: BUNDLED_PLUGIN_RECONCILER_CONTEXT_PATTERN.test(bundleSource),
    descriptorSelector: BUNDLED_PLUGIN_DESCRIPTOR_SELECTOR_PATTERN.test(bundleSource),
    marketplaceMaterializer: BUNDLED_PLUGIN_MARKETPLACE_FILTER_26_609_PATTERN.test(bundleSource),
    bundledPluginsLogger: bundleSource.includes('bundled-plugins'),
    marketplacePluginNames: bundleSource.includes('marketplacePluginNames')
  };
  const hasLegacyShape =
    detected.reconcilerAnchor && detected.reconcilerContext && detected.descriptorSelector;
  const hasMaterializerShape = detected.marketplaceMaterializer;

  return {
    detected,
    missingAnchors: [
      !hasLegacyShape &&
        !hasMaterializerShape &&
        'bundled plugin legacy selector or marketplace materializer',
      !detected.bundledPluginsLogger && 'bundled-plugins logger',
      !detected.marketplacePluginNames && 'marketplacePluginNames flow'
    ].filter(Boolean)
  };
}

function analyzeLinuxChromeExtensionSettingsBundle(bundleSource) {
  const detected = {
    chromeExtensionUrl: LINUX_CHROME_EXTENSION_URL_HELPER_PATTERN.test(bundleSource),
    profileDirHelper: LINUX_CHROME_EXTENSION_PROFILE_DIR_PATTERN.test(bundleSource),
    openSettingsHelper: LINUX_CHROME_EXTENSION_OPEN_SETTINGS_PATTERN.test(bundleSource)
  };

  return {
    detected,
    missingAnchors: [
      !detected.chromeExtensionUrl && 'Chrome extension URL helper',
      !detected.profileDirHelper && 'Chrome profile directory helper',
      !detected.openSettingsHelper && 'Chrome extension open helper'
    ].filter(Boolean)
  };
}

function analyzeLinuxChromeNativeHostRuntimePathsBundle(bundleSource) {
  const detected = {
    nativeHostRegistry: bundleSource.includes('chrome-native-hosts-v2.json'),
    registrationFunction:
      CHROME_NATIVE_HOST_RUNTIME_PATHS_REGISTRATION_PATTERN.test(bundleSource) ||
      CHROME_NATIVE_HOST_RUNTIME_PATHS_RETURN_26_616_PATTERN.test(bundleSource),
    nodeReplPath: bundleSource.includes('nodeReplPath'),
    resourcesPath: bundleSource.includes('resourcesPath')
  };

  return {
    detected,
    missingAnchors: [
      !detected.nativeHostRegistry && 'Chrome native host v2 registry',
      !detected.registrationFunction && 'Chrome native host registration function',
      !detected.nodeReplPath && 'nodeReplPath field',
      !detected.resourcesPath && 'resourcesPath field'
    ].filter(Boolean)
  };
}

function analyzeLinuxOwlFeatureBindingBundle(bundleSource) {
  const linkedBindingHelper =
    LINUX_OWL_FEATURE_BINDING_PATTERN.test(bundleSource) ||
    LINUX_OWL_FEATURE_BINDING_NULLABLE_PATTERN.test(bundleSource);
  const detected = {
    owlFeatureBinding: bundleSource.includes('electron_common_owl_features'),
    linkedBindingHelper,
    featureSwitchReader:
      bundleSource.includes('enable-features') && bundleSource.includes('disable-features'),
    featurePredicate: bundleSource.includes('isOwlFeatureEnabled')
  };

  return {
    detected,
    missingAnchors: [
      !detected.owlFeatureBinding && 'Owl native feature binding name',
      !detected.linkedBindingHelper && 'Owl linkedBinding helper',
      !detected.featureSwitchReader && 'Electron feature switch readers',
      !detected.featurePredicate && 'isOwlFeatureEnabled predicate'
    ].filter(Boolean)
  };
}

function analyzeLinuxRemoteControlBundle(bundleSource) {
  const detected = {
    featureAvailabilityDefaults: /control:!1/.test(bundleSource),
    windowsComputerUseHelper: bundleSource.includes('CODEX_ELECTRON_ENABLE_WINDOWS_COMPUTER_USE'),
    availabilityPatchFunction:
      LINUX_REMOTE_CONTROL_FEATURE_AVAILABILITY_PATTERN.test(bundleSource) ||
      LINUX_REMOTE_CONTROL_FEATURE_AVAILABILITY_WITH_OVERRIDES_PATTERN.test(bundleSource) ||
      LINUX_REMOTE_CONTROL_FEATURE_AVAILABILITY_WITH_DEVICE_ATTESTATION_PATTERN.test(bundleSource) ||
      LINUX_REMOTE_CONTROL_FEATURE_AVAILABILITY_WITH_MAC_NODE_REPL_PATTERN.test(bundleSource)
  };

  return {
    detected,
    missingAnchors: [
      !detected.featureAvailabilityDefaults && 'desktop feature availability control flag',
      !detected.windowsComputerUseHelper && 'desktop feature availability helper',
      !detected.availabilityPatchFunction && 'Windows computer-use availability branch'
    ].filter(Boolean)
  };
}

function analyzeLinuxRemoteControlVisibilityBundle(bundleSource) {
  const detected = {
    remoteControlStateAtom: bundleSource.includes('remote_control_connections_state'),
    slingshotVisibilityGate: bundleSource.includes('slingshotEnabled'),
    remoteControlVisibilityHelper: LINUX_REMOTE_CONTROL_VISIBILITY_PATTERN.test(bundleSource),
    accessRequiredGate: bundleSource.includes('accessRequired!==!0')
  };

  return {
    detected,
    missingAnchors: [
      !detected.remoteControlStateAtom && 'remote-control connections state atom',
      !detected.slingshotVisibilityGate && 'slingshot visibility gate',
      !detected.remoteControlVisibilityHelper && 'remote-control visibility helper',
      !detected.accessRequiredGate && 'remote-control access-required gate'
    ].filter(Boolean)
  };
}

function analyzeLinuxComputerUseUiBundle(bundleSource) {
  const detected = {
    computerUseFeatureQuery: bundleSource.includes('featureName:`computer_use`'),
    windowsComputerUseGate: bundleSource.includes('windows_computer_use'),
    gateAvailabilityCall: LINUX_COMPUTER_USE_UI_AVAILABILITY_CALL_PATTERN.test(bundleSource),
    hostPlatformPredicate: LINUX_COMPUTER_USE_UI_HOST_PLATFORM_PATTERN.test(bundleSource),
    installedPatchMarker: bundleSource.includes(LINUX_COMPUTER_USE_UI_PATCH_MARKER)
  };

  return {
    detected,
    missingAnchors: [
      !detected.computerUseFeatureQuery &&
        !detected.windowsComputerUseGate &&
        'Computer Use feature gate',
      !detected.gateAvailabilityCall && 'Computer Use availability helper call',
      !detected.hostPlatformPredicate &&
        !detected.installedPatchMarker &&
        'host platform compatibility predicate'
    ].filter(Boolean)
  };
}

function analyzeLinuxPowerSaveBlockerBundle(bundleSource) {
  const detected = {
    powerSaveBlockerState: bundleSource.includes('powerSaveBlockerId=null'),
    remoteControlPowerSaveState: bundleSource.includes('pluggedInRemoteControlPowerSaveWebContentsIds'),
    batteryMonitor: bundleSource.includes('powerMonitor.isOnBatteryPower()'),
    preventAppSuspension: bundleSource.includes('powerSaveBlocker.start(`prevent-app-suspension`)'),
    syncMethod: LINUX_POWER_SAVE_BLOCKER_SYNC_PATTERN.test(bundleSource)
  };

  return {
    detected,
    missingAnchors: [
      !detected.powerSaveBlockerState && 'power-save blocker state',
      !detected.remoteControlPowerSaveState && 'remote-control power-save state',
      !detected.batteryMonitor && 'battery monitor check',
      !detected.preventAppSuspension && 'Electron prevent-app-suspension blocker',
      !detected.syncMethod && 'power-save sync method'
    ].filter(Boolean)
  };
}

function analyzeLinuxRemoteControlKeepAwakeBundle(bundleSource) {
  const hasLegacySettings =
    bundleSource.includes('PREVENT_SLEEP_WHILE_RUNNING') &&
    bundleSource.includes('KEEP_REMOTE_CONTROL_AWAKE_WHILE_PLUGGED_IN');
  const hasCurrentSettings =
    bundleSource.includes('preventSleepWhileRunning') &&
    bundleSource.includes('keepRemoteControlAwakeWhilePluggedIn');
  const detected = {
    powerSaveDispatch: bundleSource.includes('power-save-blocker-set'),
    preventSleepSetting:
      bundleSource.includes('PREVENT_SLEEP_WHILE_RUNNING') ||
      bundleSource.includes('preventSleepWhileRunning'),
    remoteKeepAwakeSetting:
      bundleSource.includes('KEEP_REMOTE_CONTROL_AWAKE_WHILE_PLUGGED_IN') ||
      bundleSource.includes('keepRemoteControlAwakeWhilePluggedIn'),
    remoteControlEnabled:
      bundleSource.includes('local_app_server_feature_enablement') || hasCurrentSettings,
    keepAwakeDispatch:
      (hasLegacySettings && LINUX_REMOTE_CONTROL_KEEP_AWAKE_DISPATCH_PATTERN.test(bundleSource)) ||
      (hasCurrentSettings &&
        LINUX_REMOTE_CONTROL_KEEP_AWAKE_CURRENT_DISPATCH_PATTERN.test(bundleSource))
  };

  return {
    detected,
    missingAnchors: [
      !detected.powerSaveDispatch && 'power-save dispatch',
      !detected.preventSleepSetting && 'prevent-sleep setting read',
      !detected.remoteKeepAwakeSetting && 'remote keep-awake setting read',
      !detected.remoteControlEnabled && 'remote-control enabled state',
      !detected.keepAwakeDispatch && 'remote keep-awake dispatch field'
    ].filter(Boolean)
  };
}

function analyzeLinuxAvatarOverlayBundle(bundleSource) {
  const detected = {
    avatarOverlayRoute: bundleSource.includes('`/avatar-overlay`'),
    avatarOverlayWindow: bundleSource.includes('appearance:`avatarOverlay`'),
    createFrontmostPolicy: LINUX_AVATAR_OVERLAY_CREATE_FRONTMOST_PATTERN.test(bundleSource),
    createWindowEnd: LINUX_AVATAR_OVERLAY_CREATE_WINDOW_END_PATTERN.test(bundleSource),
    showWindow: LINUX_AVATAR_OVERLAY_SHOW_WINDOW_PATTERN.test(bundleSource),
    setWindowBounds: LINUX_AVATAR_OVERLAY_SET_WINDOW_BOUNDS_PATTERN.test(bundleSource),
    setWindowBoundsNativeComposition:
      LINUX_AVATAR_OVERLAY_SET_WINDOW_BOUNDS_NATIVE_COMPOSITION_PATTERN.test(bundleSource) ||
      LINUX_AVATAR_OVERLAY_SET_WINDOW_BOUNDS_NATIVE_COMPOSITION_26_611_PATTERN.test(bundleSource),
    pointerPassthroughPolicy: LINUX_AVATAR_OVERLAY_POINTER_POLICY_PATTERN.test(bundleSource),
    windowOptions:
      LINUX_AVATAR_OVERLAY_WINDOW_OPTIONS_PATTERN.test(bundleSource) ||
      LINUX_AVATAR_OVERLAY_DOCK_WINDOW_OPTIONS_PATTERN.test(bundleSource),
    dragMoveIpc:
      bundleSource.includes(LINUX_AVATAR_OVERLAY_DRAG_COORDS_PATCH_MARKER) ||
      LINUX_AVATAR_OVERLAY_DRAG_MOVE_IPC_PATTERN.test(bundleSource) ||
      LINUX_AVATAR_OVERLAY_DRAG_MOVE_IPC_26_611_PATTERN.test(bundleSource),
    moveDragMethod:
      bundleSource.includes('codexLinuxAvatarOverlayScreenPoint') ||
      LINUX_AVATAR_OVERLAY_MOVE_DRAG_METHOD_PATTERN.test(bundleSource) ||
      LINUX_AVATAR_OVERLAY_MOVE_DRAG_METHOD_26_611_PATTERN.test(bundleSource) ||
      LINUX_AVATAR_OVERLAY_MOVE_DRAG_METHOD_26_623_PATTERN.test(bundleSource),
    startDrag:
      bundleSource.includes('pointerWindowX:') ||
      LINUX_AVATAR_OVERLAY_START_DRAG_PATTERN.test(bundleSource) ||
      LINUX_AVATAR_OVERLAY_START_DRAG_26_611_PATTERN.test(bundleSource) ||
      LINUX_AVATAR_OVERLAY_START_DRAG_26_623_PATTERN.test(bundleSource),
    moveDragCursor:
      (bundleSource.includes('moveDragToCurrentCursor') &&
        (bundleSource.includes('codexLinuxAvatarOverlayPoint??') ||
          LINUX_AVATAR_OVERLAY_MOVE_DRAG_CURSOR_PATTERN.test(bundleSource) ||
          LINUX_AVATAR_OVERLAY_MOVE_DRAG_CURSOR_26_527_PATTERN.test(bundleSource) ||
          LINUX_AVATAR_OVERLAY_MOVE_DRAG_CURSOR_26_608_PATTERN.test(bundleSource))) ||
      LINUX_AVATAR_OVERLAY_MOVE_DRAG_POINTER_26_611_PATTERN.test(bundleSource) ||
      LINUX_AVATAR_OVERLAY_MOVE_DRAG_POINTER_26_623_PATTERN.test(bundleSource),
    endDrag:
      bundleSource.includes('this.persistWindowBounds') ||
      LINUX_AVATAR_OVERLAY_END_DRAG_PATTERN.test(bundleSource) ||
      LINUX_AVATAR_OVERLAY_END_DRAG_26_623_PATTERN.test(bundleSource),
    throwWithVelocity:
      bundleSource.includes('this.persistWindowBounds(i);return') ||
      LINUX_AVATAR_OVERLAY_THROW_WITH_VELOCITY_PATTERN.test(bundleSource) ||
      LINUX_AVATAR_OVERLAY_THROW_WITH_VELOCITY_26_623_PATTERN.test(bundleSource)
  };

  const basePatchApplied = bundleSource.includes(LINUX_AVATAR_OVERLAY_PATCH_MARKER);
  return {
    detected,
    missingAnchors: [
      !basePatchApplied && !detected.avatarOverlayRoute && 'avatar overlay route',
      !basePatchApplied && !detected.avatarOverlayWindow && 'avatar overlay window appearance',
      !basePatchApplied &&
        !detected.createFrontmostPolicy &&
        'avatar overlay creation frontmost policy',
      !basePatchApplied && !detected.createWindowEnd && 'avatar overlay createWindow method boundary',
      !basePatchApplied && !detected.showWindow && 'avatar overlay showWindow method',
      !basePatchApplied &&
        !detected.setWindowBounds &&
        !detected.setWindowBoundsNativeComposition &&
        'avatar overlay setWindowBounds method',
      !basePatchApplied &&
        !detected.pointerPassthroughPolicy &&
        'avatar overlay pointer passthrough policy',
      !detected.dragMoveIpc && 'avatar overlay drag move IPC handler',
      !detected.moveDragMethod && 'avatar overlay moveDrag method',
      !detected.startDrag && 'avatar overlay startDrag method',
      !detected.moveDragCursor && 'avatar overlay cursor-based drag movement',
      !detected.endDrag && 'avatar overlay endDrag method',
      !detected.throwWithVelocity && 'avatar overlay drag-release momentum method'
    ].filter(Boolean)
  };
}

function analyzeLinuxAvatarOverlayRendererBundle(bundleSource) {
  const detected = {
    dragMoveDispatch:
      bundleSource.includes(LINUX_AVATAR_OVERLAY_DRAG_COORDS_PATCH_MARKER) ||
      LINUX_AVATAR_OVERLAY_RENDERER_DRAG_MOVE_PATTERN.test(bundleSource) ||
      LINUX_AVATAR_OVERLAY_RENDERER_DRAG_MOVE_POINTER_PATTERN.test(bundleSource),
    pointerSample: /let [A-Za-z_$][\w$]*=[A-Za-z_$][\w$]*\([A-Za-z_$][\w$]*\);[\s\S]*?`avatar-overlay-drag-move`/.test(
      bundleSource
    ),
    avatarOverlayMoveMessage: bundleSource.includes('`avatar-overlay-drag-move`')
  };

  return {
    detected,
    missingAnchors: [
      !detected.pointerSample && 'avatar overlay pointer sample',
      !detected.avatarOverlayMoveMessage && 'avatar overlay drag move message',
      !detected.dragMoveDispatch && 'avatar overlay drag move dispatch'
    ].filter(Boolean)
  };
}

function analyzeLinuxPetYappingUsageBundle(bundleSource) {
  const hasMascotHitRegion = bundleSource.includes('"data-avatar-overlay-hit-region"');
  const hasLegacyMascotChildren = LINUX_PET_YAPPING_USAGE_MASCOT_CHILDREN_PATTERN.test(
    bundleSource
  );
  const hasMascotHitRegionChildren =
    LINUX_PET_YAPPING_USAGE_MASCOT_HIT_REGION_PATTERN.test(bundleSource) ||
    LINUX_PET_YAPPING_USAGE_MASCOT_HIT_REGION_26_611_PATTERN.test(bundleSource) ||
    LINUX_PET_YAPPING_USAGE_MASCOT_HIT_REGION_26_623_PATTERN.test(bundleSource);
  const hasUsageBridgeImport =
    LINUX_PET_YAPPING_USAGE_VSCODE_API_IMPORT_PATTERN.test(bundleSource) ||
    LINUX_PET_YAPPING_USAGE_SETTING_STORAGE_IMPORT_PATTERN.test(bundleSource) ||
    findLinuxPetYappingUsageRolldownRequestImport(bundleSource) != null;
  const detected = {
    reactRuntime: LINUX_PET_YAPPING_USAGE_REACT_VAR_PATTERN.test(bundleSource),
    jsxRuntime: findLinuxPetYappingUsageJsxRuntime(bundleSource) != null,
    vscodeApiImport: hasUsageBridgeImport,
    mascotHitRegion: hasMascotHitRegionChildren,
    mascotChildren: hasMascotHitRegion ? hasMascotHitRegionChildren : hasLegacyMascotChildren,
    layoutQuery: LINUX_PET_YAPPING_USAGE_LAYOUT_QUERY_PATTERN.test(bundleSource)
  };

  return {
    detected,
    missingAnchors: [
      !detected.reactRuntime && 'React runtime binding',
      !detected.jsxRuntime && 'JSX runtime binding',
      !detected.vscodeApiImport && 'VS Code request bridge import',
      !detected.mascotChildren && 'mascot children array',
      !detected.layoutQuery && 'avatar overlay layout measurement query'
    ].filter(Boolean)
  };
}

function analyzeLinuxPetYappingUsageMainBundle(bundleSource) {
  const detected = {
    vscodeRequestBridge: bundleSource.includes('handleVSCodeRequest'),
    handlerMap: /handlers=\{/.test(bundleSource),
    fastModeHandler: LINUX_PET_YAPPING_USAGE_MAIN_HANDLER_PATTERN.test(bundleSource)
  };

  return {
    detected,
    missingAnchors: [
      !detected.vscodeRequestBridge && 'VS Code request bridge',
      !detected.handlerMap && 'VS Code handler map',
      !detected.fastModeHandler && 'fast-mode rollout handler anchor'
    ].filter(Boolean)
  };
}

function buildTerminalPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    'Could not patch the renderer terminal lifecycle bundle for Linux.',
    sourceName,
    analyzeTerminalBundle(bundleSource)
  );
}

function buildNewThreadModelPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    NEW_THREAD_MODEL_PATCH_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeNewThreadModelBundle(bundleSource)
  );
}

function buildNewThreadModelStatePatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    NEW_THREAD_MODEL_PATCH_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeNewThreadModelStateBundle(bundleSource)
  );
}

function buildNewThreadModelSubmitPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    NEW_THREAD_MODEL_PATCH_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeNewThreadModelSubmitBundle(bundleSource)
  );
}

function analyzeTerminalBundle(bundleSource) {
  const detected = {
    terminalComponent: bundleSource.includes(TERMINAL_COMPONENT_FILE_MARKER),
    initLogHandler: bundleSource.includes('onInitLog'),
    sessionCreate: TERMINAL_SESSION_CREATE_PATTERN.test(bundleSource),
    attach:
      TERMINAL_ATTACH_WITH_ATTACH_PATTERN.test(bundleSource) ||
      TERMINAL_ATTACH_WITH_CREATE_PATTERN.test(bundleSource) ||
      TERMINAL_ATTACH_WITH_UNSTARTED_CREATE_PATTERN.test(bundleSource),
    onAttach:
      TERMINAL_ON_ATTACH_WITH_DETAILS_PREFIX_PATTERN.test(bundleSource) ||
      TERMINAL_ON_ATTACH_NO_ARGS_PREFIX_PATTERN.test(bundleSource),
    cleanup:
      TERMINAL_CLEANUP_PATTERN_LEGACY.test(bundleSource) ||
      TERMINAL_CLEANUP_PATTERN_26_415.test(bundleSource) ||
      TERMINAL_CLEANUP_PATTERN_26_611.test(bundleSource)
  };

  return {
    detected,
    missingAnchors: [
      !detected.terminalComponent && 'data-codex-terminal marker',
      !detected.initLogHandler && 'terminal onInitLog handler',
      !detected.sessionCreate && 'terminal session creation',
      !detected.attach && 'terminal attach scheduling',
      !detected.onAttach && 'terminal attach completion hook',
      !detected.cleanup && 'terminal cleanup handoff'
    ].filter(Boolean)
  };
}

function isTerminalCandidateBundle(bundleSource) {
  const analysis = analyzeTerminalBundle(bundleSource);
  return (
    analysis.detected.terminalComponent &&
    analysis.detected.initLogHandler &&
    analysis.detected.sessionCreate
  );
}

function analyzeNewThreadModelBundle(bundleSource) {
  const stateAnalysis = analyzeNewThreadModelStateBundle(bundleSource);
  const submitAnalysis = analyzeNewThreadModelSubmitBundle(bundleSource);
  return {
    detected: {
      ...stateAnalysis.detected,
      ...submitAnalysis.detected
    },
    missingAnchors: [...stateAnalysis.missingAnchors, ...submitAnalysis.missingAnchors]
  };
}

function analyzeNewThreadModelStateBundle(bundleSource) {
  const detected = {
    selectorHook: [
      'function xf(e){',
      'function vm(e=null){',
      'function $9(e){',
      'function $9(e=null){'
    ].some((marker) => bundleSource.includes(marker)) ||
      (bundleSource.includes('modelSettings') &&
        bundleSource.includes('setModelAndReasoningEffort')),
    selectorStateBlock: [
      NEW_THREAD_MODEL_STATE_SNIPPET_CURRENT,
      NEW_THREAD_MODEL_STATE_SNIPPET_26_406,
      NEW_THREAD_MODEL_STATE_SNIPPET_26_415,
      NEW_THREAD_MODEL_STATE_SNIPPET_26_422,
      NEW_THREAD_MODEL_STATE_SNIPPET_26_422_71525,
      NEW_THREAD_MODEL_STATE_SNIPPET_26_519
    ].some((snippet) => bundleSource.includes(snippet)) ||
      NEW_THREAD_MODEL_STATE_PATTERN_26_415.test(bundleSource),
    selectorValueBranch: [
      NEW_THREAD_MODEL_SETTINGS_SNIPPET_CURRENT,
      NEW_THREAD_MODEL_SETTINGS_SNIPPET_26_415,
      NEW_THREAD_MODEL_STATE_SNIPPET_26_406,
      NEW_THREAD_MODEL_SETTINGS_SNIPPET_26_422,
      NEW_THREAD_MODEL_SETTINGS_SNIPPET_26_422_71525,
      NEW_THREAD_MODEL_SETTINGS_SNIPPET_26_519
    ].some((snippet) => bundleSource.includes(snippet)),
    selectorSetter: [
      NEW_THREAD_MODEL_SETTER_SNIPPET_CURRENT,
      NEW_THREAD_MODEL_SETTER_SNIPPET_26_406,
      NEW_THREAD_MODEL_SETTER_SNIPPET_26_415,
      NEW_THREAD_MODEL_SETTER_SNIPPET_26_422,
      NEW_THREAD_MODEL_SETTER_SNIPPET_26_422_71525,
      NEW_THREAD_MODEL_SETTER_SNIPPET_26_519
    ].some((snippet) => bundleSource.includes(snippet)) ||
      NEW_THREAD_MODEL_SETTER_PATTERN_26_415.test(bundleSource)
  };

  return {
    detected,
    missingAnchors: [
      !detected.selectorHook && 'model selector hook',
      !detected.selectorStateBlock && 'fresh-thread selector state block',
      !detected.selectorValueBranch && 'fresh-thread selector value branch',
      !detected.selectorSetter && 'fresh-thread selector setter'
    ].filter(Boolean)
  };
}

function analyzeNewThreadModelSubmitBundle(bundleSource) {
  const detected = {
    freshThreadSubmit: [
      'async function N({appServerManager:e=x,context:t,prompt:n,workspaceRoots:r,cwd:i}){',
      'async function F({requestClient:e,context:t,prompt:n,workspaceRoots:r,cwd:i,hostId:a}){',
      'async function OB({context:e,prompt:t,workspaceRoots:n,cwd:r,hostId:i,agentMode:a,serviceTier:o,collaborationMode:s,memoryPreferences:c,workspaceKind:l=`project`,projectlessOutputDirectory:u}){',
      'async function Nve({input:e,mode:t,model:n,projectId:r,thinking:i}){',
      'async function bve({input:e,mode:t,model:n,projectId:r,thinking:i}){',
      'function o({agentMode:e,workspaceRoots:t,config:r,configOverrides:o,threadDetailLevel:s,input:c,commentAttachments:l,collaborationMode:u,serviceTier:d,cwd:f,fileAttachments:p,addedFiles:m,memoryPreferences:h,threadSource:g,workspaceKind:_=`project`,projectlessOutputDirectory:v,additionalDeveloperInstructions:y}){'
    ].some((snippet) => bundleSource.includes(snippet)) ||
      (bundleSource.includes('read-config-for-host') &&
        bundleSource.includes('workspaceKind:`project`') &&
        bundleSource.includes('collaborationMode:')),
    collaborationModeSubmit: [
      NEW_THREAD_MODEL_SUBMIT_SNIPPET_CURRENT,
      NEW_THREAD_MODEL_SUBMIT_SNIPPET_26_406,
      NEW_THREAD_MODEL_SUBMIT_SNIPPET_26_415,
      NEW_THREAD_MODEL_SUBMIT_SNIPPET_26_417,
      NEW_THREAD_MODEL_SUBMIT_SNIPPET_26_422,
      NEW_THREAD_MODEL_SUBMIT_SNIPPET_26_422_71525,
      NEW_THREAD_MODEL_SUBMIT_SNIPPET_26_519
    ].some((snippet) => bundleSource.includes(snippet))
  };

  return {
    detected,
    missingAnchors: [
      !detected.freshThreadSubmit && 'fresh-thread submit builder',
      !detected.collaborationModeSubmit && 'fresh-thread collaborationMode payload'
    ].filter(Boolean)
  };
}

function isNewThreadModelCandidateBundle(bundleSource) {
  return (
    isNewThreadModelStateCandidateBundle(bundleSource) &&
    isNewThreadModelSubmitCandidateBundle(bundleSource)
  );
}

function collectNewThreadModelCandidateEvidence(bundleSource) {
  const stateAnalysis = analyzeNewThreadModelStateBundle(bundleSource);
  const submitAnalysis = analyzeNewThreadModelSubmitBundle(bundleSource);
  const stateMarkers = NEW_THREAD_MODEL_STATE_EVIDENCE_MARKERS.filter((marker) =>
    bundleSource.includes(marker)
  );
  const submitMarkers = NEW_THREAD_MODEL_SUBMIT_EVIDENCE_MARKERS.filter((marker) =>
    bundleSource.includes(marker)
  );
  const stateAnchorCount = Object.values(stateAnalysis.detected).filter(Boolean).length;
  const submitAnchorCount = Object.values(submitAnalysis.detected).filter(Boolean).length;
  const stateScore = stateMarkers.length + stateAnchorCount * 2;
  const submitScore = submitMarkers.length + submitAnchorCount * 2;
  const stateCandidate =
    stateMarkers.includes('set-model-and-reasoning-for-next-turn') ||
    stateMarkers.includes('copilot-default-model') ||
    stateMarkers.includes('set-default-model-config-for-host') ||
    stateMarkers.includes('setDefaultModelConfig') ||
    (stateMarkers.includes('modelSettings') &&
      stateMarkers.includes('setModelAndReasoningEffort')) ||
    stateAnchorCount >= 2;
  const submitCandidate =
    submitMarkers.includes('collaborationMode:') &&
    submitMarkers.includes('config:') &&
    (submitMarkers.includes('read-config-for-host') ||
      submitMarkers.includes('thread/start') ||
      submitMarkers.includes('start-conversation') ||
      submitAnalysis.detected.collaborationModeSubmit) &&
    (submitMarkers.includes('workspaceRoots:') ||
      submitMarkers.includes('fileAttachments:') ||
      submitMarkers.includes('addedFiles:') ||
      submitAnchorCount > 0);

  return {
    stateAnalysis,
    submitAnalysis,
    stateCandidate,
    submitCandidate,
    stateScore,
    submitScore,
    score: stateScore + submitScore,
    reasons: [...stateMarkers, ...submitMarkers]
  };
}

function formatNewThreadModelCandidateDetails(candidateRecords, limit = 5) {
  return candidateRecords
    .slice(0, limit)
    .map((record) => {
      const parts = [];
      if (record.stateCandidate) {
        parts.push(`state score ${record.evidence.stateScore}`);
      }
      if (record.submitCandidate) {
        parts.push(`submit score ${record.evidence.submitScore}`);
      }
      const reasons = record.evidence.reasons.slice(0, 8).join(', ');
      return `${record.assetName} (${parts.join(', ') || `score ${record.evidence.score}`}; ${reasons})`;
    })
    .join('; ');
}

function isNewThreadModelStateCandidateBundle(bundleSource) {
  return collectNewThreadModelCandidateEvidence(bundleSource).stateCandidate;
}

function isNewThreadModelSubmitCandidateBundle(bundleSource) {
  return collectNewThreadModelCandidateEvidence(bundleSource).submitCandidate;
}

function patchTodoPlanComponentCacheSignatures({
  source,
  anchorMarker,
  errorMessage,
  includeMarker
}) {
  return replaceFunctionBlockContainingAnchorOrThrow(source, anchorMarker, (block) => {
    const itemVarMatch = block.match(
      /\{item:(?<itemVar>[A-Za-z_$][\w$]*)(?:,isComplete:[A-Za-z_$][\w$]*)?\}=e/
    );
    const itemVar = itemVarMatch?.groups?.itemVar;
    if (!itemVar) {
      throw new Error(errorMessage);
    }

    const todoPlanKey = buildTodoPlanCacheKeyExpression(`${itemVar}.plan`, {
      includeMarker: includeMarker()
    });
    const itemVarPattern = escapeRegExp(itemVar);
    let replacedCount = 0;
    let updated = block;
    updated = updated.replace(new RegExp(`t\\[(\\d+)\\]===${itemVarPattern}\\.plan`, 'g'), (_, idx) => {
      replacedCount += 1;
      return `t[${idx}]===${todoPlanKey}`;
    });
    updated = updated.replace(new RegExp(`t\\[(\\d+)\\]!==${itemVarPattern}\\.plan`, 'g'), (_, idx) => {
      replacedCount += 1;
      return `t[${idx}]!==${todoPlanKey}`;
    });
    updated = updated.replace(new RegExp(`t\\[(\\d+)\\]=${itemVarPattern}\\.plan`, 'g'), (_, idx) => {
      replacedCount += 1;
      return `t[${idx}]=${todoPlanKey}`;
    });
    if (replacedCount === 0) {
      throw new Error(errorMessage);
    }

    return updated;
  }, errorMessage);
}

function patchTodoCompactItemRenderCache({
  source,
  errorMessage,
  includeMarker,
  compactComponentName
}) {
  return patchTodoItemRenderCache({
    source,
    errorMessage,
    includeMarker,
    componentName: compactComponentName
  });
}

function patchTodoExpandedItemRenderCache({
  source,
  errorMessage,
  includeMarker,
  expandedComponentName
}) {
  let updated = source;
  let itemRenderError = null;
  let patchedItemRender = false;

  try {
    const next = patchTodoItemRenderCache({
      source: updated,
      errorMessage,
      includeMarker,
      componentName: expandedComponentName
    });
    patchedItemRender = next !== updated;
    updated = next;
  } catch {
    itemRenderError = true;
  }

  try {
    return patchTodoPortalRenderCache({
      source: updated,
      errorMessage,
      includeMarker,
      expandedComponentName
    });
  } catch {
    if (patchedItemRender) {
      return updated;
    }
    if (itemRenderError) {
      return patchTodoPortalRenderCache({
        source,
        errorMessage,
        includeMarker,
        expandedComponentName
      });
    }
    throw new Error(errorMessage);
  }
}

function patchTodoItemRenderCache({
  source,
  errorMessage,
  includeMarker,
  componentName
}) {
  const componentPattern = escapeRegExp(componentName);
  const jsxCallPattern = `\\(0,(?<jsxVar>[A-Za-z_$][\\w$]*)\\.jsx\\)`;
  const directRenderPattern = new RegExp(
    `\\.type===\\\`todo-list\\\`\\?(?:\\(?(?:[A-Za-z_$][\\w$]*=)?)?\\(0,[A-Za-z_$][\\w$]*\\.jsx\\)\\(${componentPattern},\\{item:[A-Za-z_$][\\w$]*\\}\\)`
  );
  const anchorPattern = new RegExp(`${jsxCallPattern}\\(${componentPattern},\\{item:`);
  const anchorMatch = source.match(anchorPattern);
  if (!anchorMatch?.groups) {
    throw new Error(errorMessage);
  }
  const anchorIndex = anchorMatch.index ?? -1;
  const jsxVar = anchorMatch.groups.jsxVar;

  const start = source.lastIndexOf('function ', anchorIndex);
  const nextFunctionIndex = source.indexOf('function ', anchorIndex + anchorMatch[0].length);
  const end = nextFunctionIndex === -1 ? source.length : nextFunctionIndex;
  if (start === -1 || end <= start) {
    throw new Error(errorMessage);
  }

  const before = source.slice(0, start);
  const block = source.slice(start, end);
  const after = source.slice(end);
  const pattern = new RegExp(
    `t\\[(?<depIdx>\\d+)\\]===(?<itemVar>[A-Za-z_$][\\w$]*)\\?(?<outVar>[A-Za-z_$][\\w$]*)=t\\[(?<cacheIdx>\\d+)\\]:\\(\\k<outVar>=\\(0,${escapeRegExp(jsxVar)}\\.jsx\\)\\(${componentPattern},\\{item:\\k<itemVar>\\}\\),t\\[\\k<depIdx>\\]=\\k<itemVar>,t\\[\\k<cacheIdx>\\]=\\k<outVar>\\),(?<suffix>(?:[A-Za-z_$][\\w$]*=)?\\k<outVar>)`
  );
  const match = block.match(pattern);
  if (!match?.groups) {
    if (directRenderPattern.test(block)) {
      return source;
    }
    const renderCallMatch = block.match(
      new RegExp(
        `\\(0,[A-Za-z_$][\\w$]*\\.jsx\\)\\(${componentPattern},\\{[^}]*\\bitem:(?<itemVar>[A-Za-z_$][\\w$]*)`
      )
    );
    const renderItemVar = renderCallMatch?.groups?.itemVar;
    if (renderItemVar) {
      const updatedBlock = patchTodoRenderBlockItemCacheReferences({
        block,
        errorMessage,
        includeMarker,
        itemVar: renderItemVar
      });
      return `${before}${updatedBlock}${after}`;
    }
    throw new Error(errorMessage);
  }
  const { depIdx, itemVar, outVar, cacheIdx, suffix } = match.groups;
  const todoItemKey = buildTodoItemCacheKeyExpression(itemVar, {
    includeMarker: includeMarker()
  });
  const updated = block.replace(
    pattern,
    `t[${depIdx}]===${todoItemKey}?${outVar}=t[${cacheIdx}]:(${outVar}=(0,${jsxVar}.jsx)(${componentName},{item:${itemVar}}),t[${depIdx}]=${todoItemKey},t[${cacheIdx}]=${outVar}),${suffix}`
  );
  return `${before}${updated}${after}`;
}

function patchTodoRenderBlockItemCacheReferences({
  block,
  errorMessage,
  includeMarker,
  itemVar
}) {
  const itemVarPattern = escapeRegExp(itemVar);
  let replacedCount = 0;
  let todoItemKey = null;
  const getTodoItemKey = () => {
    todoItemKey ??= buildTodoItemCacheKeyExpression(itemVar, {
      includeMarker: includeMarker()
    });
    return todoItemKey;
  };
  let updated = block;
  updated = updated.replace(new RegExp(`t\\[(\\d+)\\]!==${itemVarPattern}`, 'g'), (_, idx) => {
    replacedCount += 1;
    return `t[${idx}]!==${getTodoItemKey()}`;
  });
  updated = updated.replace(new RegExp(`t\\[(\\d+)\\]===${itemVarPattern}`, 'g'), (_, idx) => {
    replacedCount += 1;
    return `t[${idx}]===${getTodoItemKey()}`;
  });
  updated = updated.replace(new RegExp(`t\\[(\\d+)\\]=${itemVarPattern}`, 'g'), (_, idx) => {
    replacedCount += 1;
    return `t[${idx}]=${getTodoItemKey()}`;
  });
  if (replacedCount === 0) {
    throw new Error(errorMessage);
  }
  return updated;
}

function patchTodoPortalRenderCache({
  source,
  errorMessage,
  includeMarker,
  expandedComponentName
}) {
  const expandedComponentNames = collectTodoRenderComponentCandidates(source, expandedComponentName);
  const patchBlock = (block, expandedRenderPattern) => {
    if (!expandedRenderPattern.test(block)) {
      throw new Error(errorMessage);
    }

    const todoVarMatch = block.match(/todoListItem:(?<todoVar>[A-Za-z_$][\w$]*)/);
    const todoVar = todoVarMatch?.groups?.todoVar;
    if (!todoVar) {
      throw new Error(errorMessage);
    }
    const todoVarPattern = escapeRegExp(todoVar);
    const todoItemKey = buildNullableTodoItemCacheKeyExpression(todoVar, {
      includeMarker: includeMarker()
    });
    let replacedCompare = false;
    let replacedAssign = false;
    let updated = block;
    updated = updated.replace(
      new RegExp(`t\\[(\\d+)\\]!==${todoVarPattern}`),
      (_, idx) => {
        replacedCompare = true;
        return `t[${idx}]!==${todoItemKey}`;
      }
    );
    updated = updated.replace(
      new RegExp(`t\\[(\\d+)\\]=${todoVarPattern}`),
      (_, idx) => {
        replacedAssign = true;
        return `t[${idx}]=${todoItemKey}`;
      }
    );
    if (!replacedCompare || !replacedAssign) {
      throw new Error(errorMessage);
    }
    return updated;
  };

  for (const componentName of expandedComponentNames) {
    const expandedRenderPatternSource = buildTodoComponentRenderPatternSource(componentName);
    const expandedRenderPattern = new RegExp(expandedRenderPatternSource);
    const expandedRenderSearchPattern = new RegExp(expandedRenderPatternSource, 'g');
    for (const renderMatch of source.matchAll(expandedRenderSearchPattern)) {
      const renderIndex = renderMatch.index ?? -1;
      const start = source.lastIndexOf('function ', renderIndex);
      const nextFunctionIndex = source.indexOf('function ', renderIndex + renderMatch[0].length);
      const end = nextFunctionIndex === -1 ? source.length : nextFunctionIndex;
      if (start === -1 || end <= start) {
        continue;
      }
      const block = source.slice(start, end);
      if (!/todoListItem:[A-Za-z_$][\w$]*/.test(block)) {
        continue;
      }
      const before = source.slice(0, start);
      const after = source.slice(end);
      return `${before}${patchBlock(block, expandedRenderPattern)}${after}`;
    }
  }

  throw new Error(errorMessage);
}

function buildTodoComponentRenderPatternSource(componentName) {
  return `\\(0,[A-Za-z_$][\\w$]*\\.jsx\\)\\(${escapeRegExp(componentName)},\\{[^}]*\\bitem:`;
}

function collectTodoRenderComponentCandidates(source, componentName) {
  const candidates = [componentName];
  const directRenderPattern = new RegExp(buildTodoComponentRenderPatternSource(componentName));
  const functionPattern = /function (?<functionName>[A-Za-z_$][\w$]*)\(/g;
  for (const match of source.matchAll(functionPattern)) {
    const wrapperName = match.groups?.functionName;
    if (!wrapperName || wrapperName === componentName || candidates.includes(wrapperName)) {
      continue;
    }
    const start = match.index ?? -1;
    const nextFunctionIndex = source.indexOf('function ', start + match[0].length);
    const end = nextFunctionIndex === -1 ? source.length : nextFunctionIndex;
    if (start === -1 || end <= start) {
      continue;
    }
    const block = source.slice(start, end);
    if (directRenderPattern.test(block)) {
      candidates.push(wrapperName);
    }
  }
  return candidates;
}

function buildTodoPlanCacheKeyExpression(planExpr, options = {}) {
  const marker = options.includeMarker ? `/* ${LINUX_TODO_PROGRESS_PATCH_MARKER} */` : '';
  return `${marker}(typeof process<\`u\`&&process?.env?.CODEX_DESKTOP_DISABLE_LINUX_TODO_PROGRESS_PATCH===\`1\`?${planExpr}:${planExpr}.map((e,t)=>String(t)+\`:\`+e.status+\`:\`+e.step).join(\`|\`))`;
}

function buildTodoItemCacheKeyExpression(itemExpr, options = {}) {
  return `(typeof process<\`u\`&&process?.env?.CODEX_DESKTOP_DISABLE_LINUX_TODO_PROGRESS_PATCH===\`1\`?${itemExpr}:${buildTodoPlanCacheKeyExpression(`${itemExpr}.plan`, options)})`;
}

function buildNullableTodoItemCacheKeyExpression(itemExpr, options = {}) {
  return `(${itemExpr}==null?${itemExpr}:${buildTodoItemCacheKeyExpression(itemExpr, options)})`;
}

function replaceFunctionBlockOrThrow(source, startMarker, endMarker, replacementFn, errorMessage) {
  const start = source.indexOf(startMarker);
  const end = start === -1 ? -1 : source.indexOf(endMarker, start + startMarker.length);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(errorMessage);
  }

  const before = source.slice(0, start);
  const block = source.slice(start, end);
  const after = source.slice(end);
  const updated = replacementFn(block);
  if (updated === block) {
    throw new Error(errorMessage);
  }

  return `${before}${updated}${after}`;
}

function replaceFunctionBlockContainingAnchorOrThrow(source, anchorMarker, replacementFn, errorMessage) {
  const anchorIndex = source.indexOf(anchorMarker);
  if (anchorIndex === -1) {
    throw new Error(errorMessage);
  }

  const start = source.lastIndexOf('function ', anchorIndex);
  const end = source.indexOf('function ', anchorIndex + anchorMarker.length);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(errorMessage);
  }

  const before = source.slice(0, start);
  const block = source.slice(start, end);
  const after = source.slice(end);
  const updated = replacementFn(block);
  if (updated === block) {
    throw new Error(errorMessage);
  }

  return `${before}${updated}${after}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTodoProgressPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    TODO_PROGRESS_PATCH_BASE_ERROR_MESSAGE,
    sourceName,
    analyzeTodoProgressBundle(bundleSource)
  );
}

function analyzeTodoProgressBundle(bundleSource) {
  const componentNames = resolveTodoComponentNames(bundleSource);
  const compactRenderCachePattern = componentNames.compact
    ? new RegExp(
        `\\(0,[A-Za-z_$][\\w$]*\\.jsx\\)\\(${escapeRegExp(componentNames.compact)},\\{item:[A-Za-z_$][\\w$]*\\}\\)`
      )
    : null;
  const portalRenderCachePattern = componentNames.expanded
    ? new RegExp(
        `\\(0,[A-Za-z_$][\\w$]*\\.jsx\\)\\(${escapeRegExp(componentNames.expanded)},\\{[^}]*\\bitem:[A-Za-z_$][\\w$]*[^}]*\\}\\)`
      )
    : null;

  const detected = {
    todoListCase: bundleSource.includes('case`todo-list`'),
    expandedTodoComponent: componentNames.expanded != null,
    expandedTodoSummary: bundleSource.includes('localConversationPage.planItemsCompleted'),
    compactTodoComponent: componentNames.compact != null,
    compactTodoSummary: bundleSource.includes('codex.plan.tasksCompletedSummary'),
    compactTodoRenderCache: compactRenderCachePattern?.test(bundleSource) ?? false,
    portalTodoRenderCache: portalRenderCachePattern?.test(bundleSource) ?? false
  };

  return {
    detected,
    missingAnchors: [
      !detected.todoListCase && 'todo-list conversation item case',
      !detected.expandedTodoComponent && 'expanded todo component',
      !detected.expandedTodoSummary && 'expanded todo summary text',
      !detected.compactTodoComponent && 'compact todo component',
      !detected.compactTodoSummary && 'compact todo summary text',
      !detected.compactTodoRenderCache && 'compact todo render cache branch',
      !detected.portalTodoRenderCache && 'portal todo render cache branch'
    ].filter(Boolean)
  };
}

function resolveTodoComponentNames(bundleSource) {
  return {
    expanded: findFunctionNameContainingAnchor(bundleSource, 'localConversationPage.planItemsCompleted'),
    compact: findFunctionNameContainingAnchor(bundleSource, 'codex.plan.tasksCompletedSummary')
  };
}

function findFunctionNameContainingAnchor(bundleSource, anchorMarker) {
  const anchorIndex = bundleSource.indexOf(anchorMarker);
  if (anchorIndex === -1) {
    return null;
  }
  const functionStart = bundleSource.lastIndexOf('function ', anchorIndex);
  if (functionStart === -1) {
    return null;
  }
  const headerMatch = bundleSource
    .slice(functionStart, anchorIndex)
    .match(/^function (?<functionName>[A-Za-z_$][\w$]*)\(/);
  return headerMatch?.groups?.functionName ?? null;
}

function buildPatchErrorMessage(baseMessage, sourceName, analysis) {
  const sourceDetail = sourceName ? ` Source: ${sourceName}.` : '';
  const missingDetail =
    analysis.missingAnchors.length > 0
      ? ` Missing anchors: ${analysis.missingAnchors.join(', ')}.`
      : '';
  const detectedDetail = ` Detected anchors: ${Object.entries(analysis.detected)
    .map(([name, value]) => `${name}=${value ? 'yes' : 'no'}`)
    .join(', ')}.`;
  return `${baseMessage}${sourceDetail}${missingDetail}${detectedDetail}`;
}

function detectNativeModules(extractedAppDir) {
  return NATIVE_MODULE_HINTS.filter((moduleName) =>
    fs.existsSync(path.join(extractedAppDir, 'node_modules', moduleName))
  );
}

async function getNativeModuleVersions({ extractedAppDir, nativeModules }) {
  const versions = {};
  for (const moduleName of nativeModules) {
    const packageJsonPath = path.join(extractedAppDir, 'node_modules', moduleName, 'package.json');
    const packageJson = await parseJsonFile(packageJsonPath);
    versions[moduleName] = packageJson.version;
  }
  return versions;
}

async function replaceNativeModules({
  cacheHome,
  extractedAppDir,
  electronVersion,
  nativeModules,
  nativeModuleVersions,
  logger
}) {
  if (nativeModules.length === 0) {
    logger.warn('No known native modules were detected in the extracted upstream app.');
    return;
  }

  const rebuildWorkspace = await prepareNativeRebuildWorkspace({
    cacheHome,
    electronVersion,
    nativeModuleVersions,
    logger
  });

  await retryForever(`rebuild-native-modules-electron-${electronVersion}`, logger, async () => {
    await rebuild({
      buildPath: rebuildWorkspace,
      electronVersion,
      arch: process.arch,
      force: true,
      onlyModules: nativeModules
    });
  });

  for (const moduleName of nativeModules) {
    const source = path.join(rebuildWorkspace, 'node_modules', moduleName);
    const destination = path.join(extractedAppDir, 'node_modules', moduleName);
    await removeIfExists(destination);
    await copyDir(source, destination);
    logger.info(`Replaced native module ${moduleName} with rebuilt Linux copy`);
  }
}

async function installChannelRuntime({
  channel,
  channelAppDir,
  channelBinDir,
  channelIconDir,
  channelStateDir,
  homeDir,
  runtimeSourceDir,
  packagedAsarPath,
  upstreamResourcesDir,
  unpackedSourceRoot,
  rgPath,
  nativeModules,
  runtimeLogDir,
  diagnosticManifestPath,
  patchSummary,
  releaseVersion,
  appBuildFlavor,
  logger
}) {
  await removeIfExists(channelAppDir);
  await removeIfExists(channelBinDir);
  await removeIfExists(channelIconDir);
  await ensureDir(channelStateDir);

  await copyDir(runtimeSourceDir, channelAppDir);
  const packagedBinaryPath = path.join(channelAppDir, channel.executableName);
  const runtimeElectronBinaryPath = path.join(channelAppDir, 'electron');
  if (!(await fileExists(runtimeElectronBinaryPath))) {
    throw new Error(
      `Installed Electron runtime is incomplete: ${describeMissingElectronRuntime(
        runtimeSourceDir
      )}.`
    );
  }
  await copyFile(runtimeElectronBinaryPath, packagedBinaryPath);
  await fs.promises.chmod(packagedBinaryPath, 0o755);
  const resourcesDir = path.join(channelAppDir, 'resources');
  await ensureDir(resourcesDir);

  await copyUpstreamResources({
    upstreamResourcesDir,
    resourcesDir
  });
  const browserUseRuntime = await installBrowserUseRuntime({
    resourcesDir,
    homeDir,
    logger
  });
  const browserUseMcpConfig = await installBrowserUseMcpConfig({
    resourcesDir,
    homeDir,
    browserUseNode: browserUseRuntime.browserUseNode,
    appVersion: releaseVersion,
    appBuildFlavor,
    logger
  });
  const linuxComputerUse = await installLinuxComputerUseBackend({
    resourcesDir,
    homeDir,
    appVersion: releaseVersion,
    logger
  });
  const bundledPlugins = await collectBundledPluginDiagnostics(resourcesDir);
  const chromeExtensionHost = await installLinuxChromeExtensionHost({
    resourcesDir,
    homeDir,
    logger
  });
  const chromeBundledPluginHost = await installLinuxChromeBundledPluginHost({
    resourcesDir,
    homeDir,
    hostExecutablePath: chromeExtensionHost.chromeExtensionHost.targetPath,
    releaseVersion,
    logger
  });
  const chromeNativeHostRuntimeRegistryRepair =
    await repairLinuxChromeNativeHostRuntimeRegistries({
      resourcesDir,
      homeDir,
      logger
    });
  const chromeExtensionHostCleanup = await stopRunningLinuxChromeExtensionHostProcesses({
    logger
  });
  await copyFile(packagedAsarPath, path.join(resourcesDir, 'app.asar'));
  await installUnpackedRuntime({
    upstreamResourcesDir,
    unpackedSourceRoot,
    destinationRoot: path.join(resourcesDir, 'app.asar.unpacked'),
    nativeModules
  });
  await installBundledCodexCli(resourcesDir);
  await installBundledRipgrep(resourcesDir, rgPath);

  const iconPath = await installIcons({
    channel,
    channelIconDir,
    unpackedSourceRoot
  });

  const executablePath = path.join(channelBinDir, channel.executableName);
  const wrapper = buildWrapperScript({
    channel,
    electronBinary: packagedBinaryPath,
    bundledCodexCliPath: path.join(resourcesDir, 'bin', 'codex'),
    userDataDir: path.join(channelStateDir, 'user-data'),
    runtimeLogDir,
    diagnosticManifestPath,
    patchSummary
  });
  await writeExecutable(executablePath, wrapper);
  logger.info(`Installed wrapper ${executablePath}`);
  return {
    iconPath,
    bundledPlugins,
    ...browserUseRuntime,
    browserUseMcpConfig,
    linuxComputerUse,
    ...chromeExtensionHost,
    chromeBundledPluginHost,
    chromeNativeHostRuntimeRegistryRepair,
    chromeExtensionHostCleanup
  };
}

async function installUnpackedRuntime({
  upstreamResourcesDir,
  unpackedSourceRoot,
  destinationRoot,
  nativeModules
}) {
  const upstreamUnpackedDir = path.join(upstreamResourcesDir, 'app.asar.unpacked');
  await removeIfExists(destinationRoot);
  if (await fileExists(upstreamUnpackedDir)) {
    await copyDir(upstreamUnpackedDir, destinationRoot);
  } else {
    await ensureDir(destinationRoot);
  }

  for (const moduleName of nativeModules) {
    const source = path.join(unpackedSourceRoot, 'node_modules', moduleName);
    const destination = path.join(destinationRoot, 'node_modules', moduleName);
    if (await fileExists(source)) {
      await removeIfExists(destination);
      await ensureDir(path.dirname(destination));
      await copyDir(source, destination);
    }
  }
}

async function installIcons({ channel, channelIconDir, unpackedSourceRoot }) {
  await ensureDir(channelIconDir);
  const assetsDir = path.join(unpackedSourceRoot, 'webview', 'assets');
  const assetNames = await fs.promises.readdir(assetsDir);
  const baseIconName = assetNames.find((name) => /^app-.*\.png$/.test(name));
  if (!baseIconName) {
    throw new Error('Could not locate the upstream app icon inside webview/assets.');
  }
  const baseIconPath = path.join(assetsDir, baseIconName);
  const stableIconPath = path.join(channelIconDir, 'codex.png');
  await copyFile(baseIconPath, stableIconPath);

  if (channel.id === 'stable') {
    return stableIconPath;
  }

  const base64 = await fs.promises.readFile(baseIconPath, 'base64');
  const betaIconPath = path.join(channelIconDir, channel.iconFileName);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <image href="data:image/png;base64,${base64}" x="0" y="0" width="512" height="512"/>
  <rect x="260" y="32" width="220" height="104" rx="20" fill="#cc3d1f"/>
  <text x="370" y="99" font-family="DejaVu Sans, sans-serif" font-size="54" font-weight="700" text-anchor="middle" fill="#ffffff">BETA</text>
</svg>`;
  await fs.promises.writeFile(betaIconPath, svg, 'utf8');
  return betaIconPath;
}

export function buildWrapperScript({
  channel,
  electronBinary,
  bundledCodexCliPath,
  userDataDir,
  runtimeLogDir,
  diagnosticManifestPath,
  patchSummary
}) {
  const classArg = channel.wmClass;
  return `#!/usr/bin/env bash
set -euo pipefail
mkdir -p "${userDataDir}"
mkdir -p "${runtimeLogDir}"
export CODEX_CLI_PATH="\${CODEX_CLI_PATH:-${bundledCodexCliPath}}"
export CODEX_DESKTOP_INSTALL_MANIFEST="${diagnosticManifestPath}"
chrome_sandbox="$(dirname "${electronBinary}")/chrome-sandbox"
sandbox_args=()
chromium_args=()
sandbox_mode="sandbox"
gpu_mode="default"
ozone_hint="\${CODEX_DESKTOP_OZONE_PLATFORM_HINT:-x11}"
chromium_logging="disabled"
chromium_log_file=""
runtime_launch_log="${runtimeLogDir}/runtime-launch-${channel.id}.log"
timestamp="$(date -Iseconds 2>/dev/null || date --iso-8601=seconds)"

if [[ "\${CODEX_DESKTOP_FORCE_NO_SANDBOX:-0}" == "1" ]]; then
  sandbox_args=(--no-sandbox --disable-setuid-sandbox)
  sandbox_mode="forced-no-sandbox"
elif [[ "\${CODEX_DESKTOP_FORCE_SANDBOX:-0}" == "1" ]]; then
  sandbox_args=()
  sandbox_mode="forced-sandbox"
elif [[ ! -u "$chrome_sandbox" ]]; then
  sandbox_args=(--no-sandbox --disable-setuid-sandbox)
  sandbox_mode="chrome-sandbox-not-setuid"
elif [[ "$(stat -c '%u' "$chrome_sandbox")" != "0" ]]; then
  sandbox_args=(--no-sandbox --disable-setuid-sandbox)
  sandbox_mode="chrome-sandbox-not-root-owned"
fi

  if [[ "\${CODEX_DESKTOP_DISABLE_GPU:-0}" == "1" ]]; then
  chromium_args+=(--disable-gpu)
  gpu_mode="disabled"
fi

case "$ozone_hint" in
  "")
    ozone_hint="unset"
    ;;
  x11|wayland|auto)
    chromium_args+=("--ozone-platform=$ozone_hint")
    ;;
  *)
    printf '[%s] [WARN] ignored invalid ozone hint: %s\n' "$timestamp" "$ozone_hint" >> "$runtime_launch_log"
    ozone_hint="invalid"
    ;;
esac

if [[ "\${CODEX_DESKTOP_ENABLE_CHROMIUM_LOGGING:-0}" == "1" ]]; then
  chromium_log_file="${runtimeLogDir}/chromium-${channel.id}.log"
  chromium_args+=(--enable-logging "--log-file=$chromium_log_file")
  chromium_logging="enabled"
fi

printf '[%s] [INFO] launch channel=${channel.id} sandbox_mode=%s gpu_mode=%s ozone_hint=%s chromium_logging=%s chromium_log_file=%s manifest_path=%s patches=%s\n' "$timestamp" "$sandbox_mode" "$gpu_mode" "$ozone_hint" "$chromium_logging" "${"$"}{chromium_log_file:-none}" "${diagnosticManifestPath}" "${patchSummary}" >> "$runtime_launch_log"

exec "${electronBinary}" "\${sandbox_args[@]}" "\${chromium_args[@]}" --class="${classArg}" --user-data-dir="${userDataDir}" "$@"
`;
}

async function writeDesktopEntry({
  channel,
  iconPath,
  desktopApplicationsDir,
  executablePath,
  installRoot
}) {
  const desktopPath = path.join(desktopApplicationsDir, channel.desktopFileName);
  const desktopContents = [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${channel.productName}`,
    `Exec=${executablePath} %U`,
    `Icon=${iconPath}`,
    'Terminal=false',
    'Categories=Development;',
    `StartupWMClass=${channel.wmClass}`,
    `StartupNotify=true`,
    `X-Codex-InstallRoot=${installRoot}`
  ].join('\n');
  await fs.promises.writeFile(desktopPath, `${desktopContents}\n`, 'utf8');
}

async function findAppBundle(extractDir) {
  const entries = await fs.promises.readdir(extractDir, { withFileTypes: true });
  const bundle = entries.find((entry) => entry.isDirectory() && entry.name.endsWith('.app'));
  if (!bundle) {
    throw new Error('Could not locate the extracted .app bundle.');
  }
  return path.join(extractDir, bundle.name);
}

async function resolveExecutablePath(candidatePath) {
  if (typeof candidatePath !== 'string') {
    return null;
  }

  const trimmedPath = candidatePath.trim();
  if (!trimmedPath) {
    return null;
  }

  const absolutePath = path.isAbsolute(trimmedPath)
    ? trimmedPath
    : path.resolve(trimmedPath);
  try {
    await fs.promises.access(absolutePath, fs.constants.X_OK);
  } catch {
    return null;
  }

  try {
    return await fs.promises.realpath(absolutePath);
  } catch {
    return absolutePath;
  }
}

export async function resolveFirstExecutablePath(candidatePaths) {
  for (const candidatePath of candidatePaths ?? []) {
    const resolvedPath = await resolveExecutablePath(candidatePath);
    if (resolvedPath) {
      return resolvedPath;
    }
  }
  return null;
}

export async function findExecutableInPath(commandName, envPath = process.env.PATH ?? '') {
  if (typeof commandName !== 'string') {
    return null;
  }

  const trimmedName = commandName.trim();
  if (!trimmedName) {
    return null;
  }

  if (trimmedName.includes(path.sep)) {
    return resolveExecutablePath(trimmedName);
  }

  const pathEntries = String(envPath).split(path.delimiter);
  for (const entry of pathEntries) {
    const candidateDir = entry.trim() || process.cwd();
    const candidatePath = path.join(candidateDir, trimmedName);
    const resolvedPath = await resolveExecutablePath(candidatePath);
    if (resolvedPath) {
      return resolvedPath;
    }
  }

  return null;
}

async function describeExecutableFormat(filePath) {
  let handle;
  try {
    handle = await fs.promises.open(filePath, 'r');
    const buffer = Buffer.alloc(4);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead >= 4 && buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
      return 'elf';
    }
    if (bytesRead >= 2 && buffer[0] === 0x23 && buffer[1] === 0x21) {
      return 'script';
    }
    const magic = buffer.readUInt32BE(0);
    if (
      magic === 0xcafebabe ||
      magic === 0xcafed00d ||
      magic === 0xfeedface ||
      magic === 0xcefaedfe ||
      magic === 0xfeedfacf ||
      magic === 0xcffaedfe
    ) {
      return 'mach-o';
    }
    return 'unknown';
  } finally {
    await handle?.close();
  }
}

async function assertLinuxExecutableFile(filePath, label) {
  try {
    await fs.promises.access(filePath, fs.constants.X_OK);
  } catch {
    throw new Error(`${label} is not executable: ${filePath}`);
  }

  const format = await describeExecutableFormat(filePath);
  if (format === 'elf' || format === 'script') {
    return format;
  }

  throw new Error(
    `${label} must be a Linux executable or script, but ${filePath} appears to be ${format}.`
  );
}

function getBrowserUsePrimaryRuntimeDependenciesDir({ homeDir, env }) {
  const cacheRoot = env.XDG_CACHE_HOME ?? path.join(homeDir, '.cache');
  return path.join(cacheRoot, BROWSER_USE_PRIMARY_RUNTIME_RELATIVE_PATH);
}

function getBrowserUseRuntimeCandidatePaths({ homeDir, env }) {
  const primaryRuntimeDependenciesDir = getBrowserUsePrimaryRuntimeDependenciesDir({
    homeDir,
    env
  });
  const primaryRuntimeRoot = path.dirname(primaryRuntimeDependenciesDir);
  return {
    primaryRuntimeDependenciesDir,
    nodeRepl: [
      {
        sourceKind: 'env',
        sourcePath: env[BROWSER_USE_NODE_REPL_ENV] ?? '',
        envName: BROWSER_USE_NODE_REPL_ENV
      },
      {
        sourceKind: 'primary-runtime-cache',
        sourcePath: path.join(primaryRuntimeDependenciesDir, 'bin', 'node_repl')
      },
      {
        sourceKind: 'primary-runtime-cache',
        sourcePath: path.join(primaryRuntimeDependenciesDir, 'node_repl')
      },
      {
        sourceKind: 'primary-runtime-node',
        sourcePath: path.join(primaryRuntimeDependenciesDir, 'node', 'bin', 'node_repl')
      },
      {
        sourceKind: 'primary-runtime-root',
        sourcePath: path.join(primaryRuntimeRoot, 'node_repl')
      },
      {
        sourceKind: 'repo-bundled',
        sourcePath: path.join(PROJECT_ROOT, 'resources', 'node_repl')
      },
      {
        sourceKind: 'repo-bundled',
        sourcePath: path.join(PROJECT_ROOT, 'vendor', 'node_repl')
      }
    ],
    node: [
      {
        sourceKind: 'env',
        sourcePath: env[BROWSER_USE_NODE_ENV] ?? '',
        envName: BROWSER_USE_NODE_ENV
      },
      {
        sourceKind: 'primary-runtime-node',
        sourcePath: path.join(primaryRuntimeDependenciesDir, 'node', 'bin', 'node')
      },
      {
        sourceKind: 'primary-runtime-cache',
        sourcePath: path.join(primaryRuntimeDependenciesDir, 'bin', 'node')
      }
    ]
  };
}

function describeCandidatePaths(candidates) {
  return candidates
    .filter((candidate) => typeof candidate.sourcePath === 'string' && candidate.sourcePath.trim())
    .map((candidate) =>
      candidate.envName
        ? `${candidate.envName}=${candidate.sourcePath}`
        : `${candidate.sourceKind}:${candidate.sourcePath}`
    );
}

async function resolveExecutableCandidate(candidates) {
  for (const candidate of candidates) {
    const resolvedPath = await resolveExecutablePath(candidate.sourcePath);
    if (resolvedPath) {
      return {
        ...candidate,
        sourcePath: resolvedPath
      };
    }
  }
  return null;
}

export async function resolveBrowserUseRuntimeSources({
  homeDir = getPaths().home,
  env = process.env,
  envPath = env.PATH ?? process.env.PATH ?? ''
} = {}) {
  const candidates = getBrowserUseRuntimeCandidatePaths({
    homeDir,
    env
  });
  const nodeRepl = await resolveExecutableCandidate(candidates.nodeRepl);

  const nodeCandidate = await resolveExecutableCandidate(candidates.node);
  const pathNode = nodeCandidate
    ? null
    : await findExecutableInPath('node', envPath);
  const node =
    nodeCandidate ??
    (pathNode
      ? {
          sourceKind: 'path',
          sourcePath: pathNode,
          commandName: 'node'
        }
      : null);

  return {
    nodeRepl,
    node,
    attempted: {
      nodeRepl: describeCandidatePaths(candidates.nodeRepl),
      node: [
        ...describeCandidatePaths(candidates.node),
        `PATH:${envPath || '<empty>'}`
      ]
    }
  };
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function buildGeneratedNodeReplModule() {
  return `import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import util from 'node:util';

let kernel = createKernel();
let snippetId = 0;
let nextOutboundRequestId = 1;
let clientCapabilities = {};
const pendingOutboundRequests = new Map();
const NATIVE_PIPE_HEADER_BYTES = 4;
const NATIVE_PIPE_MAX_FRAME_BYTES = 8 * 1024 * 1024;
const BROWSER_USE_CONFIG_PATH = 'browser/config.toml';

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeRequestMeta(meta) {
  if (!isObject(meta)) {
    return {};
  }
  const normalized = { ...meta };
  const turnMetadata = normalized['x-codex-turn-metadata'];
  if (typeof turnMetadata === 'string') {
    try {
      normalized['x-codex-turn-metadata'] = JSON.parse(turnMetadata);
    } catch {
      normalized['x-codex-turn-metadata'] = turnMetadata;
    }
  }
  return normalized;
}

function collectRequestMeta(message) {
  return [
    message?._meta,
    message?.meta,
    message?.headers,
    message?.params?._meta,
    message?.params?.meta,
    message?.params?.headers,
    message?.params?.requestMeta
  ].reduce((merged, meta) => ({ ...merged, ...normalizeRequestMeta(meta) }), {});
}

function hasClientElicitationSupport() {
  return isObject(clientCapabilities?.elicitation);
}

function requestHost(method, params) {
  const id = 'node-repl-' + nextOutboundRequestId++;
  const request = { jsonrpc: '2.0', id, method, params };
  return new Promise((resolve, reject) => {
    pendingOutboundRequests.set(id, { resolve, reject, method });
    send(request);
  });
}

function handleHostResponse(message) {
  if (!isObject(message) || message.method != null || message.id == null) {
    return false;
  }
  const pending = pendingOutboundRequests.get(message.id);
  if (!pending) {
    return false;
  }
  pendingOutboundRequests.delete(message.id);
  if (isObject(message.error)) {
    const err = new Error(message.error.message ?? 'Host request failed');
    err.code = message.error.code;
    err.data = message.error.data;
    pending.reject(err);
    return true;
  }
  pending.resolve(message.result);
  return true;
}

function rejectPendingOutboundRequests(reason) {
  for (const pending of pendingOutboundRequests.values()) {
    pending.reject(reason);
  }
  pendingOutboundRequests.clear();
}

function isBrowserUsePolicyUrl(value) {
  try {
    const url = new URL(value instanceof Request ? value.url : String(value));
    return url.hostname === 'chatgpt.com' && url.pathname === '/backend-api/aura/site_status';
  } catch {
    return false;
  }
}

function isUnsupportedHostBridgeError(err) {
  return err?.code === -32601 || /method not found|not supported|unsupported/i.test(err?.message ?? '');
}

function isUnsupportedElicitationError(err) {
  return (
    err?.code === -32601 ||
    /^(elicitation\\/create)$|method not found|not supported|unsupported/i.test(err?.message ?? '')
  );
}

function isLocalhostName(hostname) {
  const normalized = String(hostname).trim().toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === '127.0.0.1' ||
    normalized === '[::1]' ||
    normalized === '::1'
  );
}

function getBrowserUseElicitationOrigin(params) {
  const origin = params?.meta?.origin;
  if (typeof origin !== 'string' || origin.trim().length === 0) {
    return null;
  }
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function shouldAcceptLocalBrowserUseElicitation(params) {
  if (params?.meta?.connector_id !== 'browser-use') {
    return false;
  }
  const origin = getBrowserUseElicitationOrigin(params);
  return origin != null && isLocalhostName(origin.hostname);
}

function getBrowserUsePreferencesPath() {
  const configRoot =
    typeof process.env.XDG_CONFIG_HOME === 'string' && process.env.XDG_CONFIG_HOME.trim().length > 0
      ? process.env.XDG_CONFIG_HOME.trim()
      : path.join(os.homedir(), '.config');
  return path.join(configRoot, 'codex-desktop', 'browser-use-preferences.json');
}

function readBrowserUsePreferences() {
  const defaults = { allowAllOrigins: false };
  try {
    const raw = fsSync.readFileSync(getBrowserUsePreferencesPath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (!isObject(parsed)) {
      return defaults;
    }
    return {
      allowAllOrigins: parsed.allowAllOrigins === true
    };
  } catch {
    return defaults;
  }
}

function getBrowserUseConfigCandidates() {
  const codexHome = typeof process.env.CODEX_HOME === 'string' ? process.env.CODEX_HOME.trim() : '';
  return [
    codexHome.length > 0 ? path.join(codexHome, 'browser', 'config.toml') : null,
    path.join(os.homedir(), '.codex', 'browser', 'config.toml')
  ].filter(Boolean);
}

function readBrowserUseConfig() {
  const defaults = {
    approvalMode: 'always_ask',
    historyApprovalMode: 'always_ask',
    deniedOrigins: []
  };
  for (const configPath of getBrowserUseConfigCandidates()) {
    try {
      const raw = fsSync.readFileSync(configPath, 'utf8');
      return {
        approvalMode: readTomlStringValue(raw, 'approval_mode') ?? defaults.approvalMode,
        historyApprovalMode: readTomlStringValue(raw, 'history_approval_mode') ?? defaults.historyApprovalMode,
        deniedOrigins: readTomlStringArrayValue(raw, 'denied')
      };
    } catch {}
  }
  return defaults;
}

function readTomlStringValue(raw, key) {
  const line = raw
    .split(/\\r?\\n/)
    .find((entry) => entry.trimStart().startsWith(key));
  if (!line) {
    return null;
  }
  const equalsIndex = line.indexOf('=');
  if (equalsIndex === -1) {
    return null;
  }
  const value = line.slice(equalsIndex + 1).trim();
  const quote = value[0];
  if (quote !== '"' && quote !== "'") {
    return null;
  }
  const endIndex = value.indexOf(quote, 1);
  return endIndex === -1 ? null : value.slice(1, endIndex);
}

function readTomlStringArrayValue(raw, key) {
  const lines = raw.split(/\\r?\\n/);
  let startIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trimStart().startsWith(key)) {
      startIndex = index;
      break;
    }
  }
  if (startIndex === -1) {
    return [];
  }
  let value = lines[startIndex].slice(lines[startIndex].indexOf('=') + 1);
  for (let index = startIndex + 1; !value.includes(']') && index < lines.length; index += 1) {
    value += '\\n' + lines[index];
  }
  const openIndex = value.indexOf('[');
  const closeIndex = value.indexOf(']', openIndex + 1);
  if (openIndex === -1 || closeIndex === -1) {
    return [];
  }
  return Array.from(value.slice(openIndex + 1, closeIndex).matchAll(/["']([^"']+)["']/g), (item) => item[1]);
}

function getCodexHome() {
  const codexHome = typeof process.env.CODEX_HOME === 'string' ? process.env.CODEX_HOME.trim() : '';
  return codexHome.length > 0 ? codexHome : path.join(os.homedir(), '.codex');
}

function resolveCodexConfigPath(configPath) {
  if (typeof configPath !== 'string' || configPath.trim().length === 0) {
    throw new Error('nodeRepl.config path must be a relative path.');
  }
  const normalized = configPath.replace(/\\\\/g, '/');
  if (
    path.isAbsolute(normalized) ||
    normalized.split('/').some((part) => part === '..' || part.length === 0)
  ) {
    throw new Error('nodeRepl.config path must be a safe relative path.');
  }
  return path.join(getCodexHome(), normalized);
}

function stripTomlComment(line) {
  let quote = null;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if ((char === '"' || char === "'") && line[index - 1] !== '\\\\') {
      quote = quote === char ? null : quote ?? char;
      continue;
    }
    if (char === '#' && quote == null) {
      return line.slice(0, index);
    }
  }
  return line;
}

function parseTomlString(value) {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if ((quote !== '"' && quote !== "'") || trimmed.at(-1) !== quote) {
    return trimmed;
  }
  if (quote === "'") {
    return trimmed.slice(1, -1);
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed.slice(1, -1);
  }
}

function splitTomlArray(value) {
  const items = [];
  let quote = null;
  let current = '';
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if ((char === '"' || char === "'") && value[index - 1] !== '\\\\') {
      quote = quote === char ? null : quote ?? char;
    }
    if (char === ',' && quote == null) {
      items.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim().length > 0) {
    items.push(current.trim());
  }
  return items;
}

function parseTomlValue(value) {
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const body = trimmed.slice(1, -1).trim();
    return body.length === 0 ? [] : splitTomlArray(body).map(parseTomlValue);
  }
  if (/^-?\\d+(?:\\.\\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  return parseTomlString(trimmed);
}

function getTomlTable(root, dottedName) {
  return dottedName.split('.').reduce((table, part) => {
    if (!isObject(table[part])) {
      table[part] = {};
    }
    return table[part];
  }, root);
}

function parseSimpleToml(raw) {
  const root = {};
  let table = root;
  for (const originalLine of raw.split(/\\r?\\n/)) {
    const line = stripTomlComment(originalLine).trim();
    if (line.length === 0) {
      continue;
    }
    if (line.startsWith('[') && line.endsWith(']')) {
      table = getTomlTable(root, line.slice(1, -1).trim());
      continue;
    }
    const equalsIndex = line.indexOf('=');
    if (equalsIndex === -1) {
      continue;
    }
    const key = line.slice(0, equalsIndex).trim();
    if (key.length === 0) {
      continue;
    }
    table[key] = parseTomlValue(line.slice(equalsIndex + 1));
  }
  return root;
}

function serializeTomlString(value) {
  return JSON.stringify(String(value));
}

function serializeTomlValue(value) {
  if (Array.isArray(value)) {
    return '[' + value.map(serializeTomlValue).join(', ') + ']';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return serializeTomlString(value);
}

function serializeTomlTable(table, prefix = '') {
  const scalars = [];
  const sections = [];
  for (const [key, value] of Object.entries(isObject(table) ? table : {})) {
    if (isObject(value)) {
      sections.push([key, value]);
    } else {
      scalars.push([key, value]);
    }
  }
  const lines = scalars.map(([key, value]) => key + ' = ' + serializeTomlValue(value));
  for (const [key, value] of sections) {
    const sectionName = prefix ? prefix + '.' + key : key;
    if (lines.length > 0 && lines.at(-1) !== '') {
      lines.push('');
    }
    lines.push('[' + sectionName + ']');
    lines.push(...serializeTomlTable(value, sectionName));
  }
  return lines;
}

function serializeSimpleToml(value) {
  const lines = serializeTomlTable(value);
  return (lines.length > 0 ? lines.join('\\n') : '') + '\\n';
}

async function readCodexTomlConfig(configPath) {
  try {
    return parseSimpleToml(await fs.readFile(resolveCodexConfigPath(configPath), 'utf8'));
  } catch (err) {
    if (err?.code === 'ENOENT') {
      return {};
    }
    throw err;
  }
}

async function writeCodexTomlConfig(configPath, value) {
  const resolvedPath = resolveCodexConfigPath(configPath);
  await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
  await fs.writeFile(resolvedPath, serializeSimpleToml(value), 'utf8');
}

function shouldAutoAcceptBrowserUseConfig(params) {
  if (params?.meta?.connector_id !== 'browser-use') {
    return false;
  }
  const config = readBrowserUseConfig();
  if (params?.meta?.sensitive_data === 'browsing_history') {
    return config.historyApprovalMode === 'never_ask';
  }
  const origin = getBrowserUseElicitationOrigin(params);
  if (origin == null) {
    return false;
  }
  if (config.deniedOrigins.includes(origin.origin)) {
    return false;
  }
  return config.approvalMode === 'never_ask';
}

function shouldAutoAcceptAllBrowserUseOrigins(params) {
  const meta = params?.meta;
  if (!isObject(meta)) {
    return false;
  }
  if (meta.connector_id !== 'browser-use' || meta.connector_name !== 'Browser Use') {
    return false;
  }
  if (meta.persist !== 'always' || meta.sensitive_data != null) {
    return false;
  }
  const origin = getBrowserUseElicitationOrigin(params);
  if (origin == null || isLocalhostName(origin.hostname)) {
    return false;
  }
  return readBrowserUsePreferences().allowAllOrigins === true;
}

function createUnsupportedElicitationError() {
  return new Error(
    'nodeRepl.createElicitation requires desktop host support for MCP elicitation/create.'
  );
}

function createUnsupportedPolicyFetchError() {
  return new Error(
    'Browser Use policy fetch requires an authenticated desktop host fetch bridge, but this desktop build does not support nodeRepl/fetch.'
  );
}

async function serializeFetchArgs(args) {
  const [input, init] = args;
  const request = new Request(input, init);
  const bodyBuffer = request.body ? Buffer.from(await request.arrayBuffer()) : null;
  return {
    url: request.url,
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    bodyBase64: bodyBuffer ? bodyBuffer.toString('base64') : null
  };
}

function normalizeResponseHeaders(headers) {
  if (headers instanceof Headers) {
    return headers;
  }
  if (Array.isArray(headers)) {
    return headers;
  }
  if (isObject(headers)) {
    return Object.entries(headers).map(([name, value]) => [name, String(value)]);
  }
  return [];
}

function rebuildFetchResponse(result) {
  if (!isObject(result) || typeof result.status !== 'number') {
    throw new Error('Invalid nodeRepl/fetch response from desktop host.');
  }
  const body = typeof result.bodyBase64 === 'string' ? Buffer.from(result.bodyBase64, 'base64') : null;
  return new Response(body, {
    status: result.status,
    statusText: typeof result.statusText === 'string' ? result.statusText : '',
    headers: normalizeResponseHeaders(result.headers)
  });
}

function encodeNativePipeMessage(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  const frame = Buffer.alloc(NATIVE_PIPE_HEADER_BYTES + body.length);
  if (osEndianness() === 'LE') {
    frame.writeUInt32LE(body.length, 0);
  } else {
    frame.writeUInt32BE(body.length, 0);
  }
  body.copy(frame, NATIVE_PIPE_HEADER_BYTES);
  return frame;
}

function osEndianness() {
  return process.arch === 's390x' ? 'BE' : 'LE';
}

function decodeNativePipeMessages(buffer) {
  const messages = [];
  let offset = 0;
  while (buffer.length - offset >= NATIVE_PIPE_HEADER_BYTES) {
    const length =
      osEndianness() === 'LE'
        ? buffer.readUInt32LE(offset)
        : buffer.readUInt32BE(offset);
    if (length > NATIVE_PIPE_MAX_FRAME_BYTES) {
      throw new Error('Invalid Browser Use native pipe frame.');
    }
    const frameEnd = offset + NATIVE_PIPE_HEADER_BYTES + length;
    if (buffer.length < frameEnd) {
      break;
    }
    messages.push(JSON.parse(buffer.subarray(offset + NATIVE_PIPE_HEADER_BYTES, frameEnd).toString('utf8')));
    offset = frameEnd;
  }
  return { messages, remainingData: buffer.subarray(offset) };
}

async function listBrowserUseNativePipeCandidates() {
  if (process.env.CODEX_BROWSER_USE_IAB_PIPE_PATH) {
    return [process.env.CODEX_BROWSER_USE_IAB_PIPE_PATH];
  }
  const candidates = [];
  try {
    const entries = await fs.readdir('/tmp/codex-browser-use');
    for (const entry of entries) {
      candidates.push(path.resolve('/tmp/codex-browser-use', entry));
    }
  } catch {}
  candidates.push('/tmp/codex-browser-use-iab.sock', '/tmp/codex-browser-use.sock');
  return [...new Set(candidates)];
}

function shouldTryNextNativePipeFetchError(err) {
  return /No handler registered for method: nodeReplFetch|Browser session does not belong|Browser turn does not belong|Missing required browser session_id|Missing required browser turn_id|ECONNREFUSED|ENOENT|timeout/i.test(
    err?.message ?? String(err)
  );
}

function shouldTryNextNativePipeElicitationError(err) {
  return /No handler registered for method: nodeReplCreateElicitation|Browser session does not belong|Browser turn does not belong|Missing required browser session_id|Missing required browser turn_id|ECONNREFUSED|ENOENT|timeout/i.test(
    err?.message ?? String(err)
  );
}

async function requestBrowserUseNativePipeHostFetch(params) {
  let lastError = null;
  for (const socketPath of await listBrowserUseNativePipeCandidates()) {
    try {
      return await requestNativePipe(socketPath, 'nodeReplFetch', params);
    } catch (err) {
      lastError = err;
      if (!shouldTryNextNativePipeFetchError(err)) {
        throw err;
      }
    }
  }
  throw lastError ?? createUnsupportedPolicyFetchError();
}

function getCurrentTurnMetadata() {
  return kernel.requestMeta?.['x-codex-turn-metadata'];
}

function buildNativePipeElicitationRequest(params) {
  const turnMetadata = getCurrentTurnMetadata();
  const sessionId = turnMetadata?.session_id;
  const turnId = turnMetadata?.turn_id;
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw createUnsupportedElicitationError();
  }
  if (typeof turnId !== 'string' || turnId.length === 0) {
    throw createUnsupportedElicitationError();
  }
  return {
    session_id: sessionId,
    turn_id: turnId,
    elicitation: params
  };
}

async function requestBrowserUseNativePipeElicitation(params) {
  const request = buildNativePipeElicitationRequest(params);
  let lastError = null;
  for (const socketPath of await listBrowserUseNativePipeCandidates()) {
    try {
      return await requestNativePipe(socketPath, 'nodeReplCreateElicitation', request);
    } catch (err) {
      lastError = err;
      if (!shouldTryNextNativePipeElicitationError(err)) {
        throw err;
      }
    }
  }
  throw lastError ?? createUnsupportedElicitationError();
}

async function requestNativePipe(socketPath, method, params) {
  const socket = await kernel.nativePipeBridge.createConnection(socketPath);
  let pendingData = Buffer.alloc(0);
  const requestId = 1;
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Browser Use native pipe request timeout.'));
      }, 3000);
      timer.unref?.();
      const cleanup = () => {
        clearTimeout(timer);
        socket.off('data', onData);
        socket.off('error', onError);
        socket.off('close', onClose);
      };
      const onError = (err) => {
        cleanup();
        reject(err);
      };
      const onClose = () => {
        cleanup();
        reject(new Error('Browser Use native pipe closed before response.'));
      };
      const onData = (chunk) => {
        try {
          pendingData = Buffer.concat([pendingData, Buffer.from(chunk)]);
          const decoded = decodeNativePipeMessages(pendingData);
          pendingData = decoded.remainingData;
          for (const message of decoded.messages) {
            if (message?.id !== requestId) {
              continue;
            }
            cleanup();
            if ('error' in message) {
              const err = new Error(message.error?.message ?? 'Browser Use native pipe request failed.');
              err.code = message.error?.code;
              reject(err);
              return;
            }
            resolve(message.result);
            return;
          }
        } catch (err) {
          cleanup();
          reject(err);
        }
      };
      socket.on('data', onData);
      socket.once('error', onError);
      socket.once('close', onClose);
      socket.write(encodeNativePipeMessage({ jsonrpc: '2.0', id: requestId, method, params }));
    });
  } finally {
    socket.destroy();
  }
}

async function hostFetch(...args) {
  const policyUrl = isBrowserUsePolicyUrl(args[0]);
  let serializedRequest;
  try {
    serializedRequest = await serializeFetchArgs(args);
  } catch (err) {
    if (policyUrl) {
      throw err;
    }
    return fetch(...args);
  }

  try {
    const response = await requestHost('nodeRepl/fetch', serializedRequest);
    return rebuildFetchResponse(response);
  } catch (err) {
    if (policyUrl && isUnsupportedHostBridgeError(err)) {
      try {
        return rebuildFetchResponse(await requestBrowserUseNativePipeHostFetch(serializedRequest));
      } catch (nativePipeErr) {
        if (shouldTryNextNativePipeFetchError(nativePipeErr)) {
          throw createUnsupportedPolicyFetchError();
        }
        throw nativePipeErr;
      }
    }
    if (policyUrl) {
      throw err;
    }
    return fetch(...args);
  }
}

function createNativePipeBridge() {
  return {
    createConnection(socketPath) {
      return new Promise((resolve, reject) => {
        const socket = net.createConnection(socketPath);
        const cleanup = () => {
          socket.off('connect', onConnect);
          socket.off('error', onError);
        };
        const onConnect = () => {
          cleanup();
          resolve(socket);
        };
        const onError = (err) => {
          cleanup();
          reject(err);
        };
        socket.once('connect', onConnect);
        socket.once('error', onError);
      });
    }
  };
}

function createKernel() {
  const nextKernel = {
    context: null,
    moduleCache: new Map(),
    nativePipeBridge: createNativePipeBridge(),
    requestMeta: {},
    responseMeta: {},
    writeOutput: null
  };
  const nodeRepl = {
    get requestMeta() {
      return nextKernel.requestMeta;
    },
    cwd: process.cwd(),
    get env() {
      return process.env;
    },
    config: {
      read: async () => readCodexTomlConfig(BROWSER_USE_CONFIG_PATH),
      readRequirements: async () => ({ requirements: null }),
      readToml: async (configPath) => readCodexTomlConfig(configPath),
      writeToml: async (configPath, value) => writeCodexTomlConfig(configPath, value)
    },
    nativePipe: nextKernel.nativePipeBridge,
    fetch: (...args) => hostFetch(...args),
    write(...args) {
      if (typeof nextKernel.writeOutput === 'function') {
        nextKernel.writeOutput(args.map(formatLogArg).join(' '));
      }
    },
    setResponseMeta(meta) {
      if (!isObject(meta)) {
        return;
      }
      nextKernel.responseMeta = { ...nextKernel.responseMeta, ...meta };
    },
    emitImage() {
      throw new Error('nodeRepl.emitImage is not supported by the generated Linux node_repl runtime.');
    },
    async createElicitation(params) {
      if (!hasClientElicitationSupport()) {
        throw new Error('nodeRepl.createElicitation requires MCP client elicitation support');
      }
      if (shouldAutoAcceptBrowserUseConfig(params)) {
        return { action: 'accept' };
      }
      if (shouldAutoAcceptAllBrowserUseOrigins(params)) {
        return { action: 'accept' };
      }
      if (shouldAcceptLocalBrowserUseElicitation(params)) {
        return { action: 'accept' };
      }
      try {
        return await requestHost('elicitation/create', params);
      } catch (err) {
        if (isUnsupportedElicitationError(err)) {
          try {
            return await requestBrowserUseNativePipeElicitation(params);
          } catch (nativePipeErr) {
            if (shouldTryNextNativePipeElicitationError(nativePipeErr)) {
              throw createUnsupportedElicitationError();
            }
            throw nativePipeErr;
          }
        }
        throw err;
      }
    }
  };
  const sandbox = {
    console,
    Buffer,
    URL,
    URLSearchParams,
    AbortController,
    AbortSignal,
    Blob,
    FormData,
    Headers,
    Request,
    Response,
    ReadableStream,
    TransformStream,
    WritableStream,
    TextDecoder,
    TextEncoder,
    atob,
    btoa,
    clearImmediate,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    setImmediate,
    queueMicrotask,
    structuredClone,
    performance,
    crypto,
    fetch,
    nodeRepl
  };
  sandbox.global = sandbox;
  nextKernel.context = vm.createContext(sandbox);
  return nextKernel;
}

function getReferrerBaseUrl(referrer) {
  if (typeof referrer === 'string' && referrer.startsWith('file:')) {
    return referrer;
  }
  return pathToFileURL(path.join(process.cwd(), '__codex_repl__.mjs')).href;
}

function resolveModuleSpecifier(specifier, referrer) {
  if (specifier.startsWith('node:')) {
    return { type: 'builtin', specifier };
  }
  if (specifier.startsWith('file:')) {
    return { type: 'file', url: new URL(specifier) };
  }
  if (path.isAbsolute(specifier)) {
    return { type: 'file', url: pathToFileURL(specifier) };
  }
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    return { type: 'file', url: new URL(specifier, getReferrerBaseUrl(referrer)) };
  }
  return { type: 'host', specifier };
}

function initializeImportMeta(meta, module) {
  meta.url = module.identifier;
  meta.__codexNativePipe = kernel.nativePipeBridge;
}

async function loadSyntheticModule(specifier) {
  const cacheKey = 'host:' + specifier;
  const cached = kernel.moduleCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const namespace = await import(specifier);
  const exportNames = Object.keys(namespace);
  const names = ['default', ...exportNames.filter((name) => name !== 'default')];
  const module = new vm.SyntheticModule(
    names,
    function setSyntheticExports() {
      this.setExport('default', namespace.default ?? namespace);
      for (const name of names) {
        if (name !== 'default') {
          this.setExport(name, namespace[name]);
        }
      }
    },
    { context: kernel.context, identifier: specifier }
  );
  kernel.moduleCache.set(cacheKey, module);
  await module.link(() => {});
  await module.evaluate();
  return module;
}

async function loadSourceModule(url) {
  const cacheKey = url.href;
  const cached = kernel.moduleCache.get(cacheKey);
  if (cached) {
    if (cached.status !== 'evaluated' && cached.status !== 'errored') {
      await cached.evaluate();
    }
    return cached;
  }
  const source = await fs.readFile(fileURLToPath(url), 'utf8');
  const module = new vm.SourceTextModule(source, {
    context: kernel.context,
    identifier: url.href,
    initializeImportMeta,
    importModuleDynamically
  });
  kernel.moduleCache.set(cacheKey, module);
  await module.link(linkModule);
  await module.evaluate();
  return module;
}

async function loadModule(specifier, referrer) {
  const resolved = resolveModuleSpecifier(specifier, referrer);
  if (resolved.type === 'file') {
    return loadSourceModule(resolved.url);
  }
  return loadSyntheticModule(resolved.specifier);
}

async function linkModule(specifier, referencingModule) {
  return loadModule(specifier, referencingModule?.identifier);
}

async function importModuleDynamically(specifier, referencingModule) {
  return loadModule(specifier, referencingModule?.identifier);
}

function send(message) {
  process.stdout.write(JSON.stringify(message));
  process.stdout.write('\\n');
}

function result(id, value, meta = null) {
  const resultValue = { ...value };
  if (isObject(meta) && Object.keys(meta).length > 0) {
    resultValue._meta = { ...(isObject(resultValue._meta) ? resultValue._meta : {}), ...meta };
  }
  send({ jsonrpc: '2.0', id, result: resultValue });
}

function error(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

function formatLogArg(arg) {
  return typeof arg === 'string' ? arg : util.inspect(arg, { depth: 4 });
}

async function executeJavaScript(code) {
  const logs = [];
  const originalConsole = kernel.context.console;
  const originalWriteOutput = kernel.writeOutput;
  kernel.context.console = {
    ...console,
    log: (...args) => logs.push(args.map(formatLogArg).join(' ')),
    error: (...args) => logs.push(args.map(formatLogArg).join(' ')),
    warn: (...args) => logs.push(args.map(formatLogArg).join(' '))
  };
  kernel.writeOutput = (text) => logs.push(String(text));
  try {
    const module = new vm.SourceTextModule(String(code), {
      context: kernel.context,
      identifier: 'codex-repl://snippet/' + ++snippetId + '.mjs',
      initializeImportMeta,
      importModuleDynamically
    });
    await module.link(linkModule);
    await module.evaluate({ timeout: 30_000 });
    return logs.join('\\n');
  } finally {
    kernel.context.console = originalConsole;
    kernel.writeOutput = originalWriteOutput;
  }
}

const tools = [
  {
    name: 'js',
    description: 'Execute JavaScript in a persistent Node.js context.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string' }
      },
      required: ['code']
    }
  },
  {
    name: 'js_reset',
    description: 'Reset the persistent JavaScript context.',
    inputSchema: { type: 'object', properties: {} }
  }
];

async function handleRequest(message) {
  const { id, method, params } = message;
  kernel.requestMeta = collectRequestMeta(message);
  kernel.responseMeta = {};
  if (method === 'initialize') {
    clientCapabilities = isObject(params?.capabilities) ? params.capabilities : {};
    result(id, {
      protocolVersion: params?.protocolVersion ?? '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'node_repl', version: '0.1.0-linux-generated' }
    });
    return;
  }
  if (method === 'tools/list') {
    result(id, { tools });
    return;
  }
  if (method === 'tools/call') {
    const name = params?.name;
    const args = params?.arguments ?? {};
    if (name === 'js_reset') {
      kernel = createKernel();
      result(id, { content: [{ type: 'text', text: 'JavaScript context reset.' }], isError: false }, kernel.responseMeta);
      return;
    }
    if (name === 'js') {
      try {
        const output = await executeJavaScript(String(args.code ?? ''));
        result(id, { content: [{ type: 'text', text: output }], isError: false }, kernel.responseMeta);
      } catch (err) {
        result(id, {
          content: [{ type: 'text', text: err?.stack ?? err?.message ?? String(err) }],
          isError: true
        }, kernel.responseMeta);
      }
      return;
    }
    error(id, -32602, \`Unknown tool: \${name}\`);
    return;
  }
  if (id != null) {
    error(id, -32601, \`Unknown method: \${method}\`);
  }
}

let buffer = '';
let inputEnded = false;
let requestQueue = Promise.resolve();

function enqueueRequest(message) {
  requestQueue = requestQueue
    .then(() => handleRequest(message))
    .catch((err) => {
      error(message.id ?? null, -32603, err?.stack ?? err?.message ?? String(err));
    });
}

function exitWhenDrained() {
  requestQueue.finally(() => {
    if (inputEnded) {
      process.exit(0);
    }
  });
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  for (;;) {
    const newline = buffer.indexOf('\\n');
    if (newline < 0) break;
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch (err) {
      error(null, -32700, err?.message ?? String(err));
      continue;
    }
    if (handleHostResponse(message)) {
      continue;
    }
    enqueueRequest(message);
  }
});
process.stdin.on('end', () => {
  inputEnded = true;
  rejectPendingOutboundRequests(new Error('node_repl input ended before host response was received.'));
  exitWhenDrained();
});
`;
}

async function installGeneratedNodeRepl({ nodeSourcePath, nodeReplTargetPath }) {
  const modulePath = `${nodeReplTargetPath}.mjs`;
  await fs.promises.writeFile(modulePath, buildGeneratedNodeReplModule(), 'utf8');
  await writeExecutable(
    nodeReplTargetPath,
`#!/usr/bin/env bash
set -euo pipefail
exec ${shellQuote(nodeSourcePath)} --experimental-vm-modules "$(dirname "$0")/$(basename "$0").mjs" "$@"
`
  );
}

export async function installBrowserUseRuntime({
  resourcesDir,
  homeDir = getPaths().home,
  env = process.env,
  envPath = env.PATH ?? process.env.PATH ?? '',
  logger = null
}) {
  const sources = await resolveBrowserUseRuntimeSources({
    homeDir,
    env,
    envPath
  });

  if (!sources.node) {
    throw new Error(
      `Could not locate a Linux Node.js runtime for Browser Use. Set ${BROWSER_USE_NODE_ENV} to an executable node binary, install the Codex primary runtime, or make node available on PATH. Looked in: ${sources.attempted.node.join(', ')}.`
    );
  }

  await assertLinuxExecutableFile(sources.node.sourcePath, 'Browser Use node source');

  const nodeReplTargetPath = path.join(resourcesDir, 'node_repl');
  const nodeTargetPath = path.join(resourcesDir, 'node');
  if (sources.nodeRepl) {
    await assertLinuxExecutableFile(sources.nodeRepl.sourcePath, 'Browser Use node_repl source');
    await copyFile(sources.nodeRepl.sourcePath, nodeReplTargetPath);
    await fs.promises.chmod(nodeReplTargetPath, 0o755);
  } else {
    await installGeneratedNodeRepl({
      nodeSourcePath: sources.node.sourcePath,
      nodeReplTargetPath
    });
  }
  await writeExecutable(
    nodeTargetPath,
    `#!/usr/bin/env bash
set -euo pipefail
exec ${shellQuote(sources.node.sourcePath)} "$@"
`
  );
  await assertLinuxExecutableFile(nodeReplTargetPath, 'Installed Browser Use node_repl');
  await assertLinuxExecutableFile(nodeTargetPath, 'Installed Browser Use node');
  if (sources.nodeRepl) {
    logger?.info?.(
      `Browser Use node_repl source: ${sources.nodeRepl.sourcePath} (${sources.nodeRepl.sourceKind})`
    );
  } else {
    logger?.info?.(
      `Browser Use node_repl source: generated Linux wrapper because no binary was found. Looked in: ${sources.attempted.nodeRepl.join(', ')}`
    );
  }
  logger?.info?.(
    `Browser Use node source: ${sources.node.sourcePath} (${sources.node.sourceKind})`
  );

  return {
    browserUseRuntime: {
      status: 'installed',
      nodeReplSourceKind: sources.nodeRepl?.sourceKind ?? 'generated',
      nodeReplSourcePath: sources.nodeRepl?.sourcePath ?? null,
      nodeSourceKind: sources.node.sourceKind,
      nodeSourcePath: sources.node.sourcePath
    },
    browserUseNodeRepl: {
      status: 'installed',
      sourceKind: sources.nodeRepl?.sourceKind ?? 'generated',
      sourcePath: sources.nodeRepl?.sourcePath ?? null,
      targetPath: nodeReplTargetPath
    },
    browserUseNode: {
      status: 'installed',
      sourceKind: sources.node.sourceKind,
      sourcePath: sources.node.sourcePath,
      targetPath: nodeTargetPath
    }
  };
}

function parseTomlSectionHeader(line) {
  return line.match(/^\s*\[([^\]]+)\]\s*(?:#.*)?$/)?.[1] ?? null;
}

function removeTomlSections(source, sectionNames) {
  const sections = new Set(sectionNames);
  const output = [];
  let skipping = false;

  for (const line of source.split('\n')) {
    const sectionName = parseTomlSectionHeader(line);
    if (sectionName != null) {
      skipping = sections.has(sectionName);
      if (skipping) {
        continue;
      }
    }
    if (!skipping) {
      output.push(line);
    }
  }

  const text = output.join('\n').trimEnd();
  return text.length > 0 ? `${text}\n\n` : '';
}

function parseSimpleTomlStringValue(rawValue) {
  const value = rawValue.trim();
  if (value.startsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, value.endsWith('"') ? -1 : undefined);
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  return value;
}

function parseSimpleTomlSectionStrings(source, sectionName) {
  const values = {};
  let inSection = false;

  for (const line of source.split('\n')) {
    const nextSection = parseTomlSectionHeader(line);
    if (nextSection != null) {
      inSection = nextSection === sectionName;
      continue;
    }
    if (!inSection) {
      continue;
    }
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.+?)\s*(?:#.*)?$/);
    if (match) {
      values[match[1]] = parseSimpleTomlStringValue(match[2]);
    }
  }

  return values;
}

function tomlValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map(tomlValue).join(', ')}]`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(String(value));
}

function buildTomlSection(sectionName, entries) {
  const lines = [`[${sectionName}]`];
  for (const [key, value] of entries) {
    lines.push(`${key} = ${tomlValue(value)}`);
  }
  return `${lines.join('\n')}\n\n`;
}

async function directoryExists(dirPath) {
  try {
    return (await fs.promises.stat(dirPath)).isDirectory();
  } catch {
    return false;
  }
}

async function collectBrowserUseNodeModuleDirs({ resourcesDir, browserUseNode }) {
  const candidates = [];
  const sourcePath = browserUseNode?.sourcePath;
  if (typeof sourcePath === 'string' && sourcePath.length > 0) {
    const sourceParent = path.dirname(sourcePath);
    if (path.basename(sourceParent) === 'bin') {
      candidates.push(path.join(path.dirname(sourceParent), 'node_modules'));
    }
    candidates.push(path.join(sourceParent, 'node_modules'));
  }
  candidates.push(
    path.join(resourcesDir, 'node_modules'),
    path.join(resourcesDir, 'cua_node', 'lib', 'node_modules')
  );

  const dirs = [];
  for (const candidate of [...new Set(candidates)]) {
    if (await directoryExists(candidate)) {
      dirs.push(candidate);
    }
  }
  return dirs;
}

async function sha256FileIfExists(filePath) {
  if (!(await fileExists(filePath))) {
    return null;
  }
  const contents = await fs.promises.readFile(filePath);
  return crypto.createHash('sha256').update(contents).digest('hex');
}

async function collectBrowserClientSha256s(resourcesDir) {
  const clientPaths = [
    path.join(
      resourcesDir,
      'plugins',
      'openai-bundled',
      'plugins',
      'browser',
      'scripts',
      'browser-client.mjs'
    ),
    path.join(
      resourcesDir,
      'plugins',
      'openai-bundled',
      'plugins',
      'chrome',
      'scripts',
      'browser-client.mjs'
    )
  ];
  const hashes = [];
  for (const clientPath of clientPaths) {
    const hash = await sha256FileIfExists(clientPath);
    if (hash != null) {
      hashes.push(hash);
    }
  }
  return [...new Set(hashes)];
}

function orderedEnvEntries(env) {
  const order = [
    'NODE_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS',
    'NODE_REPL_NODE_MODULE_DIRS',
    'NODE_REPL_NODE_PATH',
    'NODE_REPL_TRUSTED_CODE_PATHS',
    'CODEX_HOME',
    'NODE_REPL_TRUSTED_BROWSER_CLIENT_SHA256S',
    'BROWSER_USE_AVAILABLE_BACKENDS',
    'NODE_REPL_INSTRUCTIONS_USE_CASE_BROWSER',
    'NODE_REPL_INSTRUCTIONS_USE_CASE_CHROME',
    'BROWSER_USE_CODEX_APP_BUILD_FLAVOR',
    'BROWSER_USE_CODEX_APP_VERSION'
  ];
  const emitted = new Set();
  const entries = [];
  for (const key of order) {
    if (env[key] != null && String(env[key]).length > 0) {
      emitted.add(key);
      entries.push([key, env[key]]);
    }
  }
  for (const key of Object.keys(env).sort()) {
    if (!emitted.has(key) && env[key] != null && String(env[key]).length > 0) {
      entries.push([key, env[key]]);
    }
  }
  return entries;
}

export async function installBrowserUseMcpConfig({
  resourcesDir,
  homeDir = getPaths().home,
  browserUseNode = null,
  appVersion = null,
  appBuildFlavor = 'prod',
  logger = null
}) {
  const codexHome = path.join(homeDir, '.codex');
  const configPath = path.join(codexHome, 'config.toml');
  const nodeReplCommandPath = path.join(resourcesDir, 'node_repl');
  const nodePath = path.join(resourcesDir, 'node');

  await assertLinuxExecutableFile(nodeReplCommandPath, 'Browser Use MCP node_repl command');
  await assertLinuxExecutableFile(nodePath, 'Browser Use MCP node command');

  const existingConfig = (await fileExists(configPath))
    ? await fs.promises.readFile(configPath, 'utf8')
    : '';
  const existingEnv = parseSimpleTomlSectionStrings(
    existingConfig,
    `mcp_servers.${NODE_REPL_MCP_SERVER_NAME}.env`
  );
  const nodeModuleDirs = await collectBrowserUseNodeModuleDirs({ resourcesDir, browserUseNode });
  const browserClientSha256s = await collectBrowserClientSha256s(resourcesDir);
  const env = { ...existingEnv };

  env.NODE_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS =
    existingEnv.NODE_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS ?? '1000';
  if (nodeModuleDirs.length > 0) {
    env.NODE_REPL_NODE_MODULE_DIRS = nodeModuleDirs.join(path.delimiter);
  } else {
    delete env.NODE_REPL_NODE_MODULE_DIRS;
  }
  env.NODE_REPL_NODE_PATH = nodePath;
  env.NODE_REPL_TRUSTED_CODE_PATHS =
    existingEnv.NODE_REPL_TRUSTED_CODE_PATHS ?? codexHome;
  env.CODEX_HOME = codexHome;
  if (browserClientSha256s.length > 0) {
    env.NODE_REPL_TRUSTED_BROWSER_CLIENT_SHA256S = browserClientSha256s.join(',');
  }
  env.BROWSER_USE_AVAILABLE_BACKENDS = 'chrome,iab';
  env.NODE_REPL_INSTRUCTIONS_USE_CASE_BROWSER =
    existingEnv.NODE_REPL_INSTRUCTIONS_USE_CASE_BROWSER ??
    'Control the in-app browser in conjunction with the Browser Plugin.';
  env.NODE_REPL_INSTRUCTIONS_USE_CASE_CHROME =
    existingEnv.NODE_REPL_INSTRUCTIONS_USE_CASE_CHROME ??
    [
      'Control the Chrome browser in conjunction with the Chrome Plugin.',
      'Prefer this method of controlling Chrome over alternatives (such as Computer Use)',
      'unless the user explicitly mentions an alternative.'
    ].join(' ');
  env.BROWSER_USE_CODEX_APP_BUILD_FLAVOR =
    appBuildFlavor ?? existingEnv.BROWSER_USE_CODEX_APP_BUILD_FLAVOR ?? 'prod';
  if (appVersion != null) {
    env.BROWSER_USE_CODEX_APP_VERSION = appVersion;
  } else if (existingEnv.BROWSER_USE_CODEX_APP_VERSION == null) {
    delete env.BROWSER_USE_CODEX_APP_VERSION;
  }

  const config = `${removeTomlSections(existingConfig, [
    `mcp_servers.${NODE_REPL_MCP_SERVER_NAME}`,
    `mcp_servers.${NODE_REPL_MCP_SERVER_NAME}.env`
  ])}${buildTomlSection(`mcp_servers.${NODE_REPL_MCP_SERVER_NAME}`, [
    ['args', []],
    ['command', nodeReplCommandPath],
    ['startup_timeout_sec', 120]
  ])}${buildTomlSection(
    `mcp_servers.${NODE_REPL_MCP_SERVER_NAME}.env`,
    orderedEnvEntries(env)
  )}`;

  await ensureDir(codexHome);
  await fs.promises.writeFile(configPath, config, 'utf8');
  logger?.info?.(`Installed Browser Use MCP node_repl config ${configPath}`);

  return {
    status: 'installed',
    configPath,
    serverName: NODE_REPL_MCP_SERVER_NAME,
    commandPath: nodeReplCommandPath,
    nodePath,
    nodeModuleDirs,
    browserClientSha256s
  };
}

export async function installLinuxComputerUseBackend({
  resourcesDir,
  homeDir = getPaths().home,
  appVersion = null,
  logger = null,
  runSetupDoctor = true
}) {
  const pluginRoot = path.join(
    resourcesDir,
    'plugins',
    'openai-bundled',
    'plugins',
    COMPUTER_USE_PLUGIN_NAME
  );
  const pluginJsonPath = path.join(pluginRoot, '.codex-plugin', 'plugin.json');
  const mcpConfigPath = path.join(pluginRoot, '.mcp.json');
  const binDir = path.join(pluginRoot, 'bin');
  const backendPath = path.join(binDir, COMPUTER_USE_BACKEND_FILE_NAME);
  const backendModulePath = path.join(binDir, COMPUTER_USE_BACKEND_MODULE_FILE_NAME);
  const backendSourcePath = path.join(PROJECT_ROOT, 'src', 'linux-computer-use-backend.mjs');

  if (!(await fileExists(pluginJsonPath))) {
    throw new Error(`Could not locate bundled Computer Use plugin metadata at ${pluginJsonPath}`);
  }
  if (!(await fileExists(backendSourcePath))) {
    throw new Error(`Could not locate Linux Computer Use backend source at ${backendSourcePath}`);
  }

  await ensureDir(binDir);
  await copyFile(backendSourcePath, backendModulePath);
  await fs.promises.chmod(backendModulePath, 0o755);
  await writeExecutable(
    backendPath,
    buildLinuxComputerUseBackendWrapper({
      backendModuleFileName: COMPUTER_USE_BACKEND_MODULE_FILE_NAME,
      bundledNodePath: path.join(resourcesDir, 'node')
    })
  );

  const plugin = await rewriteLinuxComputerUsePluginMetadata({
    pluginJsonPath,
    appVersion
  });
  await writeLinuxComputerUseMcpConfig({
    mcpConfigPath,
    backendCommand: `./bin/${COMPUTER_USE_BACKEND_FILE_NAME}`
  });

  const cache = await syncLinuxComputerUsePluginCache({
    resourcesDir,
    homeDir,
    pluginRoot,
    plugin,
    logger
  });

  const setupDoctor = runSetupDoctor
    ? await runLinuxComputerUseBackendSetupDoctor({ backendPath, pluginRoot, logger })
    : {
        setup: { status: 'skipped', reason: 'disabled' },
        doctor: { status: 'skipped', reason: 'disabled' }
      };

  logger?.info?.(`Installed Linux Computer Use backend ${backendPath}`);

  return {
    status: 'installed',
    pluginName: COMPUTER_USE_PLUGIN_NAME,
    pluginVersion: plugin.version,
    pluginRoot,
    pluginJsonPath,
    mcpConfigPath,
    mcpServerName: COMPUTER_USE_MCP_SERVER_NAME,
    backendPath,
    backendModulePath,
    backendSourcePath,
    cache,
    setupDoctor
  };
}

function buildLinuxComputerUseBackendWrapper({ backendModuleFileName, bundledNodePath }) {
  return `#!/usr/bin/env bash
set -euo pipefail
self_dir="$(cd "$(dirname "$0")" && pwd)"
node_bin="${bundledNodePath}"
if [[ ! -x "$node_bin" ]]; then
  resources_dir="$(cd "$self_dir/../../../../.." 2>/dev/null && pwd || true)"
  if [[ -n "$resources_dir" && -x "$resources_dir/node" ]]; then
    node_bin="$resources_dir/node"
  elif command -v node >/dev/null 2>&1; then
    node_bin="$(command -v node)"
  else
    echo "Linux Computer Use backend requires the bundled Codex node runtime or node on PATH." >&2
    exit 127
  fi
fi
exec "$node_bin" "$self_dir/${backendModuleFileName}" "$@"
`;
}

async function rewriteLinuxComputerUsePluginMetadata({ pluginJsonPath, appVersion }) {
  const plugin = await parseJsonFile(pluginJsonPath);
  const keywords = new Set(
    (Array.isArray(plugin.keywords) ? plugin.keywords : []).filter(
      (keyword) => typeof keyword === 'string'
    )
  );
  keywords.delete('macos');
  for (const keyword of ['linux', 'computer-use', 'desktop-control', 'automation', 'accessibility']) {
    keywords.add(keyword);
  }

  const interfaceConfig = {
    ...(plugin.interface ?? {}),
    displayName: plugin.interface?.displayName ?? 'Computer Use',
    shortDescription: 'Control Linux desktop apps from Codex',
    longDescription:
      'Linux Computer Use lets Codex inspect and operate desktop apps through local Linux screenshot, accessibility, window, and input backends. You stay in control: risky UI actions still require confirmation policy handling, and OS setup requiring sudo is reported as explicit commands.',
    defaultPrompt: [
      'Check whether Linux Computer Use is ready',
      'List my open desktop windows',
      'Take a screenshot of my desktop'
    ]
  };

  const updated = {
    ...plugin,
    version: typeof plugin.version === 'string' ? plugin.version : appVersion ?? '0.0.0',
    description: 'Control desktop apps on Linux from Codex through Computer Use.',
    keywords: [...keywords],
    mcpServers: './.mcp.json',
    skills: plugin.skills ?? './skills/',
    interface: interfaceConfig
  };
  await fs.promises.writeFile(pluginJsonPath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
  return updated;
}

async function writeLinuxComputerUseMcpConfig({ mcpConfigPath, backendCommand }) {
  const config = {
    mcpServers: {
      [COMPUTER_USE_MCP_SERVER_NAME]: {
        command: backendCommand,
        args: ['mcp'],
        cwd: '.'
      }
    }
  };
  await fs.promises.writeFile(mcpConfigPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

async function syncLinuxComputerUsePluginCache({
  resourcesDir,
  homeDir,
  pluginRoot,
  plugin,
  logger
}) {
  const version = plugin.version ?? '0.0.0';
  const cacheRoot = path.join(
    homeDir,
    '.codex',
    'plugins',
    'cache',
    'openai-bundled',
    COMPUTER_USE_PLUGIN_NAME
  );
  const cacheVersionPath = path.join(cacheRoot, version);
  const cacheLatestPath = path.join(cacheRoot, 'latest');
  await ensureDir(cacheRoot);
  await removeIfExists(cacheVersionPath);
  await copyDir(pluginRoot, cacheVersionPath);
  await removeIfExists(cacheLatestPath);
  try {
    await fs.promises.symlink(cacheVersionPath, cacheLatestPath, 'dir');
  } catch {
    await copyDir(cacheVersionPath, cacheLatestPath);
  }

  const runtimeMarketplaceRoot = path.join(
    homeDir,
    '.codex',
    '.tmp',
    'bundled-marketplaces',
    'openai-bundled'
  );
  const runtimeMarketplaceAgentsRoot = path.join(
    runtimeMarketplaceRoot,
    '.agents',
    'plugins'
  );
  const runtimeMarketplacePath = path.join(runtimeMarketplaceAgentsRoot, 'marketplace.json');
  const sourceMarketplacePath = path.join(
    resourcesDir,
    'plugins',
    'openai-bundled',
    '.agents',
    'plugins',
    'marketplace.json'
  );
  const runtimePluginsRoot = path.join(runtimeMarketplaceRoot, 'plugins');
  const runtimePluginPath = path.join(runtimePluginsRoot, COMPUTER_USE_PLUGIN_NAME);
  await ensureDir(runtimeMarketplaceAgentsRoot);
  await ensureDir(runtimePluginsRoot);

  const sourceMarketplace = (await fileExists(sourceMarketplacePath))
    ? await parseJsonFile(sourceMarketplacePath)
    : { name: 'openai-bundled', plugins: [] };
  const existingMarketplace = (await fileExists(runtimeMarketplacePath))
    ? await parseJsonFile(runtimeMarketplacePath).catch(() => null)
    : null;
  const computerUseMarketplacePlugin =
    sourceMarketplace.plugins?.find((entry) => entry?.name === COMPUTER_USE_PLUGIN_NAME) ?? {
      name: COMPUTER_USE_PLUGIN_NAME,
      version
    };
  const pluginsByName = new Map(
    [
      ...(Array.isArray(existingMarketplace?.plugins) ? existingMarketplace.plugins : []),
      ...(Array.isArray(sourceMarketplace.plugins)
        ? sourceMarketplace.plugins.filter((entry) =>
            ['browser', 'chrome', 'latex', COMPUTER_USE_PLUGIN_NAME].includes(entry?.name)
          )
        : []),
      computerUseMarketplacePlugin
    ]
      .filter((entry) => typeof entry?.name === 'string')
      .map((entry) => [entry.name, entry])
  );
  const runtimeMarketplace = {
    ...(existingMarketplace ?? sourceMarketplace),
    name: existingMarketplace?.name ?? sourceMarketplace.name ?? 'openai-bundled',
    plugins: [...pluginsByName.values()]
  };
  await fs.promises.writeFile(
    runtimeMarketplacePath,
    `${JSON.stringify(runtimeMarketplace, null, 2)}\n`,
    'utf8'
  );
  await removeIfExists(runtimePluginPath);
  try {
    await fs.promises.symlink(cacheVersionPath, runtimePluginPath, 'dir');
  } catch {
    await copyDir(cacheVersionPath, runtimePluginPath);
  }

  logger?.info?.(`Synced Computer Use plugin cache ${cacheVersionPath}`);

  return {
    cacheRoot,
    cacheVersionPath,
    cacheLatestPath,
    runtimeMarketplacePath,
    runtimePluginPath,
    marketplacePlugins: runtimeMarketplace.plugins
      .map((entry) => entry.name)
      .filter(Boolean)
      .sort()
  };
}

async function runLinuxComputerUseBackendSetupDoctor({ backendPath, pluginRoot, logger }) {
  const setup = await runLinuxComputerUseBackendCommand({
    backendPath,
    pluginRoot,
    args: ['setup', '--json']
  });
  const doctor = await runLinuxComputerUseBackendCommand({
    backendPath,
    pluginRoot,
    args: ['doctor', '--json']
  });
  logger?.info?.(
    `Linux Computer Use setup=${setup.status} doctor=${doctor.status} readiness=${doctor.report?.status ?? 'unknown'}`
  );
  return { setup, doctor };
}

async function runLinuxComputerUseBackendCommand({ backendPath, pluginRoot, args }) {
  try {
    const result = await runCommand(backendPath, args, { cwd: pluginRoot });
    return {
      status: 'ok',
      command: backendPath,
      args,
      report: parseJsonCommandOutput(result.stdout),
      stderr: result.stderr
    };
  } catch (error) {
    return {
      status: 'error',
      command: backendPath,
      args,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function parseJsonCommandOutput(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

function getChromeNativeHostV2RegistryPaths({ homeDir, stateHome = process.env.XDG_STATE_HOME }) {
  const codexHome = path.join(homeDir, '.codex');
  const linuxStateHome =
    typeof stateHome === 'string' && stateHome.trim().length > 0
      ? stateHome.trim()
      : path.join(homeDir, '.local', 'state');
  return [
    path.join(linuxStateHome, 'openai-codex', 'chrome-native-hosts-v2.json'),
    path.join(codexHome, 'chrome-native-hosts-v2.json')
  ].filter((entry, index, entries) => entries.indexOf(entry) === index);
}

function mergeNodeModuleDirs(existingDirs, extraDir) {
  return [
    ...new Set(
      [
        ...(Array.isArray(existingDirs) ? existingDirs : []),
        extraDir
      ].filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
    )
  ];
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function repairChromeNativeHostRegistryEntry(entry, { resourcesDir, nodePath, nodeReplPath }) {
  if (!isObject(entry) || !isObject(entry.paths)) {
    return {
      entry,
      changed: false
    };
  }

  const paths = entry.paths;
  const ownedByResources =
    paths.resourcesPath === resourcesDir ||
    [paths.nodePath, paths.nodeReplPath, paths.extensionHostPath, paths.codexCliPath].some(
      (candidate) => typeof candidate === 'string' && candidate.startsWith(`${resourcesDir}${path.sep}`)
    );
  if (!ownedByResources) {
    return {
      entry,
      changed: false
    };
  }

  const nodeModuleDir = path.join(resourcesDir, 'cua_node', 'lib', 'node_modules');
  const repairedPaths = {
    ...paths,
    nodePath,
    nodeReplPath,
    nodeModuleDirs: mergeNodeModuleDirs(paths.nodeModuleDirs, nodeModuleDir)
  };
  const changed = JSON.stringify(repairedPaths) !== JSON.stringify(paths);
  return {
    entry: changed
      ? {
          ...entry,
          paths: repairedPaths,
          updatedAt: new Date().toISOString()
        }
      : entry,
    changed
  };
}

export async function repairLinuxChromeNativeHostRuntimeRegistries({
  resourcesDir,
  homeDir = getPaths().home,
  stateHome = process.env.XDG_STATE_HOME,
  logger = null
}) {
  const nodePath = path.join(resourcesDir, 'node');
  const nodeReplPath = path.join(resourcesDir, 'node_repl');
  await assertLinuxExecutableFile(nodePath, 'Chrome native host registry node command');
  await assertLinuxExecutableFile(nodeReplPath, 'Chrome native host registry node_repl command');

  const registryPaths = getChromeNativeHostV2RegistryPaths({ homeDir, stateHome });
  const repairedPaths = [];
  const missingPaths = [];
  const errors = [];

  for (const registryPath of registryPaths) {
    if (!(await fileExists(registryPath))) {
      missingPaths.push(registryPath);
      continue;
    }
    try {
      const registry = await parseJsonFile(registryPath);
      if (!Array.isArray(registry.entries)) {
        continue;
      }
      let changed = false;
      const entries = registry.entries.map((entry) => {
        const repair = repairChromeNativeHostRegistryEntry(entry, {
          resourcesDir,
          nodePath,
          nodeReplPath
        });
        changed = changed || repair.changed;
        return repair.entry;
      });
      if (changed) {
        await fs.promises.writeFile(
          registryPath,
          `${JSON.stringify({ ...registry, entries }, null, 2)}\n`,
          'utf8'
        );
        repairedPaths.push(registryPath);
      }
    } catch (error) {
      errors.push({
        path: registryPath,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (repairedPaths.length > 0) {
    logger?.info?.(`Repaired Chrome native host runtime registry ${repairedPaths.join(',')}`);
  }
  if (errors.length > 0) {
    logger?.warn?.(`Chrome native host runtime registry repair errors: ${JSON.stringify(errors)}`);
  }

  return {
    status: 'installed',
    registryPaths,
    repairedPaths,
    missingPaths,
    errors,
    nodePath,
    nodeReplPath
  };
}

export async function installLinuxChromeExtensionHost({
  resourcesDir,
  homeDir = getPaths().home,
  extensionId = CHROME_EXTENSION_ID,
  hostName = CHROME_EXTENSION_HOST_NAME,
  logger = null
}) {
  const hostModulePath = path.join(resourcesDir, CHROME_EXTENSION_HOST_MODULE_FILE_NAME);
  const hostExecutablePath = path.join(resourcesDir, CHROME_EXTENSION_HOST_FILE_NAME);
  const nodePath = path.join(resourcesDir, 'node');
  const manifestPath = path.join(
    homeDir,
    '.config',
    'google-chrome',
    'NativeMessagingHosts',
    `${hostName}.json`
  );
  const manifest = {
    name: hostName,
    description: 'Codex chrome native messaging host',
    type: 'stdio',
    path: hostExecutablePath,
    allowed_origins: [`chrome-extension://${extensionId}/`]
  };

  await ensureDir(resourcesDir);
  await fs.promises.writeFile(hostModulePath, buildLinuxChromeExtensionHostModule(), 'utf8');
  await writeExecutable(
    hostExecutablePath,
    `#!/usr/bin/env bash
set -euo pipefail
exec "$(dirname "$0")/node" "$(dirname "$0")/${CHROME_EXTENSION_HOST_MODULE_FILE_NAME}" "$@"
`
  );
  await ensureDir(path.dirname(manifestPath));
  await fs.promises.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await assertLinuxExecutableFile(hostExecutablePath, 'Installed Chrome extension host');
  logger?.info?.(`Installed Chrome native messaging host manifest ${manifestPath}`);

  return {
    chromeExtensionHost: {
      status: 'installed',
      targetPath: hostExecutablePath,
      modulePath: hostModulePath,
      nodePath
    },
    chromeNativeMessagingHost: {
      status: 'installed',
      manifestPath,
      hostName,
      extensionId
    }
  };
}

export async function installLinuxChromeBundledPluginHost({
  resourcesDir,
  homeDir = getPaths().home,
  hostExecutablePath = path.join(resourcesDir, CHROME_EXTENSION_HOST_FILE_NAME),
  releaseVersion = null,
  logger = null
}) {
  const arch = process.arch;
  if (arch !== 'x64' && arch !== 'arm64') {
    return {
      status: 'skipped',
      reason: `unsupported-arch-${arch}`,
      targetPaths: []
    };
  }

  const targetPaths = [
    path.join(
      resourcesDir,
      'plugins',
      'openai-bundled',
      'plugins',
      'chrome',
      'extension-host',
      'linux',
      arch,
      'extension-host'
    )
  ];
  const chromeCacheRoot = path.join(
    homeDir,
    '.codex',
    'plugins',
    'cache',
    'openai-bundled',
    'chrome'
  );
  for (const cacheEntry of await listExistingChromePluginCacheEntries(chromeCacheRoot, {
    releaseVersion
  })) {
    targetPaths.push(path.join(cacheEntry, 'extension-host', 'linux', arch, 'extension-host'));
  }

  const installedTargetPaths = [];
  for (const targetPath of targetPaths) {
    await ensureDir(path.dirname(targetPath));
    await writeExecutable(
      targetPath,
      `#!/usr/bin/env bash
set -euo pipefail
exec '${hostExecutablePath.replaceAll("'", "'\\''")}' "$@"
`
    );
    await assertLinuxExecutableFile(targetPath, 'Installed Chrome bundled plugin host wrapper');
    installedTargetPaths.push(targetPath);
  }

  logger?.info?.(
    `Installed Chrome bundled plugin Linux host wrapper${installedTargetPaths.length === 1 ? '' : 's'} ${installedTargetPaths.join(',')}`
  );

  return {
    status: 'installed',
    targetPaths: installedTargetPaths,
    hostExecutablePath
  };
}

async function listExistingChromePluginCacheEntries(chromeCacheRoot, { releaseVersion = null } = {}) {
  let entries;
  try {
    entries = await fs.promises.readdir(chromeCacheRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const allowedNames = new Set(['latest']);
  if (typeof releaseVersion === 'string' && releaseVersion.trim().length > 0) {
    allowedNames.add(releaseVersion.trim());
  }

  const cacheEntries = [];
  for (const entry of entries) {
    if (!allowedNames.has(entry.name)) {
      continue;
    }
    const entryPath = path.join(chromeCacheRoot, entry.name);
    if (!entry.isDirectory() && !entry.isSymbolicLink()) {
      continue;
    }
    const pluginJsonPath = path.join(entryPath, '.codex-plugin', 'plugin.json');
    if (await fileExists(pluginJsonPath)) {
      cacheEntries.push(entryPath);
    }
  }
  return cacheEntries;
}

export function buildLinuxChromeExtensionHostModule() {
  return `import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const FRAME_HEADER_BYTES = 4;
const SOCKET_DIR = process.env.CODEX_BROWSER_USE_SOCKET_DIR || '/tmp/codex-browser-use';
const SOCKET_PATH = path.join(SOCKET_DIR, 'chrome-extension-' + crypto.randomUUID() + '.sock');
const pendingRequests = new Map();
const clients = new Set();
let nextRequestId = 1;
let shuttingDown = false;

class FrameDecoder {
  chunks = [];
  byteLength = 0;

  push(chunk) {
    this.chunks.push(Buffer.from(chunk));
    this.byteLength += chunk.byteLength;
    const messages = [];
    while (this.byteLength >= FRAME_HEADER_BYTES) {
      const header = this.peek(FRAME_HEADER_BYTES);
      const bodyLength = header.readUInt32LE(0);
      const frameLength = FRAME_HEADER_BYTES + bodyLength;
      if (this.byteLength < frameLength) break;
      const frame = this.consume(frameLength);
      messages.push(JSON.parse(frame.subarray(FRAME_HEADER_BYTES).toString('utf8')));
    }
    return messages;
  }

  peek(length) {
    if (this.chunks[0]?.byteLength >= length) return this.chunks[0].subarray(0, length);
    const out = Buffer.allocUnsafe(length);
    let offset = 0;
    for (const chunk of this.chunks) {
      const copied = chunk.copy(out, offset, 0, length - offset);
      offset += copied;
      if (offset === length) break;
    }
    return out;
  }

  consume(length) {
    const out = Buffer.allocUnsafe(length);
    let offset = 0;
    while (offset < length) {
      const chunk = this.chunks[0];
      if (!chunk) throw new Error('Frame decoder underflow.');
      const copied = chunk.copy(out, offset, 0, length - offset);
      offset += copied;
      this.byteLength -= copied;
      if (copied === chunk.byteLength) this.chunks.shift();
      else this.chunks[0] = chunk.subarray(copied);
    }
    return out;
  }
}

function encode(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  const frame = Buffer.allocUnsafe(FRAME_HEADER_BYTES + body.byteLength);
  frame.writeUInt32LE(body.byteLength, 0);
  body.copy(frame, FRAME_HEADER_BYTES);
  return frame;
}

function sendToChrome(message) {
  process.stdout.write(encode(message));
}

function sendToClient(client, message) {
  if (!client.destroyed) client.write(encode(message));
}

function handleChromeMessage(message) {
  if (message && typeof message === 'object' && 'method' in message) {
    if (message.method === 'ping') {
      if ('id' in message) {
        sendToChrome({ jsonrpc: '2.0', id: message.id, result: 'pong' });
      } else {
        sendToChrome({ jsonrpc: '2.0', method: 'pong' });
      }
      return;
    }
    if ('id' in message) {
      sendToChrome({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32601, message: 'No handler registered for method: ' + message.method }
      });
      return;
    }
    for (const client of clients) sendToClient(client, message);
    return;
  }

  const pending = pendingRequests.get(message?.id);
  if (!pending) return;
  pendingRequests.delete(message.id);
  sendToClient(pending.client, { ...message, id: pending.id });
}

function handleClientMessage(client, message) {
  if (message && typeof message === 'object' && 'method' in message) {
    if ('id' in message) {
      const hostId = nextRequestId++;
      pendingRequests.set(hostId, { client, id: message.id });
      sendToChrome({ ...message, id: hostId });
    } else {
      sendToChrome(message);
    }
  }
}

function removeClient(client) {
  clients.delete(client);
  for (const [id, pending] of pendingRequests) {
    if (pending.client === client) pendingRequests.delete(id);
  }
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const client of clients) client.destroy();
  server.close(() => {});
  fs.rmSync(SOCKET_PATH, { force: true });
}

await fs.promises.mkdir(SOCKET_DIR, { recursive: true });
fs.rmSync(SOCKET_PATH, { force: true });

const server = net.createServer((client) => {
  clients.add(client);
  const decoder = new FrameDecoder();
  client.on('data', (chunk) => {
    for (const message of decoder.push(chunk)) handleClientMessage(client, message);
  });
  client.on('error', () => removeClient(client));
  client.on('close', () => removeClient(client));
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(SOCKET_PATH, () => {
    server.off('error', reject);
    resolve();
  });
});

const chromeDecoder = new FrameDecoder();
process.stdin.on('data', (chunk) => {
  for (const message of chromeDecoder.push(chunk)) handleChromeMessage(message);
});
process.stdin.on('end', shutdown);
process.stdin.on('error', shutdown);
process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});
process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});
`;
}

async function resolveCodexCliPath() {
  const candidatePaths = [];

  if (process.env.CODEX_CLI_PATH) {
    candidatePaths.push(process.env.CODEX_CLI_PATH);
  }

  candidatePaths.push(path.join(PROJECT_ROOT, 'node_modules', '.bin', 'codex'));

  const pathResolved = await findExecutableInPath('codex');
  if (pathResolved) {
    candidatePaths.push(pathResolved);
  }

  const resolvedPath = await resolveFirstExecutablePath(candidatePaths);
  if (resolvedPath) {
    return resolvedPath;
  }

  throw new Error(
    'Could not locate a Linux Codex CLI. Install it first with `npm install -g @openai/codex@latest`, or set CODEX_CLI_PATH to an existing codex binary before running install-desktop.'
  );
}

async function resolveRipgrepPath() {
  const candidatePaths = [];

  if (process.env.RG_PATH) {
    candidatePaths.push(process.env.RG_PATH);
  }

  const pathResolved = await findExecutableInPath('rg');
  if (pathResolved) {
    candidatePaths.push(pathResolved);
  }

  const resolvedPath = await resolveFirstExecutablePath(candidatePaths);
  if (resolvedPath) {
    return resolvedPath;
  }

  throw new Error(
    'Could not locate a Linux ripgrep binary. Install `rg` or set RG_PATH before running install-desktop.'
  );
}

async function isInstalledElectronPackageVersion(packageJsonPath, electronVersion) {
  if (!(await fileExists(packageJsonPath))) {
    return false;
  }
  try {
    const installedPackage = await parseJsonFile(packageJsonPath);
    return installedPackage.version === electronVersion;
  } catch {
    return false;
  }
}

async function isElectronRuntimePackageInstalled({ runtimeRoot, electronVersion }) {
  const electronPackageJsonPath = path.join(runtimeRoot, 'node_modules', 'electron', 'package.json');
  const electronGetPackageJsonPath = path.join(
    runtimeRoot,
    'node_modules',
    '@electron',
    'get',
    'package.json'
  );
  return (
    (await isInstalledElectronPackageVersion(electronPackageJsonPath, electronVersion)) &&
    (await fileExists(electronGetPackageJsonPath))
  );
}

export async function isUsableElectronRuntimeDir(runtimeSourceDir) {
  const executablePath = path.join(runtimeSourceDir, 'electron');
  try {
    const executableStat = await fs.promises.stat(executablePath);
    return executableStat.isFile();
  } catch {
    return false;
  }
}

function describeMissingElectronRuntime(runtimeSourceDir) {
  return `missing Linux Electron executable ${path.join(runtimeSourceDir, 'electron')}`;
}

const ELECTRON_RUNTIME_ARCHIVE_RESOLVER_SCRIPT = `
const { downloadArtifact } = require('@electron/get');
const { version } = require('./node_modules/electron/package.json');

downloadArtifact({
  version,
  artifactName: 'electron',
  force: process.env.force_no_cache === 'true',
  cacheRoot: process.env.electron_config_cache,
  checksums:
    process.env.electron_use_remote_checksums || process.env.npm_config_electron_use_remote_checksums
      ? undefined
      : require('./node_modules/electron/checksums.json'),
  platform: process.env.ELECTRON_INSTALL_PLATFORM || process.env.npm_config_platform || process.platform,
  arch: process.env.ELECTRON_INSTALL_ARCH || process.env.npm_config_arch || process.arch
})
  .then((archivePath) => {
    process.stdout.write(archivePath);
  })
  .catch((error) => {
    console.error(error.stack ?? error.message ?? String(error));
    process.exit(1);
  });
`;

async function installElectronRuntimeArchive({
  cacheHome,
  runtimeRoot,
  runtimeSourceDir,
  runCommandImpl,
  logger
}) {
  const runtimeEnv = {
    electron_config_cache: path.join(cacheHome, 'electron'),
    ELECTRON_INSTALL_PLATFORM: 'linux',
    ELECTRON_INSTALL_ARCH: process.arch,
    npm_config_update_notifier: 'false',
    npm_config_fund: 'false',
    npm_config_audit: 'false'
  };
  const { stdout } = await runCommandImpl(
    process.execPath,
    ['-e', ELECTRON_RUNTIME_ARCHIVE_RESOLVER_SCRIPT],
    {
      cwd: runtimeRoot,
      env: runtimeEnv,
      logger
    }
  );
  const archivePath = stdout.trim();
  if (!archivePath) {
    throw new Error('Electron runtime archive resolver did not return an archive path.');
  }

  await removeIfExists(runtimeSourceDir);
  await ensureDir(runtimeSourceDir);
  await runCommandImpl('unzip', ['-q', '-o', archivePath, '-d', runtimeSourceDir], {
    logger
  });
  await fs.promises.writeFile(
    path.join(runtimeRoot, 'node_modules', 'electron', 'path.txt'),
    'electron',
    'utf8'
  );
}

export async function resolveRuntimeSourceDir({
  cacheHome,
  electronVersion,
  logger,
  retryForeverImpl = retryForever,
  runCommandImpl = runCommand
}) {
  const localRuntimeDir = path.join(PROJECT_ROOT, 'node_modules', 'electron', 'dist');
  const localPackageJsonPath = path.join(PROJECT_ROOT, 'node_modules', 'electron', 'package.json');
  if (await fileExists(localPackageJsonPath)) {
    const localPackage = await parseJsonFile(localPackageJsonPath);
    if (localPackage.version === electronVersion) {
      if (await isUsableElectronRuntimeDir(localRuntimeDir)) {
        logger.info(`Using local Electron runtime ${electronVersion}`);
        return {
          runtimeSourceDir: localRuntimeDir,
          sourceKind: 'local'
        };
      }
      logger.warn(
        `Ignoring local Electron runtime ${electronVersion}: ${describeMissingElectronRuntime(
          localRuntimeDir
        )}`
      );
    }
  }

  const runtimeRoot = path.join(cacheHome, 'electron-runtime', electronVersion);
  const runtimePackageJsonPath = path.join(runtimeRoot, 'package.json');
  const runtimeSourceDir = path.join(runtimeRoot, 'node_modules', 'electron', 'dist');
  await ensureDir(runtimeRoot);
  if (!(await fileExists(runtimePackageJsonPath))) {
    await fs.promises.writeFile(runtimePackageJsonPath, JSON.stringify({ private: true }, null, 2), 'utf8');
  }

  if (!(await isElectronRuntimePackageInstalled({ runtimeRoot, electronVersion }))) {
    await retryForeverImpl(`install-electron-runtime-${electronVersion}`, logger, async () => {
      await runCommandImpl(
        'npm',
        ['install', '--no-save', `electron@${electronVersion}`],
        {
          cwd: runtimeRoot,
          env: {
            npm_config_cache: path.join(cacheHome, 'npm'),
            npm_config_update_notifier: 'false',
            npm_config_fund: 'false',
            npm_config_audit: 'false'
          },
          logger
        }
      );
    });
  }

  if (!(await isUsableElectronRuntimeDir(runtimeSourceDir))) {
    logger.warn(
      `Repairing cached Electron runtime ${electronVersion}: ${describeMissingElectronRuntime(
        runtimeSourceDir
      )}`
    );
    await removeIfExists(runtimeSourceDir);
    await retryForeverImpl(`download-electron-runtime-${electronVersion}`, logger, async () => {
      await installElectronRuntimeArchive({
        cacheHome,
        runtimeRoot,
        runtimeSourceDir,
        runCommandImpl,
        logger
      });
    });
  }

  if (!(await isUsableElectronRuntimeDir(runtimeSourceDir))) {
    throw new Error(
      `Electron runtime ${electronVersion} could not be installed for Linux: ${describeMissingElectronRuntime(
        runtimeSourceDir
      )}.`
    );
  }

  return {
    runtimeSourceDir,
    sourceKind: 'cache'
  };
}

async function prepareNativeRebuildWorkspace({
  cacheHome,
  electronVersion,
  nativeModuleVersions,
  logger
}) {
  const dependencyFingerprint = crypto
    .createHash('sha1')
    .update(
      JSON.stringify({
        electronVersion,
        nativeModuleVersions
      })
    )
    .digest('hex')
    .slice(0, 12);
  const workspaceRoot = path.join(cacheHome, 'native-rebuild', dependencyFingerprint);
  const packageJsonPath = path.join(workspaceRoot, 'package.json');
  const dependencies = {
    electron: electronVersion,
    ...nativeModuleVersions
  };

  await ensureDir(workspaceRoot);
  await fs.promises.writeFile(
    packageJsonPath,
    JSON.stringify(
      {
        private: true,
        dependencies
      },
      null,
      2
    ),
    'utf8'
  );

  if (!(await workspaceHasDependencies(workspaceRoot, dependencies))) {
    await retryForever(`install-native-rebuild-workspace-${dependencyFingerprint}`, logger, async () => {
      await runCommand('npm', ['install'], {
        cwd: workspaceRoot,
        env: {
          npm_config_cache: path.join(cacheHome, 'npm'),
          npm_config_update_notifier: 'false',
          npm_config_fund: 'false',
          npm_config_audit: 'false'
        },
        logger
      });
    });
  }

  await patchNativeRebuildWorkspaceSources({ workspaceRoot, electronVersion, logger });

  return workspaceRoot;
}

async function patchNativeRebuildWorkspaceSources({ workspaceRoot, electronVersion, logger }) {
  if (getMajorVersion(electronVersion) < 42) {
    return;
  }

  const betterSqlite3Root = path.join(workspaceRoot, 'node_modules', 'better-sqlite3');
  if (!(await fileExists(path.join(betterSqlite3Root, 'package.json')))) {
    return;
  }

  const result = await patchBetterSqlite3V8ExternalPointerTagSource(betterSqlite3Root);
  if (result.status === 'applied') {
    logger.info('Patched better-sqlite3 source for Electron 42 V8 external pointer tags');
  }
}

export async function patchBetterSqlite3V8ExternalPointerTagSource(moduleRoot) {
  const replacements = [
    {
      filePath: path.join(moduleRoot, 'src', 'better_sqlite3.cpp'),
      patches: [
        [
          'v8::External::New(isolate, addon)',
          'v8::External::New(isolate, addon, v8::kExternalPointerTypeTagDefault)'
        ]
      ]
    },
    {
      filePath: path.join(moduleRoot, 'src', 'util', 'macros.cpp'),
      patches: [
        [
          'info.Data().As<v8::External>()->Value()',
          'info.Data().As<v8::External>()->Value(v8::kExternalPointerTypeTagDefault)'
        ]
      ]
    },
    {
      filePath: path.join(moduleRoot, 'src', 'util', 'helpers.cpp'),
      patches: [[/(\n[ \t]*func,\n)[ \t]*0,(\n[ \t]*data\n)/g, '$1\t\t\tnullptr,$2']]
    }
  ];

  let changed = false;
  for (const { filePath, patches } of replacements) {
    if (!(await fileExists(filePath))) {
      continue;
    }
    let source = await fs.promises.readFile(filePath, 'utf8');
    let updated = source;
    for (const [target, replacement] of patches) {
      updated = updated.replaceAll(target, replacement);
    }
    if (updated !== source) {
      await fs.promises.writeFile(filePath, updated, 'utf8');
      changed = true;
    }
  }

  return {
    status: changed ? 'applied' : 'already-applied'
  };
}

function getMajorVersion(version) {
  const major = Number.parseInt(String(version).split('.')[0] ?? '', 10);
  return Number.isFinite(major) ? major : 0;
}

async function workspaceHasDependencies(workspaceRoot, dependencies) {
  for (const [packageName, expectedVersion] of Object.entries(dependencies)) {
    const packageJsonPath = path.join(workspaceRoot, 'node_modules', packageName, 'package.json');
    if (!(await fileExists(packageJsonPath))) {
      return false;
    }
    const installedPackage = await parseJsonFile(packageJsonPath);
    if (installedPackage.version !== String(expectedVersion).replace(/^[^\d]*/, '')) {
      return false;
    }
  }
  return true;
}

export async function copyUpstreamResources({ upstreamResourcesDir, resourcesDir }) {
  const entries = await fs.promises.readdir(upstreamResourcesDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'app.asar' || entry.name === 'app.asar.unpacked') {
      continue;
    }
    if (entry.name === 'codex' || entry.name === 'rg') {
      continue;
    }
    if (entry.name === 'node' || entry.name === 'node_repl') {
      continue;
    }
    if (entry.name === 'native') {
      continue;
    }

    const sourcePath = path.join(upstreamResourcesDir, entry.name);
    const destinationPath = path.join(resourcesDir, entry.name);
    if (entry.isDirectory()) {
      await copyDir(sourcePath, destinationPath);
    } else {
      await copyFile(sourcePath, destinationPath);
    }
  }
}

async function collectBundledPluginDiagnostics(resourcesDir) {
  const marketplacePath = path.join(
    resourcesDir,
    'plugins',
    'openai-bundled',
    '.agents',
    'plugins',
    'marketplace.json'
  );
  const pluginsRoot = path.join(resourcesDir, 'plugins', 'openai-bundled', 'plugins');
  if (!(await fileExists(marketplacePath))) {
    return {
      status: 'missing',
      marketplacePath,
      pluginsRoot,
      marketplacePlugins: [],
      installedPlugins: []
    };
  }

  const marketplace = await parseJsonFile(marketplacePath);
  const marketplacePlugins = Array.isArray(marketplace.plugins)
    ? marketplace.plugins
        .map((plugin) => (typeof plugin?.name === 'string' ? plugin.name : null))
        .filter(Boolean)
        .sort()
    : [];
  let installedPlugins = [];
  try {
    const entries = await fs.promises.readdir(pluginsRoot, { withFileTypes: true });
    installedPlugins = (
      await Promise.all(
        entries
          .filter((entry) => entry.isDirectory())
          .map(async (entry) => {
            const pluginJsonPath = path.join(
              pluginsRoot,
              entry.name,
              '.codex-plugin',
              'plugin.json'
            );
            if (!(await fileExists(pluginJsonPath))) {
              return null;
            }
            const plugin = await parseJsonFile(pluginJsonPath);
            return {
              name: typeof plugin.name === 'string' ? plugin.name : entry.name,
              version: typeof plugin.version === 'string' ? plugin.version : null,
              path: path.join(pluginsRoot, entry.name)
            };
          })
      )
    )
      .filter(Boolean)
      .sort((left, right) => left.name.localeCompare(right.name));
  } catch (error) {
    return {
      status: 'error',
      marketplacePath,
      pluginsRoot,
      marketplacePlugins,
      installedPlugins: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }

  return {
    status: 'installed',
    marketplacePath,
    pluginsRoot,
    marketplacePlugins,
    installedPlugins
  };
}

async function installBundledCodexCli(resourcesDir) {
  const bundledCliPath = path.join(resourcesDir, 'bin', 'codex');
  const script = `#!/usr/bin/env bash
set -euo pipefail
self_path="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"

if [[ -n "\${CODEX_CLI_PATH:-}" && "\${CODEX_CLI_PATH}" != "$self_path" ]]; then
  exec "\${CODEX_CLI_PATH}" "$@"
fi

if command -v codex >/dev/null 2>&1; then
  exec "$(command -v codex)" "$@"
fi

echo "Codex CLI not found. Install it with: npm install -g @openai/codex@latest" >&2
exit 127
`;
  await writeExecutable(bundledCliPath, script);
  await writeExecutable(path.join(resourcesDir, 'codex'), script);
}

async function installBundledRipgrep(resourcesDir, rgPath) {
  const bundledRipgrepPath = path.join(resourcesDir, 'rg');
  await copyFile(rgPath, bundledRipgrepPath);
  await fs.promises.chmod(bundledRipgrepPath, 0o755);
}

function buildSkippedPatchResult(reason) {
  return {
    status: 'skipped',
    reason
  };
}

function assertRequiredPatchApplied(patchName, patchResult) {
  if (patchResult?.status === 'applied' || patchResult?.status === 'already-applied') {
    return;
  }
  const sourceDetail = patchResult?.sourceName ? ` Source: ${patchResult.sourceName}.` : '';
  const reasonDetail = patchResult?.reason ? ` Reason: ${patchResult.reason}.` : '';
  throw new Error(`Required ${patchName} patch was not applied.${sourceDetail}${reasonDetail}`);
}

function summarizePatchStates(patches) {
  return Object.entries(patches)
    .map(([name, result]) => `${name}=${result.status}`)
    .join(',');
}

export function createInstallDiagnosticManifest({
  installedAt,
  channel,
  release,
  flavor,
  electronVersion,
  runtimeSourceKind,
  nativeModules,
  nativeModuleVersions,
  browserUseRuntime = null,
  browserUseNodeRepl = null,
  browserUseNode = null,
  browserUseMcpConfig = null,
  linuxComputerUse = null,
  chromeExtensionHost = null,
  chromeNativeMessagingHost = null,
  chromeBundledPluginHost = null,
  chromeNativeHostRuntimeRegistryRepair = null,
  bundledPlugins = null,
  chromeExtensionHostCleanup = null,
  patches
}) {
  return {
    manifestVersion: 1,
    installedAt,
    channel: channel.id,
    upstream: {
      version: release.version,
      buildNumber: release.buildNumber,
      flavor
    },
    runtime: {
      electronVersion,
      sourceKind: runtimeSourceKind
    },
    nativeModules: nativeModules.map((moduleName) => ({
      name: moduleName,
      version: nativeModuleVersions[moduleName] ?? null
    })),
    browserUseRuntime,
    browserUseNodeRepl,
    browserUseNode,
    browserUseMcpConfig,
    linuxComputerUse,
    chromeExtensionHost,
    chromeNativeMessagingHost,
    chromeBundledPluginHost,
    chromeNativeHostRuntimeRegistryRepair,
    bundledPlugins,
    chromeExtensionHostCleanup,
    patches
  };
}

async function writeInstallDiagnosticManifest({ manifestPath, manifest }) {
  await ensureDir(path.dirname(manifestPath));
  await fs.promises.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}
