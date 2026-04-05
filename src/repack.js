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

export function parseArgs(argv) {
  const options = {
    beta: false,
    version: null,
    help: false,
    skipOpenTargetsPatch: false,
    skipTerminalPatch: false,
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
  const terminalPatch = options.skipTerminalPatch
    ? buildSkippedPatchResult('cli-option-disabled')
    : await patchRendererTerminalBundle(extractedAppDir, logger);
  const newThreadModelPatch = await patchRendererNewThreadModelBundle(extractedAppDir, logger);
  const linuxVisualCompatPatch = await patchRendererLinuxVisualCompat(extractedAppDir, logger);
  if (options.skipOpenTargetsPatch) {
    logger.warn('Skipping Linux open-in-targets patch because --skip-open-targets-patch was set');
  }
  if (options.skipTerminalPatch) {
    logger.warn('Skipping Linux terminal lifecycle patch because --skip-terminal-patch was set');
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
    terminalLifecycle: terminalPatch,
    newThreadModel: newThreadModelPatch,
    linuxVisualCompat: linuxVisualCompatPatch
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
      terminalLifecycle: terminalPatch,
      newThreadModel: newThreadModelPatch,
      linuxVisualCompat: linuxVisualCompatPatch
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
const OPEN_TARGETS_BLOCK_PATTERN =
  /var (?<targetVar>[A-Za-z_$][\w$]*)=\[(?<targetList>[A-Za-z0-9_$,]+)\],(?<loggerVar>[A-Za-z_$][\w$]*)=e\.(?<loggerFactory>[A-Za-z_$][\w$]*)\(`open-in-targets`\);function (?<platformFn>[A-Za-z_$][\w$]*)\(e\)\{return \k<targetVar>\.flatMap\(t=>\{let n=t\.platforms\[e\];return n\?\[\{id:t\.id,\.\.\.n\}\]:\[\]\}\)\}var (?<platformTargetsVar>[A-Za-z_$][\w$]*)=\k<platformFn>\(process\.platform\),(?<normalizedTargetsVar>[A-Za-z_$][\w$]*)=(?<normalizeFn>[A-Za-z_$][\w$]*)\(\k<platformTargetsVar>\),(?<editorTargetIdsVar>[A-Za-z_$][\w$]*)=new Set\(\k<platformTargetsVar>\.filter\(e=>e\.kind===`editor`\)\.map\(e=>e\.id\)\),(?<stateVar1>[A-Za-z_$][\w$]*)=null,(?<stateVar2>[A-Za-z_$][\w$]*)=null;/;
const LINUX_TERMINAL_PATCH_MARKER = 'codexLinuxTerminalMounts';
const TERMINAL_COMPONENT_FILE_MARKER = 'data-codex-terminal';
const TERMINAL_SESSION_CREATE_PATTERN =
  /let t=o\?\?(?<service>[A-Za-z_$][\w$]*)\.create\(\{conversationId:n,hostId:r\?\?null,cwd:i\?\?null\}\);O\.current=t,k\.current=!1;/;
const TERMINAL_POST_INIT_SNIPPET = 'p(),M.current=!1;';
const TERMINAL_ATTACH_PATTERN =
  /o&&requestAnimationFrame\(\(\)=>\{a\|\|(?<service>[A-Za-z_$][\w$]*)\.attach\(\{sessionId:o,conversationId:n,hostId:r\?\?null,cwd:i\?\?null,cols:s\.cols,rows:s\.rows\}\)\}\);/;
const TERMINAL_ON_ATTACH_PREFIX_PATTERN =
  /onAttach:\((?<eventVar>[A-Za-z_$][\w$]*),(?<detailsVar>[A-Za-z_$][\w$]*)\)=>\{a\|\|\(/;
const TERMINAL_CLEANUP_PATTERN =
  /return v\.observe\(e\),\(\)=>\{a=!0,c!=null&&\(cancelAnimationFrame\(c\),c=null\),v\.disconnect\(\),g\.dispose\(\),_\.dispose\(\),h\(\),D\.current=null,O\.current=null,k\.current=!1,o\|\|(?<service>[A-Za-z_$][\w$]*)\.close\(t\),s\.dispose\(\),E\.current=null\}/;
const INVALID_TERMINAL_HELPER_ESCAPE_PATTERN = '${"${"}';
const LINUX_NEW_THREAD_MODEL_PATCH_MARKER = 'codexLinuxPendingModelSettings';
const NEW_THREAD_MODEL_CANDIDATE_MARKERS = ['function xf(e){', 'setDefaultModelConfig', 'collaborationMode:w,config:o'];
const NEW_THREAD_MODEL_STATE_SNIPPET_CURRENT = 'let m=p,h=Dn(n,Sf),g=r===`copilot`,_;';
const NEW_THREAD_MODEL_STATE_REPLACEMENT_CURRENT =
  'let m=p,h=Dn(n,Sf),g=r===`copilot`,codexLinuxIsFreshComposer=n==null,[codexLinuxPendingModelSettings,codexLinuxSetPendingModelSettings]=(0,Z.useState)(null),_;let codexLinuxFreshComposerBaseSettings=g?u:l;(0,Z.useEffect)(()=>{if(!codexLinuxIsFreshComposer){codexLinuxPendingModelSettings!=null&&codexLinuxSetPendingModelSettings(null);return}if(codexLinuxPendingModelSettings==null)return;if(codexLinuxPendingModelSettings.cwd!==s){codexLinuxSetPendingModelSettings(null);return}!codexLinuxFreshComposerBaseSettings.isLoading&&codexLinuxFreshComposerBaseSettings.model===codexLinuxPendingModelSettings.model&&codexLinuxFreshComposerBaseSettings.reasoningEffort===codexLinuxPendingModelSettings.reasoningEffort&&codexLinuxSetPendingModelSettings(null)},[codexLinuxIsFreshComposer,codexLinuxPendingModelSettings,s,codexLinuxFreshComposerBaseSettings.model,codexLinuxFreshComposerBaseSettings.reasoningEffort,codexLinuxFreshComposerBaseSettings.isLoading]);';
const NEW_THREAD_MODEL_SETTINGS_SNIPPET_CURRENT =
  '?(y=d?{model:m??l.model,reasoningEffort:h,isLoading:!1}:g?u:l,';
const NEW_THREAD_MODEL_SETTINGS_REPLACEMENT_CURRENT =
  '?(y=d?{model:m??l.model,reasoningEffort:h,isLoading:!1}:codexLinuxIsFreshComposer&&codexLinuxPendingModelSettings!=null?{model:codexLinuxPendingModelSettings.model,reasoningEffort:codexLinuxPendingModelSettings.reasoningEffort,isLoading:!1}:g?u:l,';
const NEW_THREAD_MODEL_SETTER_SNIPPET_CURRENT =
  '?(D=async(e,t)=>{if(await v(e,t),g){C(e);return}try{await i.setDefaultModelConfig(e,t)}catch(e){let t=e;O.error(`Failed to set default model and reasoning effort`,{safe:{},sensitive:{error:t}});return}await E()},';
const NEW_THREAD_MODEL_SETTER_REPLACEMENT_CURRENT =
  '?(D=async(e,t)=>{codexLinuxIsFreshComposer&&codexLinuxSetPendingModelSettings({model:e,reasoningEffort:t,cwd:s});if(await v(e,t),g){C(e);return}try{await i.setDefaultModelConfig(e,t)}catch(e){let t=e;codexLinuxIsFreshComposer&&codexLinuxSetPendingModelSettings(null);O.error(`Failed to set default model and reasoning effort`,{safe:{},sensitive:{error:t}});return}await E()},';
const NEW_THREAD_MODEL_SUBMIT_SNIPPET_CURRENT =
  'return{input:a,workspaceRoots:r,cwd:i,fileAttachments:t.fileAttachments,addedFiles:t.addedFiles,agentMode:j,model:null,serviceTier:A.serviceTier,reasoningEffort:null,collaborationMode:w,config:o}';
const NEW_THREAD_MODEL_SUBMIT_REPLACEMENT_CURRENT =
  'let s=w==null?null:{...w,settings:{...w.settings,model:w.settings?.model??o.model??null,reasoning_effort:w.settings?.reasoning_effort??o.model_reasoning_effort??null}};return{input:a,workspaceRoots:r,cwd:i,fileAttachments:t.fileAttachments,addedFiles:t.addedFiles,agentMode:j,model:null,serviceTier:A.serviceTier,reasoningEffort:null,collaborationMode:s,config:o}';
const LINUX_VISUAL_COMPAT_PATCH_MARKER = 'codexLinuxVisualCompat';
const LINUX_VISUAL_COMPAT_JS_TARGET_SNIPPET_CURRENT =
  'if(e){if(T.opaqueWindows&&!XZ()){e.classList.add(`electron-opaque`);return}e.classList.remove(`electron-opaque`)}';
const LINUX_VISUAL_COMPAT_JS_REPLACEMENT_CURRENT =
  'if(e){/* codexLinuxVisualCompat */let t=document.documentElement.dataset.codexOs===`linux`,n=!1;try{n=process?.env?.CODEX_DESKTOP_DISABLE_LINUX_VISUAL_COMPAT===`1`}catch{}let r=t&&!n;e.classList.toggle(`codex-linux-visual-compat`,r);if((T.opaqueWindows||r)&&!XZ()){e.classList.add(`electron-opaque`);return}e.classList.remove(`electron-opaque`)}';
const LINUX_VISUAL_COMPAT_CSS_CANDIDATE_MARKERS = [
  '[data-codex-window-type=electron]',
  '.window-fx-sidebar-surface',
  '.sidebar-resize-handle-line'
];
const LINUX_VISUAL_COMPAT_JS_CANDIDATE_MARKERS = [
  '[data-codex-window-type="electron"]',
  'electron-opaque',
  'dataset.codexOs'
];

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
    const isCandidate = original.includes(TERMINAL_COMPONENT_FILE_MARKER);

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

  let updated = bundleSource;
  updated = replaceRegexOrThrow(
    updated,
    TERMINAL_SESSION_CREATE_PATTERN,
    ({ service }) =>
      `${buildLinuxTerminalLifecycleHelpers()}let t=o??${service}.create({conversationId:n,hostId:r??null,cwd:i??null}),codexLinuxTerminalMountKey=\`${'${r??`local`}'}:${'${t}'}\`;codexLinuxResetTerminalMount(codexLinuxTerminalMountKey);codexLinuxTraceTerminalCreate(codexLinuxTerminalMountKey);O.current=t,k.current=!1;`,
    buildTerminalPatchErrorMessage(bundleSource, options.sourceName)
  );
  updated = replaceSnippetOrThrow(
    updated,
    TERMINAL_POST_INIT_SNIPPET,
    'p(),M.current=!1;let codexLinuxAttachFrame=null,codexLinuxDisposeCurrentMount=()=>{};',
    buildTerminalPatchErrorMessage(bundleSource, options.sourceName)
  );
  updated = replaceRegexOrThrow(
    updated,
    TERMINAL_ATTACH_PATTERN,
    ({ service }) =>
      `o&&(codexLinuxTraceTerminalAttachScheduled(codexLinuxTerminalMountKey),codexLinuxAttachFrame=requestAnimationFrame(()=>{codexLinuxAttachFrame=null,a||(codexLinuxTraceTerminalAttachStarted(codexLinuxTerminalMountKey),${service}.attach({sessionId:o,conversationId:n,hostId:r??null,cwd:i??null,cols:s.cols,rows:s.rows}))}));`,
    buildTerminalPatchErrorMessage(bundleSource, options.sourceName)
  );
  updated = replaceRegexOrThrow(
    updated,
    TERMINAL_ON_ATTACH_PREFIX_PATTERN,
    ({ eventVar, detailsVar }) =>
      `onAttach:(${eventVar},${detailsVar})=>{a||(codexLinuxTraceTerminalAttached(codexLinuxTerminalMountKey),`,
    buildTerminalPatchErrorMessage(bundleSource, options.sourceName)
  );
  updated = replaceRegexOrThrow(
    updated,
    TERMINAL_CLEANUP_PATTERN,
    ({ service }) =>
      `return codexLinuxDisposeCurrentMount=(codexLinuxPreserveSession=!1)=>{if(a)return;a=!0,c!=null&&(cancelAnimationFrame(c),c=null),codexLinuxAttachFrame!=null&&(cancelAnimationFrame(codexLinuxAttachFrame),codexLinuxAttachFrame=null),v.disconnect(),g.dispose(),_.dispose(),h(),D.current=null,O.current=null,k.current=!1,codexLinuxPreserveSession||o||${service}.close(t),s.dispose(),E.current=null,codexLinuxTraceTerminalCleanup(codexLinuxTerminalMountKey),codexLinuxReleaseTerminalMount(codexLinuxTerminalMountKey,codexLinuxDisposeCurrentMount)},codexLinuxSetTerminalMount(codexLinuxTerminalMountKey,codexLinuxDisposeCurrentMount),v.observe(e),codexLinuxDisposeCurrentMount`,
    buildTerminalPatchErrorMessage(bundleSource, options.sourceName)
  );
  assertValidLinuxTerminalLifecyclePatchOutput(updated, options.sourceName);
  return updated;
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

async function patchRendererNewThreadModelBundle(extractedAppDir, logger) {
  const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
  const assetNames = await fs.promises.readdir(assetsDir);
  const jsAssets = assetNames.filter((name) => name.endsWith('.js'));
  let sawCandidate = false;
  let lastError = null;

  for (const assetName of jsAssets) {
    const assetPath = path.join(assetsDir, assetName);
    const original = await fs.promises.readFile(assetPath, 'utf8');
    const isCandidate = NEW_THREAD_MODEL_CANDIDATE_MARKERS.every((marker) => original.includes(marker));

    if (!isCandidate) {
      continue;
    }

    sawCandidate = true;
    logger.info(`Resolved renderer new-thread model bundle ${assetName}`);

    try {
      const result = applyLinuxNewThreadModelPatch(original, { sourceName: assetName });
      if (result.updated !== original) {
        await fs.promises.writeFile(assetPath, result.updated, 'utf8');
        logger.info(`Patched fresh-thread model selection into renderer bundle ${assetName}`);
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
    throw new Error('Could not locate the renderer new-thread model bundle inside the extracted app.');
  }

  throw lastError ?? new Error('Could not patch the renderer new-thread model bundle for Linux.');
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

  const errorMessage = buildNewThreadModelPatchErrorMessage(bundleSource, options.sourceName);
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
  updated = replaceSnippetOrThrow(
    updated,
    NEW_THREAD_MODEL_SUBMIT_SNIPPET_CURRENT,
    NEW_THREAD_MODEL_SUBMIT_REPLACEMENT_CURRENT,
    errorMessage
  );
  return updated;
}

async function patchRendererLinuxVisualCompat(extractedAppDir, logger) {
  const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
  const assetNames = await fs.promises.readdir(assetsDir);
  const cssAssets = assetNames.filter((name) => name.endsWith('.css'));
  const jsAssets = assetNames.filter((name) => name.endsWith('.js'));
  let cssResult = null;
  let jsResult = null;
  let cssSourceName = null;
  let jsSourceName = null;
  let cssError = null;
  let jsError = null;

  for (const assetName of cssAssets) {
    const assetPath = path.join(assetsDir, assetName);
    const original = await fs.promises.readFile(assetPath, 'utf8');
    const isCandidate = LINUX_VISUAL_COMPAT_CSS_CANDIDATE_MARKERS.every((marker) =>
      original.includes(marker)
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
      cssError = error;
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
      jsError = error;
    }
  }

  if (!cssResult) {
    throw cssError ?? new Error('Could not locate the renderer Linux visual-compat stylesheet.');
  }
  if (!jsResult) {
    throw jsError ?? new Error('Could not locate the renderer Linux visual-compat script.');
  }

  return {
    status:
      cssResult.status === 'already-applied' && jsResult.status === 'already-applied'
        ? 'already-applied'
        : 'applied',
    sourceName: `${cssSourceName},${jsSourceName}`
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
        'Could not patch the renderer Linux visual-compat stylesheet.',
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

  return replaceSnippetOrThrow(
    bundleSource,
    LINUX_VISUAL_COMPAT_JS_TARGET_SNIPPET_CURRENT,
    LINUX_VISUAL_COMPAT_JS_REPLACEMENT_CURRENT,
    buildLinuxVisualCompatJsPatchErrorMessage(bundleSource, options.sourceName)
  );
}

function buildLinuxVisualCompatCssOverride() {
  return `/* ${LINUX_VISUAL_COMPAT_PATCH_MARKER} */
[data-codex-window-type=electron][data-codex-os=linux].codex-linux-visual-compat{
  background-color:var(--color-background-surface-under)!important;
  background-image:none!important
}
[data-codex-window-type=electron][data-codex-os=linux].codex-linux-visual-compat body{
  background:var(--color-background-surface-under)!important;
  background-image:none!important;
  --color-background-elevated-primary:var(--color-background-elevated-primary-opaque)
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
`;
}

function buildLinuxVisualCompatJsPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    'Could not patch the renderer Linux visual-compat script.',
    sourceName,
    analyzeLinuxVisualCompatJsBundle(bundleSource)
  );
}

function analyzeLinuxVisualCompatCssBundle(bundleSource) {
  const detected = {
    electronWindowTypeSelector: bundleSource.includes('[data-codex-window-type=electron]'),
    sidebarSurfaceClass: bundleSource.includes('.window-fx-sidebar-surface'),
    sidebarResizeHandleClass: bundleSource.includes('.sidebar-resize-handle-line')
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
    opaqueEffectBlock: bundleSource.includes(LINUX_VISUAL_COMPAT_JS_TARGET_SNIPPET_CURRENT)
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

function replaceSnippetOrThrow(source, target, replacement, errorMessage) {
  if (!source.includes(target)) {
    throw new Error(errorMessage);
  }
  return source.replace(target, replacement);
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

function buildTerminalPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    'Could not patch the renderer terminal lifecycle bundle for Linux.',
    sourceName,
    analyzeTerminalBundle(bundleSource)
  );
}

function buildNewThreadModelPatchErrorMessage(bundleSource, sourceName) {
  return buildPatchErrorMessage(
    'Could not patch the renderer new-thread model bundle for Linux.',
    sourceName,
    analyzeNewThreadModelBundle(bundleSource)
  );
}

function analyzeTerminalBundle(bundleSource) {
  const detected = {
    terminalComponent: bundleSource.includes(TERMINAL_COMPONENT_FILE_MARKER),
    initLogHandler: bundleSource.includes('onInitLog'),
    sessionCreate: TERMINAL_SESSION_CREATE_PATTERN.test(bundleSource),
    postInit: bundleSource.includes(TERMINAL_POST_INIT_SNIPPET),
    attach: TERMINAL_ATTACH_PATTERN.test(bundleSource),
    onAttach: TERMINAL_ON_ATTACH_PREFIX_PATTERN.test(bundleSource),
    cleanup: TERMINAL_CLEANUP_PATTERN.test(bundleSource)
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

function analyzeNewThreadModelBundle(bundleSource) {
  const detected = {
    selectorHook: bundleSource.includes('function xf(e){'),
    selectorStateBlock: bundleSource.includes(NEW_THREAD_MODEL_STATE_SNIPPET_CURRENT),
    selectorValueBranch: bundleSource.includes(NEW_THREAD_MODEL_SETTINGS_SNIPPET_CURRENT),
    selectorSetter: bundleSource.includes(NEW_THREAD_MODEL_SETTER_SNIPPET_CURRENT),
    freshThreadSubmit: bundleSource.includes(
      'async function N({appServerManager:e=x,context:t,prompt:n,workspaceRoots:r,cwd:i}){'
    ),
    collaborationModeSubmit: bundleSource.includes(NEW_THREAD_MODEL_SUBMIT_SNIPPET_CURRENT)
  };

  return {
    detected,
    missingAnchors: [
      !detected.selectorHook && 'model selector hook',
      !detected.selectorStateBlock && 'fresh-thread selector state block',
      !detected.selectorValueBranch && 'fresh-thread selector value branch',
      !detected.selectorSetter && 'fresh-thread selector setter',
      !detected.freshThreadSubmit && 'fresh-thread submit builder',
      !detected.collaborationModeSubmit && 'fresh-thread collaborationMode payload'
    ].filter(Boolean)
  };
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

async function resolveCodexCliPath() {
  const candidatePaths = [];

  if (process.env.CODEX_CLI_PATH) {
    candidatePaths.push(process.env.CODEX_CLI_PATH);
  }

  candidatePaths.push(path.join(PROJECT_ROOT, 'node_modules', '.bin', 'codex'));

  try {
    const { stdout } = await runCommand('which', ['codex']);
    const resolved = stdout.trim();
    if (resolved) {
      candidatePaths.push(resolved);
    }
  } catch {
    // Ignore PATH lookup failures so we can emit a clearer message below.
  }

  for (const candidatePath of candidatePaths) {
    if (candidatePath && (await fileExists(candidatePath))) {
      return candidatePath;
    }
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

  try {
    const { stdout } = await runCommand('which', ['rg']);
    const resolved = stdout.trim();
    if (resolved) {
      candidatePaths.push(resolved);
    }
  } catch {
    // Ignore PATH lookup failures so we can emit a clearer message below.
  }

  for (const candidatePath of candidatePaths) {
    if (candidatePath && (await fileExists(candidatePath))) {
      return candidatePath;
    }
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
