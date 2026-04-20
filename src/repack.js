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
const NEW_THREAD_MODEL_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch the renderer new-thread model bundle for Linux.';
const TODO_PROGRESS_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch the renderer todo progress bundle for Linux.';
const LINUX_VISUAL_COMPAT_CSS_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch the renderer Linux visual-compat stylesheet.';
const LINUX_VISUAL_COMPAT_JS_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch the renderer Linux visual-compat script.';
const LINUX_BROWSER_COMMENT_POSITION_PATCH_BASE_ERROR_MESSAGE =
  'Could not patch the renderer browser comment positioning bundle for Linux.';
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

export function parseArgs(argv) {
  const options = {
    beta: false,
    version: null,
    help: false,
    skipOpenTargetsPatch: false,
    skipTerminalPatch: false,
    skipTodoProgressPatch: false,
    diagnosticManifest: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--beta') {
      options.beta = true;
      continue;
    }
    if (arg === '--version') {
      const next = argv[index + 1];
      if (!next) {
        throw new Error('Missing value for --version');
      }
      options.version = next;
      index += 1;
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
    '  install-desktop --version <version>',
    '  install-desktop --beta',
    '  install-desktop --beta --version <version>',
    '',
    'Options:',
    '  --skip-open-targets-patch   leave the Linux editor target patch disabled',
    '  --skip-terminal-patch       leave the Linux terminal lifecycle patch disabled',
    '  --skip-todo-progress-patch  leave the Linux todo progress patch disabled',
    '  --diagnostic-manifest       print the written diagnostic manifest to the install log'
  ].join('\n');
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

  const channel = options.beta ? CHANNELS.beta : CHANNELS.stable;
  logger.info(`Selected channel: ${channel.id}`);
  logger.info(`Selected feed: ${channel.feedUrl}`);

  const releases = await fetchAppcastReleases(channel.feedUrl);
  const release = resolveRelease(releases, options.version);
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
  const linuxCloseCancelPatch = await patchMainProcessLinuxCloseCancel(extractedAppDir, logger);
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
  const terminalPatch = options.skipTerminalPatch
    ? buildSkippedPatchResult('cli-option-disabled')
    : await patchRendererTerminalBundle(extractedAppDir, logger);
  const newThreadModelPatch = await patchRendererNewThreadModelBundle(extractedAppDir, logger);
  assertRequiredPatchApplied('new-thread model', newThreadModelPatch);
  const todoProgressPatch = options.skipTodoProgressPatch
    ? buildSkippedPatchResult('cli-option-disabled')
    : await patchRendererTodoProgressBundle(extractedAppDir, logger);
  const linuxVisualCompatPatch = await patchRendererLinuxVisualCompat(extractedAppDir, logger);
  const linuxBrowserCommentPositionPatch = await patchRendererLinuxBrowserCommentPositionBundle(
    extractedAppDir,
    logger
  );
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
    linuxCloseCancel: linuxCloseCancelPatch,
    linuxWorktreeEnvironmentMain: linuxWorktreeEnvironmentMainPatch,
    linuxWorktreeEnvironmentWorker: linuxWorktreeEnvironmentWorkerPatch,
    terminalLifecycle: terminalPatch,
    newThreadModel: newThreadModelPatch,
    todoProgress: todoProgressPatch,
    linuxVisualCompat: linuxVisualCompatPatch,
    linuxBrowserCommentPosition: linuxBrowserCommentPositionPatch,
    backgroundSubagentsPanel: backgroundSubagentsPanelPatch,
    latestAgentTurnExpansion: latestAgentTurnExpansionPatch,
    compactSlashCommand: compactSlashCommandPatch
  });
  const iconPath = await installChannelRuntime({
    channel,
    channelAppDir,
    channelBinDir,
    channelIconDir,
    channelStateDir,
    runtimeSourceDir: runtime.runtimeSourceDir,
    packagedAsarPath,
    upstreamResourcesDir,
    unpackedSourceRoot: extractedAppDir,
    rgPath,
    nativeModules,
    runtimeLogDir,
    diagnosticManifestPath,
    patchSummary,
    logger
  });

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
    patches: {
      bootstrap: bootstrapPatch,
      openTargets: openTargetsPatch,
      linuxMenuBar: linuxMenuBarPatch,
      linuxCloseCancel: linuxCloseCancelPatch,
      linuxWorktreeEnvironmentMain: linuxWorktreeEnvironmentMainPatch,
      linuxWorktreeEnvironmentWorker: linuxWorktreeEnvironmentWorkerPatch,
      terminalLifecycle: terminalPatch,
      newThreadModel: newThreadModelPatch,
      todoProgress: todoProgressPatch,
      linuxVisualCompat: linuxVisualCompatPatch,
      linuxBrowserCommentPosition: linuxBrowserCommentPositionPatch,
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
const LINUX_CLOSE_CANCEL_PATCH_MARKER = 'codexLinuxCloseCancel';
const LINUX_WORKTREE_ENVIRONMENT_MAIN_PATCH_MARKER = 'codexLinuxWorktreeEnvironmentMain';
const LINUX_WORKTREE_ENVIRONMENT_WORKER_PATCH_MARKER = 'codexLinuxWorktreeEnvironmentWorker';
const OPEN_TARGETS_BLOCK_PATTERN =
  /var (?<targetVar>[A-Za-z_$][\w$]*)=\[(?<targetList>[A-Za-z0-9_$,]+)\],(?<loggerVar>[A-Za-z_$][\w$]*)=e\.(?<loggerFactory>[A-Za-z_$][\w$]*)\(`open-in-targets`\);function (?<platformFn>[A-Za-z_$][\w$]*)\(e\)\{return \k<targetVar>\.flatMap\(t=>\{let n=t\.platforms\[e\];return n\?\[\{id:t\.id,\.\.\.n\}\]:\[\]\}\)\}var (?<platformTargetsVar>[A-Za-z_$][\w$]*)=\k<platformFn>\(process\.platform\),(?<normalizedTargetsVar>[A-Za-z_$][\w$]*)=(?<normalizeFn>[A-Za-z_$][\w$]*)\(\k<platformTargetsVar>\),(?<editorTargetIdsVar>[A-Za-z_$][\w$]*)=new Set\(\k<platformTargetsVar>\.filter\(e=>e\.kind===`editor`\)\.map\(e=>e\.id\)\),(?<stateVar1>[A-Za-z_$][\w$]*)=null,(?<stateVar2>[A-Za-z_$][\w$]*)=null;/;
const LINUX_MENU_BAR_AUTO_HIDE_SNIPPET_CURRENT = 'process.platform===`win32`?{autoHideMenuBar:!0}:{}';
const LINUX_MENU_BAR_AUTO_HIDE_REPLACEMENT_CURRENT =
  'process.platform===`win32`?{autoHideMenuBar:!0}:process.platform===`linux`&&process?.env?.CODEX_DESKTOP_DISABLE_LINUX_AUTO_HIDE_MENU_BAR!==`1`?{/* codexLinuxMenuBarAutoHide */autoHideMenuBar:!0}:{}';
const LINUX_CLOSE_CANCEL_BEFORE_QUIT_SNIPPET_CURRENT =
  't.app.on(`before-quit`,a=>{if(e||r.canQuitWithoutPrompt()||n){m=!0,i.markAppQuitting();return}let o=t.app.getName();if(t.dialog.showMessageBoxSync({type:`warning`,buttons:[`Quit`,`Cancel`],defaultId:0,cancelId:1,noLink:!0,title:`Quit ${o}?`,message:`Quit ${o}?`,detail:`Any local threads running on this machine will be interrupted and scheduled automations won\'t run`})!==0){a.preventDefault();return}r.markQuitApproved(),m=!0,i.markAppQuitting()})';
const LINUX_CLOSE_CANCEL_BEFORE_QUIT_REPLACEMENT_CURRENT =
  't.app.on(`before-quit`,s=>{if(e||r.canQuitWithoutPrompt()||n){m=!0,i.markAppQuitting();return}let c=t.app.getName();if(t.dialog.showMessageBoxSync({type:`warning`,buttons:[`Quit`,`Cancel`],defaultId:0,cancelId:1,noLink:!0,title:`Quit ${c}?`,message:`Quit ${c}?`,detail:`Any local threads running on this machine will be interrupted and scheduled automations won\'t run`})!==0){s.preventDefault();if(process.platform===`linux`&&process?.env?.CODEX_DESKTOP_DISABLE_LINUX_CLOSE_CANCEL_PATCH!==`1`){let e=i.showLastActivePrimaryWindow();e?a.refresh():Promise.resolve(o(`local`)).then(e=>{e&&!e.isDestroyed()&&(e.isMinimized()&&e.restore(),e.show(),e.focus()),a.refresh()})}return}r.markQuitApproved(),m=!0,i.markAppQuitting()})';
const LINUX_WORKTREE_ENVIRONMENT_MAIN_HELPER_ANCHOR =
  'var am=32e3,om=e.mr(`worktree-service`),sm=class{';
const LINUX_WORKTREE_ENVIRONMENT_MAIN_HELPER_REPLACEMENT =
  `var codexLinuxWorktreeEnvironmentBuiltins=typeof process.getBuiltinModule===\`function\`?{fs:process.getBuiltinModule(\`node:fs\`),path:process.getBuiltinModule(\`node:path\`)}:{fs:null,path:null};function codexLinuxListEnvironmentConfigPaths(e){let t=codexLinuxWorktreeEnvironmentBuiltins.fs,n=codexLinuxWorktreeEnvironmentBuiltins.path;if(!e||!t||!n)return[];let r=n.join(e,\`.codex\`,\`environments\`),i;try{i=t.readdirSync(r,{withFileTypes:!0})}catch{return[]}return i.filter(e=>e.isFile()&&e.name.endsWith(\`.toml\`)).map(e=>n.join(r,e.name)).sort()}function codexLinuxResolveWorktreeLocalEnvironmentPath(e,t){if(t===\`__none__\`||t!=null)return t;let n=codexLinuxListEnvironmentConfigPaths(e);return n.length===1?n[0]:null}/* ${LINUX_WORKTREE_ENVIRONMENT_MAIN_PATCH_MARKER} */var am=32e3,om=e.mr(\`worktree-service\`),sm=class{`;
const LINUX_WORKTREE_ENVIRONMENT_PENDING_REQUEST_SNIPPET_CURRENT =
  'let n=await this.requestGitWorker({method:`create-worktree`,params:{hostConfig:this.options.hostConfig,cwd:e.Zr(r.sourceWorkspaceRoot),startingState:r.startingState,localEnvironmentConfigPath:r.localEnvironmentConfigPath,streamId:i.streamId,setUpSyncedBranch:r.launchMode===`create-stable-worktree`?!1:void 0},signal:i.abortController.signal});';
const LINUX_WORKTREE_ENVIRONMENT_PENDING_REQUEST_REPLACEMENT_CURRENT =
  'let codexLinuxResolvedLocalEnvironmentPath=codexLinuxResolveWorktreeLocalEnvironmentPath(e.Zr(r.sourceWorkspaceRoot),r.localEnvironmentConfigPath);codexLinuxResolvedLocalEnvironmentPath===`__none__`?om().info(`[worktree-create] explicit-no-environment`,{safe:{flow:`pending`,launchMode:r.launchMode},sensitive:{sourceWorkspaceRoot:r.sourceWorkspaceRoot}}):r.localEnvironmentConfigPath==null&&codexLinuxResolvedLocalEnvironmentPath!=null&&om().info(`[worktree-create] auto-selected-single-environment`,{safe:{flow:`pending`,launchMode:r.launchMode},sensitive:{sourceWorkspaceRoot:r.sourceWorkspaceRoot,configPath:codexLinuxResolvedLocalEnvironmentPath}});let n=await this.requestGitWorker({method:`create-worktree`,params:{hostConfig:this.options.hostConfig,cwd:e.Zr(r.sourceWorkspaceRoot),startingState:r.startingState,localEnvironmentConfigPath:codexLinuxResolvedLocalEnvironmentPath,streamId:i.streamId,setUpSyncedBranch:r.launchMode===`create-stable-worktree`?!1:void 0},signal:i.abortController.signal});';
const LINUX_WORKTREE_ENVIRONMENT_PENDING_READY_LOG_SNIPPET_CURRENT =
  'hasLocalEnvironment:r.localEnvironmentConfigPath!=null';
const LINUX_WORKTREE_ENVIRONMENT_PENDING_READY_LOG_REPLACEMENT_CURRENT =
  'hasLocalEnvironment:codexLinuxResolvedLocalEnvironmentPath!=null&&codexLinuxResolvedLocalEnvironmentPath!==`__none__`';
const LINUX_WORKTREE_ENVIRONMENT_MANAGED_REQUEST_SNIPPET_CURRENT =
  'let o=await this.requestGitWorker({method:`create-worktree`,params:{hostConfig:this.options.getHostConfigForHostId(t),cwd:e.Zr(n),startingState:r,localEnvironmentConfigPath:i,streamId:a}}),s=this.newbornWorktreeRoots.has(o.worktreeGitRoot);';
const LINUX_WORKTREE_ENVIRONMENT_MANAGED_REQUEST_REPLACEMENT_CURRENT =
  'let codexLinuxResolvedLocalEnvironmentPath=codexLinuxResolveWorktreeLocalEnvironmentPath(e.Zr(n),i);codexLinuxResolvedLocalEnvironmentPath===`__none__`?om().info(`[worktree-create] explicit-no-environment`,{safe:{flow:`managed`},sensitive:{cwd:n}}):i==null&&codexLinuxResolvedLocalEnvironmentPath!=null&&om().info(`[worktree-create] auto-selected-single-environment`,{safe:{flow:`managed`},sensitive:{cwd:n,configPath:codexLinuxResolvedLocalEnvironmentPath}});let o=await this.requestGitWorker({method:`create-worktree`,params:{hostConfig:this.options.getHostConfigForHostId(t),cwd:e.Zr(n),startingState:r,localEnvironmentConfigPath:codexLinuxResolvedLocalEnvironmentPath,streamId:a}}),s=this.newbornWorktreeRoots.has(o.worktreeGitRoot);';
const LINUX_WORKTREE_ENVIRONMENT_MANAGED_READY_LOG_SNIPPET_CURRENT =
  'hasLocalEnvironment:i!=null';
const LINUX_WORKTREE_ENVIRONMENT_MANAGED_READY_LOG_REPLACEMENT_CURRENT =
  'hasLocalEnvironment:codexLinuxResolvedLocalEnvironmentPath!=null&&codexLinuxResolvedLocalEnvironmentPath!==`__none__`';
const LINUX_WORKTREE_ENVIRONMENT_WORKER_HELPER_ANCHOR =
  'async function NZ({gitManager:e,workspaceRoot:t,startingState:n,localEnvironmentConfigPath:r,setUpSyncedBranch:i=!0,appServerClient:a,signal:o,onLog:s,onWorktreePathAllocated:c}){';
const LINUX_WORKTREE_ENVIRONMENT_WORKER_HELPER_REPLACEMENT =
  `async function codexLinuxListEnvironmentConfigPaths(e,t){let n=await t.platformPath(),r=n.join(e,\`.codex\`,\`environments\`),i;try{i=await cz.readdir(r,t)}catch{return[]}return i.filter(e=>typeof e===\`string\`&&e.endsWith(\`.toml\`)).map(e=>n.join(r,e)).sort()}async function codexLinuxResolveWorktreeEnvironmentConfigPath(e,t,n){if(t===\`__none__\`)return{configPath:t,source:\`explicit-none\`};if(t!=null)return{configPath:t,source:\`explicit-selection\`};let r=await codexLinuxListEnvironmentConfigPaths(e,n);return r.length===1?{configPath:r[0],source:\`single-environment-fallback\`}:{configPath:null,source:\`missing\`}}/* ${LINUX_WORKTREE_ENVIRONMENT_WORKER_PATCH_MARKER} */async function NZ({gitManager:e,workspaceRoot:t,startingState:n,localEnvironmentConfigPath:r,setUpSyncedBranch:i=!0,appServerClient:a,signal:o,onLog:s,onWorktreePathAllocated:c}){`;
const LINUX_WORKTREE_ENVIRONMENT_WORKER_CLEANUP_HELPER_SNIPPET_CURRENT =
  'async function lX(e,t,n,r,i){return(await uX({workspaceRoot:e,localEnvironment:t,scriptType:`cleanup`,appServerClient:i,onLog:n,signal:r}))?.setupResult??null}';
const LINUX_WORKTREE_ENVIRONMENT_WORKER_CLEANUP_HELPER_REPLACEMENT_CURRENT =
  'async function lX(e,t,n,r,i,a){return(await uX({workspaceRoot:e,localEnvironment:t,scriptType:`cleanup`,appServerClient:a,injectedEnvironment:i,onLog:n,signal:r}))?.setupResult??null}';
const LINUX_WORKTREE_ENVIRONMENT_WORKER_CREATE_PATTERN =
  /if\(s\?\.\(`info`,ce\.Buffer\.from\(`Worktree created at \$\{g\}(?:\\n|\n)`,`utf8`\)\),await vZ\(g,(?<selectedVar>[A-Za-z_$][\w$]*)\?\?`__none__`,a,`worktree`,o\)\|\|s\?\.\(`stderr`,ce\.Buffer\.from\(`Failed to store selected environment in git config(?:\\n|\n)`,`utf8`\)\),\k<selectedVar>==null\)return s\?\.\(`info`,ce\.Buffer\.from\(`No local environment selected(?:\\n|\n)`,`utf8`\)\),\{success:!0,worktreeGitRoot:h,worktreeWorkspaceRoot:g,setupResult:null\};let v=await QJ\(\k<selectedVar>,a\);/;
const LINUX_WORKTREE_ENVIRONMENT_WORKER_CREATE_REPLACEMENT_CURRENT =
  'let codexLinuxEnvironmentSelection=await codexLinuxResolveWorktreeEnvironmentConfigPath(t,r,a),codexLinuxLocalEnvironmentConfigPath=codexLinuxEnvironmentSelection.configPath;codexLinuxEnvironmentSelection.source===`single-environment-fallback`?NX().info(`[worktree-create] auto-selected-single-environment`,{safe:{},sensitive:{workspaceRoot:t,configPath:codexLinuxLocalEnvironmentConfigPath}}):codexLinuxEnvironmentSelection.source===`explicit-none`&&NX().info(`[worktree-create] explicit-no-environment`,{safe:{},sensitive:{workspaceRoot:t}});if(s?.(`info`,ce.Buffer.from(`Worktree created at ${g}\n`,`utf8`)),await vZ(g,codexLinuxLocalEnvironmentConfigPath??`__none__`,a,`worktree`,o)||(NX().warning(`[worktree-create] failed-to-store-environment-selection`,{safe:{},sensitive:{workspaceRoot:t,configPath:codexLinuxLocalEnvironmentConfigPath}}),s?.(`stderr`,ce.Buffer.from(`Failed to store selected environment in git config\n`,`utf8`))),(codexLinuxLocalEnvironmentConfigPath==null||codexLinuxLocalEnvironmentConfigPath===`__none__`))return s?.(`info`,ce.Buffer.from(`No local environment selected\n`,`utf8`)),{success:!0,worktreeGitRoot:h,worktreeWorkspaceRoot:g,setupResult:null};let v=await QJ(codexLinuxLocalEnvironmentConfigPath,a);';
const LINUX_WORKTREE_ENVIRONMENT_WORKER_CLEANUP_CALL_SNIPPET_CURRENT =
  'let o=await lX(e,a,void 0,r,n);';
const LINUX_WORKTREE_ENVIRONMENT_WORKER_CLEANUP_CALL_REPLACEMENT_CURRENT =
  'let o=await lX(e,a,void 0,r,{[WL]:e},n);';
const LINUX_WORKTREE_ENVIRONMENT_WORKER_CLEANUP_SKIP_SNIPPET_CURRENT =
  'if(i==null||i===`__none__`)return;';
const LINUX_WORKTREE_ENVIRONMENT_WORKER_CLEANUP_SKIP_REPLACEMENT_CURRENT =
  'if(i==null||i===`__none__`){NX().info(`[worktree-delete] cleanup-skipped-no-environment`,{safe:{worktreeId:t},sensitive:{configPath:i}});return;}';
const LINUX_TERMINAL_PATCH_MARKER = 'codexLinuxTerminalMounts';
const TERMINAL_COMPONENT_FILE_MARKER = 'data-codex-terminal';
const TERMINAL_SESSION_CREATE_PATTERN =
  /let (?<createdSessionVar>[A-Za-z_$][\w$]*)=(?<resumeSessionVar>[A-Za-z_$][\w$]*)\?\?(?<service>[A-Za-z_$][\w$]*)\.create\(\{conversationId:n,hostId:r\?\?null,cwd:i\?\?null\}\);(?<sessionRef>[A-Za-z_$][\w$]*)\.current=\k<createdSessionVar>,(?<attachStateRef>[A-Za-z_$][\w$]*)\.current=!1;/;
const TERMINAL_POST_INIT_MARKERS = ['p(),M.current=!1;', 'm(),A.current=!1;', 'g();let _='];
const TERMINAL_ATTACH_WITH_ATTACH_PATTERN =
  /(?<resumeSessionVar>[A-Za-z_$][\w$]*)&&requestAnimationFrame\(\(\)=>\{(?<guardVar>[A-Za-z_$][\w$]*)\|\|(?<service>[A-Za-z_$][\w$]*)\.attach\(\{sessionId:\k<resumeSessionVar>,conversationId:n,hostId:r\?\?null,cwd:i\?\?null,cols:(?<terminalVar>[A-Za-z_$][\w$]*)\.cols,rows:\k<terminalVar>\.rows\}\)\}\);/;
const TERMINAL_ATTACH_WITH_CREATE_PATTERN =
  /(?<resumeSessionVar>[A-Za-z_$][\w$]*)&&requestAnimationFrame\(\(\)=>\{(?<guardVar>[A-Za-z_$][\w$]*)\|\|(?<service>[A-Za-z_$][\w$]*)\.create\(\{sessionId:\k<resumeSessionVar>,conversationId:n,hostId:r\?\?null,cwd:i\?\?null,cols:(?<terminalVar>[A-Za-z_$][\w$]*)\.cols,rows:\k<terminalVar>\.rows\}\)\}\);/;
const TERMINAL_ON_ATTACH_WITH_DETAILS_PREFIX_PATTERN =
  /onAttach:\((?<eventVar>[A-Za-z_$][\w$]*),(?<detailsVar>[A-Za-z_$][\w$]*)\)=>\{(?<guardVar>[A-Za-z_$][\w$]*)\|\|\(/;
const TERMINAL_ON_ATTACH_NO_ARGS_PREFIX_PATTERN =
  /onAttach:\(\)=>\{(?<guardVar>[A-Za-z_$][\w$]*)\|\|\(/;
const TERMINAL_CLEANUP_PATTERN_LEGACY =
  /return (?<observerVar>[A-Za-z_$][\w$]*)\.observe\(e\),\(\)=>\{(?<guardVar>[A-Za-z_$][\w$]*)=!0,(?<frameVar>[A-Za-z_$][\w$]*)!=null&&\(cancelAnimationFrame\(\k<frameVar>\),\k<frameVar>=null\),\k<observerVar>\.disconnect\(\),(?<dataDisposeVar>[A-Za-z_$][\w$]*)\.dispose\(\),(?<keyDisposeVar>[A-Za-z_$][\w$]*)\.dispose\(\),(?<registerDisposeVar>[A-Za-z_$][\w$]*)\(\),(?<fitRef>[A-Za-z_$][\w$]*)\.current=null,(?<sessionRef>[A-Za-z_$][\w$]*)\.current=null,(?<attachStateRef>[A-Za-z_$][\w$]*)\.current=!1,(?<resumeSessionVar>[A-Za-z_$][\w$]*)\|\|(?<service>[A-Za-z_$][\w$]*)\.close\((?<createdSessionVar>[A-Za-z_$][\w$]*)\),(?<terminalVar>[A-Za-z_$][\w$]*)\.dispose\(\),(?<terminalRef>[A-Za-z_$][\w$]*)\.current=null\}/;
const TERMINAL_CLEANUP_PATTERN_26_415 =
  /return (?<observerVar>[A-Za-z_$][\w$]*)\.observe\(e\),\(\)=>\{(?<guardVar>[A-Za-z_$][\w$]*)=!0,(?<frameVar>[A-Za-z_$][\w$]*)!=null&&\(cancelAnimationFrame\(\k<frameVar>\),\k<frameVar>=null\),\k<observerVar>\.disconnect\(\),(?<dataDisposeVar>[A-Za-z_$][\w$]*)\.dispose\(\),(?<titleDisposeVar>[A-Za-z_$][\w$]*)\.dispose\(\),(?<keyDisposeVar>[A-Za-z_$][\w$]*)\.dispose\(\),(?<registerDisposeVar>[A-Za-z_$][\w$]*)\(\),(?<fitRef>[A-Za-z_$][\w$]*)\.current=null,(?<sessionRef>[A-Za-z_$][\w$]*)\.current=null,(?<attachStateRef>[A-Za-z_$][\w$]*)\.current=!1,(?<resumeSessionVar>[A-Za-z_$][\w$]*)\|\|(?<service>[A-Za-z_$][\w$]*)\.close\((?<createdSessionVar>[A-Za-z_$][\w$]*)\),(?<terminalVar>[A-Za-z_$][\w$]*)\.dispose\(\),(?<terminalRef>[A-Za-z_$][\w$]*)\.current=null\}/;
const INVALID_TERMINAL_HELPER_ESCAPE_PATTERN = '${"${"}';
const LINUX_NEW_THREAD_MODEL_PATCH_MARKER = 'codexLinuxPendingModelSettings';
const NEW_THREAD_MODEL_STATE_MARKERS = [
  'latestCollaborationMode?.settings?.model',
  'latestCollaborationMode?.settings?.reasoning_effort'
];
const NEW_THREAD_MODEL_CONFIG_MARKERS = [
  'copilot-default-model',
  'setDefaultModelConfig',
  'set-default-model-config-for-host'
];
const NEW_THREAD_MODEL_SUBMIT_MARKERS = [
  'fileAttachments:',
  'addedFiles:',
  'collaborationMode:',
  'config:'
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
const LINUX_TODO_PROGRESS_PATCH_MARKER = 'codexLinuxTodoProgress';
const LINUX_VISUAL_COMPAT_PATCH_MARKER = 'codexLinuxVisualCompat';
const LINUX_BROWSER_COMMENT_POSITION_PATCH_MARKER = 'codexLinuxBrowserCommentPosition';
const LINUX_BACKGROUND_SUBAGENTS_PANEL_PATCH_MARKER = 'codexLinuxBackgroundSubagentsPanel';
const LINUX_LATEST_AGENT_TURN_EXPANSION_PATCH_MARKER = 'codexLinuxLatestAgentTurnExpanded';
const LINUX_VISUAL_COMPAT_JS_TARGET_PATTERN =
  /if\((?<elementVar>[A-Za-z_$][\w$]*)\)\{if\((?<windowStateVar>[A-Za-z_$][\w$]*)\.opaqueWindows&&!(?<opaqueGuardFn>[A-Za-z_$][\w$]*)\(\)\)\{\k<elementVar>\.classList\.add\(`electron-opaque`\);return\}\k<elementVar>\.classList\.remove\(`electron-opaque`\)\}/;
const LINUX_VISUAL_COMPAT_CSS_CANDIDATE_MARKER_SETS = [
  ['[data-codex-window-type=electron]', '.window-fx-sidebar-surface', '.sidebar-resize-handle-line'],
  ['[data-codex-window-type=electron]', '.app-header-tint', 'electron-opaque']
];
const LINUX_VISUAL_COMPAT_JS_CANDIDATE_MARKERS = [
  '[data-codex-window-type="electron"]',
  'electron-opaque',
  'dataset.codexOs'
];
const LINUX_BROWSER_COMMENT_POSITION_CANDIDATE_MARKERS = [
  'browser-sidebar-comment-overlay-session',
  'overlayWindowBounds',
  'editorFrame.x'
];
const LINUX_BACKGROUND_SUBAGENTS_PANEL_CANDIDATE_MARKERS = [
  'composer.backgroundSubagents.summary',
  'isBackgroundSubagentsPanelVisible:Bn'
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
const LINUX_BACKGROUND_SUBAGENTS_PANEL_VISIBILITY_SNIPPET =
  'Bn=Ye.length>0&&!$e&&!zn&&!it&&!tt';
const LINUX_BACKGROUND_SUBAGENTS_PANEL_VISIBILITY_REPLACEMENT =
  `/* ${LINUX_BACKGROUND_SUBAGENTS_PANEL_PATCH_MARKER} */Bn=Ye.length>0&&!$e&&(typeof process<\`u\`&&process?.env?.CODEX_DESKTOP_DISABLE_LINUX_BACKGROUND_SUBAGENTS_PANEL_PATCH===\`1\`?zn:!1)&&!it&&!tt`;
const LINUX_LATEST_AGENT_TURN_EXPANSION_PATTERN =
  /persistedCollapsed:(?<persistedCollapsedVar>[A-Za-z_$][\w$]*)\}\),Le=Fe\?Xle\(Oe\):Oe/;
const COMPACT_SLASH_COMMAND_ID_MARKERS = ['id:`compact`', 'id:"compact"', "id:'compact'"];

async function patchMainProcessBundle(extractedAppDir, logger) {
  const buildDir = path.join(extractedAppDir, '.vite', 'build');
  const files = await fs.promises.readdir(buildDir);
  const mainFile = files.find((name) => /^main[-.].+\.js$/.test(name) || name === 'main.js');
  if (!mainFile) {
    throw new Error('Could not locate the Electron main bundle inside the extracted app.');
  }

  const mainPath = path.join(buildDir, mainFile);
  const original = await fs.promises.readFile(mainPath, 'utf8');
  logger.info(`Resolved upstream Electron main bundle ${mainFile}`);
  const result = applyLinuxOpenTargetsPatch(original, { sourceName: mainFile });
  if (result.updated !== original) {
    await fs.promises.writeFile(mainPath, result.updated, 'utf8');
    logger.info('Patched Linux open-in-targets support into the Electron main bundle');
  }
  return {
    status: result.status,
    sourceName: mainFile
  };
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

  const match = bundleSource.match(OPEN_TARGETS_BLOCK_PATTERN);
  if (!match?.groups?.targetList || !match.groups.targetVar) {
    throw new Error(buildOpenTargetsPatchErrorMessage(bundleSource, options.sourceName));
  }

  const replacement = buildLinuxOpenTargetsBlock(match.groups);
  return bundleSource.replace(OPEN_TARGETS_BLOCK_PATTERN, replacement);
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
  if (bundleSource.includes(LINUX_MENU_BAR_PATCH_MARKER)) {
    return bundleSource;
  }
  return replaceSnippetOrThrow(
    bundleSource,
    LINUX_MENU_BAR_AUTO_HIDE_SNIPPET_CURRENT,
    LINUX_MENU_BAR_AUTO_HIDE_REPLACEMENT_CURRENT,
    buildLinuxMenuBarPatchErrorMessage(bundleSource, options.sourceName)
  );
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
  return replaceSnippetOrThrow(
    bundleSource,
    LINUX_CLOSE_CANCEL_BEFORE_QUIT_SNIPPET_CURRENT,
    `/* ${LINUX_CLOSE_CANCEL_PATCH_MARKER} */${LINUX_CLOSE_CANCEL_BEFORE_QUIT_REPLACEMENT_CURRENT}`,
    buildLinuxCloseCancelPatchErrorMessage(bundleSource, options.sourceName)
  );
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
  let updated = replaceSnippetOrThrow(
    bundleSource,
    LINUX_WORKTREE_ENVIRONMENT_MAIN_HELPER_ANCHOR,
    LINUX_WORKTREE_ENVIRONMENT_MAIN_HELPER_REPLACEMENT,
    errorMessage
  );
  updated = replaceSnippetOrThrow(
    updated,
    LINUX_WORKTREE_ENVIRONMENT_PENDING_REQUEST_SNIPPET_CURRENT,
    LINUX_WORKTREE_ENVIRONMENT_PENDING_REQUEST_REPLACEMENT_CURRENT,
    errorMessage
  );
  updated = replaceSnippetOrThrow(
    updated,
    LINUX_WORKTREE_ENVIRONMENT_PENDING_READY_LOG_SNIPPET_CURRENT,
    LINUX_WORKTREE_ENVIRONMENT_PENDING_READY_LOG_REPLACEMENT_CURRENT,
    errorMessage
  );
  updated = replaceSnippetOrThrow(
    updated,
    LINUX_WORKTREE_ENVIRONMENT_MANAGED_REQUEST_SNIPPET_CURRENT,
    LINUX_WORKTREE_ENVIRONMENT_MANAGED_REQUEST_REPLACEMENT_CURRENT,
    errorMessage
  );
  return replaceSnippetOrThrow(
    updated,
    LINUX_WORKTREE_ENVIRONMENT_MANAGED_READY_LOG_SNIPPET_CURRENT,
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
  let updated = replaceSnippetOrThrow(
    bundleSource,
    LINUX_WORKTREE_ENVIRONMENT_WORKER_HELPER_ANCHOR,
    LINUX_WORKTREE_ENVIRONMENT_WORKER_HELPER_REPLACEMENT,
    errorMessage
  );
  updated = replaceSnippetOrThrow(
    updated,
    LINUX_WORKTREE_ENVIRONMENT_WORKER_CLEANUP_HELPER_SNIPPET_CURRENT,
    LINUX_WORKTREE_ENVIRONMENT_WORKER_CLEANUP_HELPER_REPLACEMENT_CURRENT,
    errorMessage
  );
  updated = replaceRegexOrThrow(
    updated,
    LINUX_WORKTREE_ENVIRONMENT_WORKER_CREATE_PATTERN,
    LINUX_WORKTREE_ENVIRONMENT_WORKER_CREATE_REPLACEMENT_CURRENT,
    errorMessage
  );
  updated = replaceSnippetOrThrow(
    updated,
    LINUX_WORKTREE_ENVIRONMENT_WORKER_CLEANUP_CALL_SNIPPET_CURRENT,
    LINUX_WORKTREE_ENVIRONMENT_WORKER_CLEANUP_CALL_REPLACEMENT_CURRENT,
    errorMessage
  );
  return replaceSnippetOrThrow(
    updated,
    LINUX_WORKTREE_ENVIRONMENT_WORKER_CLEANUP_SKIP_SNIPPET_CURRENT,
    LINUX_WORKTREE_ENVIRONMENT_WORKER_CLEANUP_SKIP_REPLACEMENT_CURRENT,
    errorMessage
  );
}

function buildLinuxOpenTargetsBlock({
  targetVar,
  targetList,
  loggerVar,
  loggerFactory,
  platformFn,
  platformTargetsVar,
  normalizedTargetsVar,
  normalizeFn,
  editorTargetIdsVar,
  stateVar1,
  stateVar2
}) {
  return `var codexLinuxBuiltins=typeof process.getBuiltinModule===\`function\`?{fs:process.getBuiltinModule(\`node:fs\`),os:process.getBuiltinModule(\`node:os\`),path:process.getBuiltinModule(\`node:path\`)}:{fs:null,os:null,path:null},codexLinuxDesktopExecCache=null;function codexLinuxPathEntries(){let e=codexLinuxBuiltins.path;if(!e)return[];let t=process.env.PATH??\`\`;return t.split(e.delimiter).map(e=>e.trim()).filter(e=>e.length>0)}function codexLinuxIsExecutable(e){let t=codexLinuxBuiltins.fs;if(!t)return!1;try{return t.accessSync(e,t.constants.X_OK),!0}catch{return!1}}function codexLinuxDetectCommand(e){let t=codexLinuxBuiltins.path;if(!t)return null;for(let n of codexLinuxPathEntries()){let r=t.join(n,e);if(codexLinuxIsExecutable(r))return r}return null}function codexLinuxStripDesktopExec(e){if(typeof e!==\`string\`)return null;let t=e.replace(/%[fFuUdDnNickvm]/g,\` \`).trim();if(t.length===0)return null;let n=t.match(/^"([^"]+)"/);if(n?.[1])return n[1];let[r]=t.split(/\\s+/);return r??null}function codexLinuxDesktopExecs(){let e=codexLinuxBuiltins.fs,t=codexLinuxBuiltins.os,n=codexLinuxBuiltins.path;if(codexLinuxDesktopExecCache||!e||!n)return codexLinuxDesktopExecCache??new Map;let r=t?.homedir?.()??process.env.HOME??\`~\`,i=process.env.XDG_DATA_HOME??n.join(r,\`.local\`,\`share\`),a=new Map,o=[n.join(i,\`applications\`),\`/usr/share/applications\`];for(let t of o){let r;try{r=e.readdirSync(t)}catch{continue}for(let i of r){if(!i.endsWith(\`.desktop\`))continue;let r=n.join(t,i),o;try{o=e.readFileSync(r,\`utf8\`)}catch{continue}let s=o.match(/^Exec=(.+)$/m),c=codexLinuxStripDesktopExec(s?.[1]??\`\`);if(!c)continue;let l=n.basename(c).toLowerCase().replace(/\\.(sh|bin|appimage)$/,\`\`);a.has(l)||a.set(l,c)}}return codexLinuxDesktopExecCache=a,a}function codexLinuxDetectDesktopExec(e){let t=codexLinuxBuiltins.fs,n=codexLinuxBuiltins.path,r=codexLinuxDesktopExecs().get(e.toLowerCase());return!r?null:n&&t&&n.isAbsolute(r)&&t.existsSync(r)?r:codexLinuxDetectCommand(r)}function codexLinuxDetectAny(e){for(let t of e){let n=codexLinuxDetectCommand(t)??codexLinuxDetectDesktopExec(t);if(n)return n}return null}function codexLinuxJetBrainsScript(e){let t=codexLinuxBuiltins.fs,n=codexLinuxBuiltins.os,r=codexLinuxBuiltins.path;if(!t||!r)return null;let i=n?.homedir?.()??process.env.HOME;if(!i)return null;let a=r.join(i,\`.local\`,\`share\`,\`JetBrains\`,\`Toolbox\`,\`scripts\`,e);return t.existsSync(a)?a:null}function codexLinuxDetectJetBrains(e){return codexLinuxDetectAny([e])??codexLinuxJetBrainsScript(e)}function codexLinuxVscodeArgs(e,t){return t?[\`--goto\`,\`${"${"}e}:${"${"}t.line}:${"${"}t.column}\`]:[\`--goto\`,e]}function codexLinuxZedArgs(e,t){return t?[\`${"${"}e}:${"${"}t.line}:${"${"}t.column}\`]:[e]}function codexLinuxJetBrainsArgs(e,t){return t?[\`--line\`,t.line.toString(),\`--column\`,t.column.toString(),e]:[e]}var codexLinuxTargets=[{id:\`vscode\`,platforms:{linux:{label:\`VS Code\`,icon:\`apps/vscode.png\`,kind:\`editor\`,detect:()=>codexLinuxDetectAny([\`code\`,\`code-url-handler\`]),args:codexLinuxVscodeArgs}}},{id:\`vscodeInsiders\`,platforms:{linux:{label:\`VS Code Insiders\`,icon:\`apps/vscode-insiders.png\`,kind:\`editor\`,detect:()=>codexLinuxDetectAny([\`code-insiders\`]),args:codexLinuxVscodeArgs}}},{id:\`cursor\`,platforms:{linux:{label:\`Cursor\`,icon:\`apps/cursor.png\`,kind:\`editor\`,detect:()=>codexLinuxDetectAny([\`cursor\`]),args:codexLinuxVscodeArgs}}},{id:\`windsurf\`,platforms:{linux:{label:\`Windsurf\`,icon:\`apps/windsurf.png\`,kind:\`editor\`,detect:()=>codexLinuxDetectAny([\`windsurf\`]),args:codexLinuxVscodeArgs}}},{id:\`zed\`,platforms:{linux:{label:\`Zed\`,icon:\`apps/zed.png\`,kind:\`editor\`,detect:()=>codexLinuxDetectAny([\`zed\`]),args:codexLinuxZedArgs}}},{id:\`androidStudio\`,platforms:{linux:{label:\`Android Studio\`,icon:\`apps/android-studio.png\`,kind:\`editor\`,detect:()=>codexLinuxDetectJetBrains(\`studio\`),args:codexLinuxJetBrainsArgs}}},{id:\`intellij\`,platforms:{linux:{label:\`IntelliJ IDEA\`,icon:\`apps/intellij.png\`,kind:\`editor\`,detect:()=>codexLinuxDetectJetBrains(\`idea\`),args:codexLinuxJetBrainsArgs}}},{id:\`rider\`,platforms:{linux:{label:\`Rider\`,icon:\`apps/rider.png\`,kind:\`editor\`,detect:()=>codexLinuxDetectJetBrains(\`rider\`),args:codexLinuxJetBrainsArgs}}},{id:\`goland\`,platforms:{linux:{label:\`GoLand\`,icon:\`apps/goland.png\`,kind:\`editor\`,detect:()=>codexLinuxDetectJetBrains(\`goland\`),args:codexLinuxJetBrainsArgs}}},{id:\`rustrover\`,platforms:{linux:{label:\`RustRover\`,icon:\`apps/rustrover.png\`,kind:\`editor\`,detect:()=>codexLinuxDetectJetBrains(\`rustrover\`),args:codexLinuxJetBrainsArgs}}},{id:\`pycharm\`,platforms:{linux:{label:\`PyCharm\`,icon:\`apps/pycharm.png\`,kind:\`editor\`,detect:()=>codexLinuxDetectJetBrains(\`pycharm\`),args:codexLinuxJetBrainsArgs}}},{id:\`webstorm\`,platforms:{linux:{label:\`WebStorm\`,icon:\`apps/webstorm.svg\`,kind:\`editor\`,detect:()=>codexLinuxDetectJetBrains(\`webstorm\`),args:codexLinuxJetBrainsArgs}}},{id:\`phpstorm\`,platforms:{linux:{label:\`PhpStorm\`,icon:\`apps/phpstorm.png\`,kind:\`editor\`,detect:()=>codexLinuxDetectJetBrains(\`phpstorm\`),args:codexLinuxJetBrainsArgs}}}];var ${targetVar}=[${targetList}],codexLinuxExistingTargetIds=new Set(${targetVar}.filter(e=>e.platforms.linux).map(e=>e.id));process.platform===\`linux\`&&${targetVar}.push(...codexLinuxTargets.filter(e=>!codexLinuxExistingTargetIds.has(e.id))),${loggerVar}=e.${loggerFactory}(\`open-in-targets\`);function ${platformFn}(e){return ${targetVar}.flatMap(t=>{let n=t.platforms[e];return n?[{id:t.id,...n}]:[]})}var ${platformTargetsVar}=${platformFn}(process.platform),${normalizedTargetsVar}=${normalizeFn}(${platformTargetsVar}),${editorTargetIdsVar}=new Set(${platformTargetsVar}.filter(e=>e.kind===\`editor\`).map(e=>e.id)),${stateVar1}=null,${stateVar2}=null;`;
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
    ({ createdSessionVar, resumeSessionVar, service, sessionRef, attachStateRef }) =>
      `${buildLinuxTerminalLifecycleHelpers()}let ${createdSessionVar}=${resumeSessionVar}??${service}.create({conversationId:n,hostId:r??null,cwd:i??null}),codexLinuxTerminalMountKey=\`${'${r??`local`}'}:${'${' + createdSessionVar + '}'}\`;codexLinuxResetTerminalMount(codexLinuxTerminalMountKey);codexLinuxTraceTerminalCreate(codexLinuxTerminalMountKey);${sessionRef}.current=${createdSessionVar},${attachStateRef}.current=!1;`,
    errorMessage
  );
  updated = replaceFirstMatchingSnippetOrThrow(
    updated,
    [
      {
        target: TERMINAL_POST_INIT_MARKERS[0],
        replacement: `${TERMINAL_POST_INIT_MARKERS[0]}let codexLinuxAttachFrame=null,codexLinuxDisposeCurrentMount=()=>{};`
      },
      {
        target: TERMINAL_POST_INIT_MARKERS[1],
        replacement: `${TERMINAL_POST_INIT_MARKERS[1]}let codexLinuxAttachFrame=null,codexLinuxDisposeCurrentMount=()=>{};`
      },
      {
        target: TERMINAL_POST_INIT_MARKERS[2],
        replacement:
          'g();let codexLinuxAttachFrame=null,codexLinuxDisposeCurrentMount=()=>{},_='
      }
    ],
    errorMessage
  );
  updated = replaceFirstMatchingRegexOrThrow(
    updated,
    [
      {
        pattern: TERMINAL_ATTACH_WITH_ATTACH_PATTERN,
        replacement: ({ resumeSessionVar, guardVar, service, terminalVar }) =>
          `${resumeSessionVar}&&(codexLinuxTraceTerminalAttachScheduled(codexLinuxTerminalMountKey),codexLinuxAttachFrame=requestAnimationFrame(()=>{codexLinuxAttachFrame=null,${guardVar}||(codexLinuxTraceTerminalAttachStarted(codexLinuxTerminalMountKey),${service}.attach({sessionId:${resumeSessionVar},conversationId:n,hostId:r??null,cwd:i??null,cols:${terminalVar}.cols,rows:${terminalVar}.rows}))}));`
      },
      {
        pattern: TERMINAL_ATTACH_WITH_CREATE_PATTERN,
        replacement: ({ resumeSessionVar, guardVar, service, terminalVar }) =>
          `${resumeSessionVar}&&(codexLinuxTraceTerminalAttachScheduled(codexLinuxTerminalMountKey),codexLinuxAttachFrame=requestAnimationFrame(()=>{codexLinuxAttachFrame=null,${guardVar}||(codexLinuxTraceTerminalAttachStarted(codexLinuxTerminalMountKey),${service}.create({sessionId:${resumeSessionVar},conversationId:n,hostId:r??null,cwd:i??null,cols:${terminalVar}.cols,rows:${terminalVar}.rows}))}));`
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
      }
    ],
    errorMessage
  );
  assertValidLinuxTerminalLifecyclePatchOutput(updated, options.sourceName);
  return updated;
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
  terminalVar,
  terminalRef
}) {
  return `return codexLinuxDisposeCurrentMount=(codexLinuxPreserveSession=!1)=>{if(${guardVar})return;${guardVar}=!0,${frameVar}!=null&&(cancelAnimationFrame(${frameVar}),${frameVar}=null),codexLinuxAttachFrame!=null&&(cancelAnimationFrame(codexLinuxAttachFrame),codexLinuxAttachFrame=null),${observerVar}.disconnect(),${dataDisposeVar}.dispose(),${titleDisposeVar ? `${titleDisposeVar}.dispose(),` : ''}${keyDisposeVar}.dispose(),${registerDisposeVar}(),${fitRef}.current=null,${sessionRef}.current=null,${attachStateRef}.current=!1,codexLinuxPreserveSession||${resumeSessionVar}||${service}.close(${createdSessionVar}),${terminalVar}.dispose(),${terminalRef}.current=null,codexLinuxTraceTerminalCleanup(codexLinuxTerminalMountKey),codexLinuxReleaseTerminalMount(codexLinuxTerminalMountKey,codexLinuxDisposeCurrentMount)},codexLinuxSetTerminalMount(codexLinuxTerminalMountKey,codexLinuxDisposeCurrentMount),${observerVar}.observe(e),codexLinuxDisposeCurrentMount`;
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
  let sawCandidate = false;
  let firstAnchorError = null;
  let firstAnchorErrorSourceName = null;

  for (const assetName of jsAssets) {
    const assetPath = path.join(assetsDir, assetName);
    const original = await fs.promises.readFile(assetPath, 'utf8');
    const stateCandidate = isNewThreadModelStateCandidateBundle(original);
    const submitCandidate = isNewThreadModelSubmitCandidateBundle(original);
    if (!stateCandidate && !submitCandidate) {
      continue;
    }

    sawCandidate = true;
    bundleRecords.push({
      assetName,
      assetPath,
      stateCandidate,
      submitCandidate
    });
    originalBundleSourcesByAsset.set(assetName, original);
    workingBundleSourcesByAsset.set(assetName, original);
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
    `Skipping Linux new-thread model patch because renderer candidates were incompatible with the expected fresh-thread anchors.${firstAnchorErrorSourceName ? ` Source: ${firstAnchorErrorSourceName}.` : ''}`
  );
  return {
    status: 'skipped',
    reason: 'anchor-mismatch',
    sourceName: firstAnchorErrorSourceName,
    details: firstAnchorError?.message ?? null
  };
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
  updated = patchTodoPortalRenderCache({
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
  if (bundleSource.includes(LINUX_VISUAL_COMPAT_PATCH_MARKER)) {
    return bundleSource;
  }

  return replaceRegexOrThrow(
    bundleSource,
    LINUX_VISUAL_COMPAT_JS_TARGET_PATTERN,
    ({ elementVar, windowStateVar, opaqueGuardFn }) =>
      `if(${elementVar}){/* codexLinuxVisualCompat */let t=document.documentElement.dataset.codexOs===\`linux\`,n=!1;try{n=process?.env?.CODEX_DESKTOP_DISABLE_LINUX_VISUAL_COMPAT===\`1\`}catch{}let r=t&&!n;${elementVar}.classList.toggle(\`codex-linux-visual-compat\`,r);if((${windowStateVar}.opaqueWindows||r)&&!${opaqueGuardFn}()){${elementVar}.classList.add(\`electron-opaque\`);return}${elementVar}.classList.remove(\`electron-opaque\`)}`,
    buildLinuxVisualCompatJsPatchErrorMessage(bundleSource, options.sourceName)
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
[data-codex-window-type=electron][data-codex-os=linux].codex-linux-visual-compat .app-header-tint{
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
[data-codex-window-type=electron][data-codex-os=linux].codex-linux-visual-compat .no-underline\\!{
  text-decoration:underline!important;
  text-underline-offset:2px
}
[data-codex-window-type=electron][data-codex-os=linux].codex-linux-visual-compat [data-browser-comment-editor-surface]{
  max-height:clamp(44px,18vh,88px)!important
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

function analyzeLinuxVisualCompatCssBundle(bundleSource) {
  const detected = {
    electronWindowTypeSelector: bundleSource.includes('[data-codex-window-type=electron]'),
    sidebarSurfaceClass: ['.window-fx-sidebar-surface', '.app-header-tint'].some((marker) =>
      bundleSource.includes(marker)
    ),
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
    opaqueEffectBlock: LINUX_VISUAL_COMPAT_JS_TARGET_PATTERN.test(bundleSource)
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
    commandAction: bundleSource.includes('compactThread('),
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

  return replaceSnippetOrThrow(
    bundleSource,
    LINUX_BACKGROUND_SUBAGENTS_PANEL_VISIBILITY_SNIPPET,
    LINUX_BACKGROUND_SUBAGENTS_PANEL_VISIBILITY_REPLACEMENT,
    buildLinuxBackgroundSubagentsPanelPatchErrorMessage(bundleSource, options.sourceName)
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
      `persistedCollapsed:/* ${LINUX_LATEST_AGENT_TURN_EXPANSION_PATCH_MARKER} */S?(${persistedCollapsedVar}??!1):${persistedCollapsedVar}}),Le=Fe?Xle(Oe):Oe`,
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

function analyzeLinuxBackgroundSubagentsPanelBundle(bundleSource) {
  const detected = {
    panelSummary: bundleSource.includes('composer.backgroundSubagents.summary'),
    panelPlaceholderState: bundleSource.includes('isBackgroundSubagentsPanelVisible:Bn'),
    panelVisibilityGate: bundleSource.includes(LINUX_BACKGROUND_SUBAGENTS_PANEL_VISIBILITY_SNIPPET)
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
  const detected = {
    worktreeServiceClass: bundleSource.includes('worktree-service'),
    pendingCreateRequest: bundleSource.includes(
      LINUX_WORKTREE_ENVIRONMENT_PENDING_REQUEST_SNIPPET_CURRENT
    ),
    pendingReadyLog: bundleSource.includes(
      LINUX_WORKTREE_ENVIRONMENT_PENDING_READY_LOG_SNIPPET_CURRENT
    ),
    managedCreateRequest: bundleSource.includes(
      LINUX_WORKTREE_ENVIRONMENT_MANAGED_REQUEST_SNIPPET_CURRENT
    ),
    managedReadyLog: bundleSource.includes(
      LINUX_WORKTREE_ENVIRONMENT_MANAGED_READY_LOG_SNIPPET_CURRENT
    )
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
    createWorktreeFunction: bundleSource.includes(
      'async function NZ({gitManager:e,workspaceRoot:t,startingState:n,localEnvironmentConfigPath:r'
    ),
    cleanupHelper: bundleSource.includes(
      'async function lX(e,t,n,r,i){return(await uX({workspaceRoot:e,localEnvironment:t,scriptType:`cleanup`,appServerClient:i,onLog:n,signal:r}))?.setupResult??null}'
    ),
    storedEnvironmentSelection: bundleSource.includes('await vZ(g,r??`__none__`,a,`worktree`,o)'),
    setupSkipBranch: bundleSource.includes('No local environment selected'),
    cleanupCall: bundleSource.includes('let o=await lX(e,a,void 0,r,n);'),
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
    typeof replacement === 'function' ? replacement(match.groups) : replacement
  );
}

function replaceFirstMatchingRegexOrThrow(source, variants, errorMessage) {
  for (const { pattern, replacement } of variants) {
    const match = source.match(pattern);
    if (!match?.groups) {
      continue;
    }
    return source.replace(pattern, () =>
      typeof replacement === 'function' ? replacement(match.groups) : replacement
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
  const detected = {
    openInTargets: bundleSource.includes('`open-in-targets`'),
    targetRegistryDeclaration: /var [A-Za-z_$][\w$]*=\[[A-Za-z0-9_$,]+\],[A-Za-z_$][\w$]*=e\.[A-Za-z_$][\w$]*\(`open-in-targets`\)/.test(
      bundleSource
    ),
    platformFlatten: /function [A-Za-z_$][\w$]*\(e\)\{return [A-Za-z_$][\w$]*\.flatMap\(t=>\{let n=t\.platforms\[e\];return n\?\[\{id:t\.id,\.\.\.n\}\]:\[\]\}\)\}/.test(
      bundleSource
    ),
    editorTargetIdSet: /new Set\([A-Za-z_$][\w$]*\.filter\(e=>e\.kind===`editor`\)\.map\(e=>e\.id\)\)/.test(
      bundleSource
    )
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

function buildLinuxCloseCancelPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    'Could not patch Linux close-cancel behavior in the Electron main bundle.',
    sourceName,
    analyzeLinuxCloseCancelBundle(bundleSource)
  );
}

function analyzeLinuxMenuBarBundle(bundleSource) {
  const detected = {
    browserWindowConstructor: /new [A-Za-z_$][\w$]*\.BrowserWindow\(\{/.test(bundleSource),
    autoHideMenuBarOption: bundleSource.includes('autoHideMenuBar:!0'),
    win32AutoHideMenuBarTernary: bundleSource.includes(LINUX_MENU_BAR_AUTO_HIDE_SNIPPET_CURRENT)
  };

  return {
    detected,
    missingAnchors: [
      !detected.browserWindowConstructor && 'BrowserWindow constructor',
      !detected.autoHideMenuBarOption && 'autoHideMenuBar option',
      !detected.win32AutoHideMenuBarTernary && 'win32-only autoHideMenuBar ternary'
    ].filter(Boolean)
  };
}

function analyzeLinuxCloseCancelBundle(bundleSource) {
  const detected = {
    beforeQuitHandler: bundleSource.includes('t.app.on(`before-quit`'),
    quitCancelPrompt: bundleSource.includes('buttons:[`Quit`,`Cancel`]'),
    cancelPreventDefault: /[A-Za-z_$][\w$]*\.preventDefault\(\);return/.test(bundleSource),
    showLastActivePrimaryWindow: bundleSource.includes('showLastActivePrimaryWindow()'),
    ensureHostWindowDependency: bundleSource.includes('ensureHostWindow:')
  };

  return {
    detected,
    missingAnchors: [
      !detected.beforeQuitHandler && 'before-quit handler',
      !detected.quitCancelPrompt && 'Quit/Cancel confirmation dialog',
      !detected.cancelPreventDefault && 'cancel preventDefault branch',
      !detected.showLastActivePrimaryWindow && 'showLastActivePrimaryWindow hook',
      !detected.ensureHostWindowDependency && 'ensureHostWindow dependency'
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
    postInit: TERMINAL_POST_INIT_MARKERS.some((marker) => bundleSource.includes(marker)),
    attach:
      TERMINAL_ATTACH_WITH_ATTACH_PATTERN.test(bundleSource) ||
      TERMINAL_ATTACH_WITH_CREATE_PATTERN.test(bundleSource),
    onAttach:
      TERMINAL_ON_ATTACH_WITH_DETAILS_PREFIX_PATTERN.test(bundleSource) ||
      TERMINAL_ON_ATTACH_NO_ARGS_PREFIX_PATTERN.test(bundleSource),
    cleanup:
      TERMINAL_CLEANUP_PATTERN_LEGACY.test(bundleSource) ||
      TERMINAL_CLEANUP_PATTERN_26_415.test(bundleSource)
  };

  return {
    detected,
    missingAnchors: [
      !detected.terminalComponent && 'data-codex-terminal marker',
      !detected.initLogHandler && 'terminal onInitLog handler',
      !detected.sessionCreate && 'terminal session creation',
      !detected.postInit && 'terminal post-init state reset',
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
    selectorHook: ['function xf(e){', 'function vm(e=null){', 'function $9(e){'].some((marker) =>
      bundleSource.includes(marker)
    ),
    selectorStateBlock: [
      NEW_THREAD_MODEL_STATE_SNIPPET_CURRENT,
      NEW_THREAD_MODEL_STATE_SNIPPET_26_406,
      NEW_THREAD_MODEL_STATE_SNIPPET_26_415
    ].some((snippet) => bundleSource.includes(snippet)) ||
      NEW_THREAD_MODEL_STATE_PATTERN_26_415.test(bundleSource),
    selectorValueBranch: [
      NEW_THREAD_MODEL_SETTINGS_SNIPPET_CURRENT,
      NEW_THREAD_MODEL_SETTINGS_SNIPPET_26_415,
      NEW_THREAD_MODEL_STATE_SNIPPET_26_406
    ].some((snippet) => bundleSource.includes(snippet)),
    selectorSetter: [
      NEW_THREAD_MODEL_SETTER_SNIPPET_CURRENT,
      NEW_THREAD_MODEL_SETTER_SNIPPET_26_406,
      NEW_THREAD_MODEL_SETTER_SNIPPET_26_415
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
      'async function OB({context:e,prompt:t,workspaceRoots:n,cwd:r,hostId:i,agentMode:a,serviceTier:o,collaborationMode:s,memoryPreferences:c,workspaceKind:l=`project`,projectlessOutputDirectory:u}){'
    ].some((snippet) => bundleSource.includes(snippet)),
    collaborationModeSubmit: [
      NEW_THREAD_MODEL_SUBMIT_SNIPPET_CURRENT,
      NEW_THREAD_MODEL_SUBMIT_SNIPPET_26_406,
      NEW_THREAD_MODEL_SUBMIT_SNIPPET_26_415
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

function isNewThreadModelStateCandidateBundle(bundleSource) {
  const analysis = analyzeNewThreadModelStateBundle(bundleSource);
  return (
    NEW_THREAD_MODEL_CONFIG_MARKERS.some((marker) => bundleSource.includes(marker)) &&
    (analysis.detected.selectorStateBlock || analysis.detected.selectorSetter)
  );
}

function isNewThreadModelSubmitCandidateBundle(bundleSource) {
  return (
    NEW_THREAD_MODEL_SUBMIT_MARKERS.every((marker) => bundleSource.includes(marker)) &&
    analyzeNewThreadModelSubmitBundle(bundleSource).detected.collaborationModeSubmit
  );
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
  const compactComponentPattern = escapeRegExp(compactComponentName);
  const compactDirectRenderPattern = new RegExp(
    `\\.type===\\\`todo-list\\\`\\?(?:\\(?(?:[A-Za-z_$][\\w$]*=)?)?\\(0,\\$\\.jsx\\)\\(${compactComponentPattern},\\{item:[A-Za-z_$][\\w$]*\\}\\)`
  );
  const anchorMarker = `(0,$.jsx)(${compactComponentName},{item:`;
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
  const pattern = new RegExp(
    `t\\[(?<depIdx>\\d+)\\]===(?<itemVar>[A-Za-z_$][\\w$]*)\\?(?<outVar>[A-Za-z_$][\\w$]*)=t\\[(?<cacheIdx>\\d+)\\]:\\(\\k<outVar>=\\(0,\\$\\.jsx\\)\\(${compactComponentPattern},\\{item:\\k<itemVar>\\}\\),t\\[\\k<depIdx>\\]=\\k<itemVar>,t\\[\\k<cacheIdx>\\]=\\k<outVar>\\),(?<resultVar>[A-Za-z_$][\\w$]*)=\\k<outVar>`
  );
  const match = block.match(pattern);
  if (!match?.groups) {
    if (compactDirectRenderPattern.test(block)) {
      return source;
    }
    throw new Error(errorMessage);
  }
  const { depIdx, itemVar, outVar, cacheIdx, resultVar } = match.groups;
  const todoItemKey = buildTodoItemCacheKeyExpression(itemVar, {
    includeMarker: includeMarker()
  });
  const updated = block.replace(
    pattern,
    `t[${depIdx}]===${todoItemKey}?${outVar}=t[${cacheIdx}]:(${outVar}=(0,$.jsx)(${compactComponentName},{item:${itemVar}}),t[${depIdx}]=${todoItemKey},t[${cacheIdx}]=${outVar}),${resultVar}=${outVar}`
  );
  return `${before}${updated}${after}`;
}

function patchTodoPortalRenderCache({
  source,
  errorMessage,
  includeMarker,
  expandedComponentName
}) {
  const patchBlock = (block) => {
    if (!block.includes(`(0,$.jsx)(${expandedComponentName},{item:`)) {
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

  if (source.includes('function lBe(') && source.includes('var uBe=')) {
    return replaceFunctionBlockOrThrow(source, 'function lBe(', 'var uBe=', patchBlock, errorMessage);
  }

  return replaceFunctionBlockContainingAnchorOrThrow(
    source,
    'todoListItem:',
    patchBlock,
    errorMessage
  );
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
    ? new RegExp(`\\(0,\\$\\.jsx\\)\\(${escapeRegExp(componentNames.compact)},\\{item:[A-Za-z_$][\\w$]*\\}\\)`)
    : null;
  const portalRenderCachePattern = componentNames.expanded
    ? new RegExp(`\\(0,\\$\\.jsx\\)\\(${escapeRegExp(componentNames.expanded)},\\{item:[A-Za-z_$][\\w$]*\\}\\)`)
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
  runtimeSourceDir,
  packagedAsarPath,
  upstreamResourcesDir,
  unpackedSourceRoot,
  rgPath,
  nativeModules,
  runtimeLogDir,
  diagnosticManifestPath,
  patchSummary,
  logger
}) {
  await removeIfExists(channelAppDir);
  await removeIfExists(channelBinDir);
  await removeIfExists(channelIconDir);
  await ensureDir(channelStateDir);

  await copyDir(runtimeSourceDir, channelAppDir);
  const packagedBinaryPath = path.join(channelAppDir, channel.executableName);
  await copyFile(path.join(channelAppDir, 'electron'), packagedBinaryPath);
  await fs.promises.chmod(packagedBinaryPath, 0o755);
  const resourcesDir = path.join(channelAppDir, 'resources');
  await ensureDir(resourcesDir);

  await copyUpstreamResources({
    upstreamResourcesDir,
    resourcesDir
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
  return iconPath;
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
ozone_hint="\${CODEX_DESKTOP_OZONE_PLATFORM_HINT:-}"
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

async function resolveRuntimeSourceDir({ cacheHome, electronVersion, logger }) {
  const localRuntimeDir = path.join(PROJECT_ROOT, 'node_modules', 'electron', 'dist');
  const localPackageJsonPath = path.join(PROJECT_ROOT, 'node_modules', 'electron', 'package.json');
  if (await fileExists(localPackageJsonPath)) {
    const localPackage = await parseJsonFile(localPackageJsonPath);
    if (localPackage.version === electronVersion && (await fileExists(localRuntimeDir))) {
      logger.info(`Using local Electron runtime ${electronVersion}`);
      return {
        runtimeSourceDir: localRuntimeDir,
        sourceKind: 'local'
      };
    }
  }

  const runtimeRoot = path.join(cacheHome, 'electron-runtime', electronVersion);
  const runtimePackageJsonPath = path.join(runtimeRoot, 'package.json');
  const runtimeSourceDir = path.join(runtimeRoot, 'node_modules', 'electron', 'dist');
  await ensureDir(runtimeRoot);
  if (!(await fileExists(runtimePackageJsonPath))) {
    await fs.promises.writeFile(runtimePackageJsonPath, JSON.stringify({ private: true }, null, 2), 'utf8');
  }

  if (!(await fileExists(runtimeSourceDir))) {
    await retryForever(`install-electron-runtime-${electronVersion}`, logger, async () => {
      await runCommand(
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

  if (!(await fileExists(runtimeSourceDir))) {
    throw new Error(`Electron runtime ${electronVersion} could not be installed for Linux.`);
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

  return workspaceRoot;
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

async function copyUpstreamResources({ upstreamResourcesDir, resourcesDir }) {
  const entries = await fs.promises.readdir(upstreamResourcesDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'app.asar' || entry.name === 'app.asar.unpacked') {
      continue;
    }
    if (entry.name === 'codex' || entry.name === 'rg') {
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
    patches
  };
}

async function writeInstallDiagnosticManifest({ manifestPath, manifest }) {
  await ensureDir(path.dirname(manifestPath));
  await fs.promises.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}
