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
import { parseAppcastXml, resolveRelease } from './appcast.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function parseArgs(argv) {
  const options = {
    beta: false,
    version: null,
    help: false
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
    '  install-desktop --beta --version <version>'
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

  const releases = await fetchFeed(channel.feedUrl);
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

  await ensureDir(downloadDir);
  await ensureDir(channelLogDir);

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
  await patchBootstrap(extractedAppDir);
  await patchMainProcessBundle(extractedAppDir, logger);
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

  const runtimeSourceDir = await resolveRuntimeSourceDir({
    cacheHome: paths.cacheHome,
    electronVersion,
    logger
  });

  const iconPath = await installChannelRuntime({
    channel,
    channelAppDir,
    channelBinDir,
    channelIconDir,
    channelStateDir,
    runtimeSourceDir,
    packagedAsarPath,
    upstreamResourcesDir,
    unpackedSourceRoot: extractedAppDir,
    rgPath,
    nativeModules,
    logger
  });

  await writeDesktopEntry({
    channel,
    iconPath,
    desktopApplicationsDir: paths.desktopApplications,
    executablePath: path.join(channelBinDir, channel.executableName),
    installRoot
  });

  logger.info(`Install complete for ${channel.productName} ${release.version}`);
  logger.info(`Desktop file: ${path.join(paths.desktopApplications, channel.desktopFileName)}`);
  logger.info(`Launcher: ${path.join(channelBinDir, channel.executableName)}`);
  logger.info(`Install root: ${installRoot}`);
}

async function fetchFeed(feedUrl) {
  const response = await fetch(feedUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${feedUrl}: HTTP ${response.status}`);
  }
  const xml = await response.text();
  return parseAppcastXml(xml);
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
    return;
  }
  const updated = original.replace(
    /await\s+([A-Za-z_$][\w$]*)\.initialize\(\);/,
    'if(process.platform===`darwin`){await $1.initialize();}'
  );
  if (updated === original) {
    throw new Error('Could not patch bootstrap updater initialization for Linux.');
  }
  await fs.promises.writeFile(bootstrapPath, updated, 'utf8');
}

const LINUX_OPEN_TARGETS_PATCH_MARKER = 'codexLinuxTargets';
const OPEN_TARGETS_BLOCK_PATTERN =
  /var ua=\[(?<targetList>[A-Za-z0-9_$,]+)\],da=e\.sn\(`open-in-targets`\);function fa\(e\)\{return ua\.flatMap\(t=>\{let n=t\.platforms\[e\];return n\?\[\{id:t\.id,\.\.\.n\}\]:\[\]\}\)\}var pa=fa\(process\.platform\),ma=Ca\(pa\),ha=new Set\(pa\.filter\(e=>e\.kind===`editor`\)\.map\(e=>e\.id\)\),ga=null,_a=null;/;

async function patchMainProcessBundle(extractedAppDir, logger) {
  const buildDir = path.join(extractedAppDir, '.vite', 'build');
  const files = await fs.promises.readdir(buildDir);
  const mainFile = files.find((name) => /^main[-.].+\.js$/.test(name) || name === 'main.js');
  if (!mainFile) {
    throw new Error('Could not locate the Electron main bundle inside the extracted app.');
  }

  const mainPath = path.join(buildDir, mainFile);
  const original = await fs.promises.readFile(mainPath, 'utf8');
  const updated = injectLinuxOpenTargetsPatch(original);
  if (updated !== original) {
    await fs.promises.writeFile(mainPath, updated, 'utf8');
    logger.info('Patched Linux open-in-targets support into the Electron main bundle');
  }
}

export function injectLinuxOpenTargetsPatch(bundleSource) {
  if (bundleSource.includes(LINUX_OPEN_TARGETS_PATCH_MARKER)) {
    return bundleSource;
  }

  const match = bundleSource.match(OPEN_TARGETS_BLOCK_PATTERN);
  if (!match?.groups?.targetList) {
    throw new Error('Could not patch the upstream open-in-targets registry for Linux.');
  }

  const replacement = buildLinuxOpenTargetsBlock(match.groups.targetList);
  return bundleSource.replace(OPEN_TARGETS_BLOCK_PATTERN, replacement);
}

function buildLinuxOpenTargetsBlock(targetList) {
  return `var codexLinuxDesktopExecCache=null;function codexLinuxDetectCommand(e){let t=z(e);return t?H(t):null}function codexLinuxStripDesktopExec(e){if(typeof e!==\`string\`)return null;let t=e.replace(/%[fFuUdDnNickvm]/g,\` \`).trim();if(t.length===0)return null;let n=t.match(/^"([^"]+)"/);if(n?.[1])return n[1];let[r]=t.split(/\\s+/);return r??null}function codexLinuxDesktopExecs(){if(codexLinuxDesktopExecCache)return codexLinuxDesktopExecCache;let e=new Map,t=[(0,r.join)((0,n.homedir)(),\`.local\`,\`share\`,\`applications\`),\`/usr/share/applications\`];for(let n of t){let t;try{t=(0,a.readdirSync)(n)}catch{continue}for(let i of t){if(!i.endsWith(\`.desktop\`))continue;let t=(0,r.join)(n,i),o;try{o=(0,a.readFileSync)(t,\`utf8\`)}catch{continue}let s=o.match(/^Exec=(.+)$/m),c=codexLinuxStripDesktopExec(s?.[1]??\`\`);if(!c)continue;let l=(0,r.basename(c)).toLowerCase().replace(/\\.(sh|bin|appimage)$/,\`\`);e.has(l)||e.set(l,c)}}return codexLinuxDesktopExecCache=e,e}function codexLinuxDetectDesktopExec(e){let t=codexLinuxDesktopExecs().get(e.toLowerCase());if(!t)return null;if((0,r.isAbsolute)(t)&&(0,a.existsSync)(t))return t;let n=z(t);return n?H(n):null}function codexLinuxDetectAny(e){for(let t of e){let n=codexLinuxDetectCommand(t)??codexLinuxDetectDesktopExec(t);if(n)return n}return null}function codexLinuxJetBrainsScript(e){let t=(0,r.join)((0,n.homedir)(),\`.local\`,\`share\`,\`JetBrains\`,\`Toolbox\`,\`scripts\`,e);return(0,a.existsSync)(t)?t:null}function codexLinuxDetectJetBrains(e){return codexLinuxDetectAny([e])??codexLinuxJetBrainsScript(e)}var codexLinuxTargets=[Tr({id:\`vscode\`,label:\`VS Code\`,icon:\`apps/vscode.png\`,kind:\`editor\`,linux:{detect:()=>codexLinuxDetectAny([\`code\`,\`code-url-handler\`]),args:hr}}),Tr({id:\`vscodeInsiders\`,label:\`VS Code Insiders\`,icon:\`apps/vscode-insiders.png\`,kind:\`editor\`,linux:{detect:()=>codexLinuxDetectAny([\`code-insiders\`]),args:hr}}),Tr({id:\`cursor\`,label:\`Cursor\`,icon:\`apps/cursor.png\`,kind:\`editor\`,linux:{detect:()=>codexLinuxDetectAny([\`cursor\`]),args:hr}}),Tr({id:\`windsurf\`,label:\`Windsurf\`,icon:\`apps/windsurf.png\`,kind:\`editor\`,linux:{detect:()=>codexLinuxDetectAny([\`windsurf\`]),args:hr}}),Tr({id:\`zed\`,label:\`Zed\`,icon:\`apps/zed.png\`,kind:\`editor\`,linux:{detect:()=>codexLinuxDetectAny([\`zed\`]),args:Cr}}),Tr({id:\`androidStudio\`,label:\`Android Studio\`,icon:\`apps/android-studio.png\`,kind:\`editor\`,linux:{detect:()=>codexLinuxDetectJetBrains(\`studio\`),args:Mi}}),Tr({id:\`intellij\`,label:\`IntelliJ IDEA\`,icon:\`apps/intellij.png\`,kind:\`editor\`,linux:{detect:()=>codexLinuxDetectJetBrains(\`idea\`),args:Mi}}),Tr({id:\`rider\`,label:\`Rider\`,icon:\`apps/rider.png\`,kind:\`editor\`,linux:{detect:()=>codexLinuxDetectJetBrains(\`rider\`),args:Mi}}),Tr({id:\`goland\`,label:\`GoLand\`,icon:\`apps/goland.png\`,kind:\`editor\`,linux:{detect:()=>codexLinuxDetectJetBrains(\`goland\`),args:Mi}}),Tr({id:\`rustrover\`,label:\`RustRover\`,icon:\`apps/rustrover.png\`,kind:\`editor\`,linux:{detect:()=>codexLinuxDetectJetBrains(\`rustrover\`),args:Mi}}),Tr({id:\`pycharm\`,label:\`PyCharm\`,icon:\`apps/pycharm.png\`,kind:\`editor\`,linux:{detect:()=>codexLinuxDetectJetBrains(\`pycharm\`),args:Mi}}),Tr({id:\`webstorm\`,label:\`WebStorm\`,icon:\`apps/webstorm.svg\`,kind:\`editor\`,linux:{detect:()=>codexLinuxDetectJetBrains(\`webstorm\`),args:Mi}}),Tr({id:\`phpstorm\`,label:\`PhpStorm\`,icon:\`apps/phpstorm.png\`,kind:\`editor\`,linux:{detect:()=>codexLinuxDetectJetBrains(\`phpstorm\`),args:Mi}})];var ua=[${targetList}],codexLinuxExistingTargetIds=new Set(ua.filter(e=>e.platforms.linux).map(e=>e.id));process.platform===\`linux\`&&ua.push(...codexLinuxTargets.filter(e=>!codexLinuxExistingTargetIds.has(e.id))),da=e.sn(\`open-in-targets\`);function fa(e){return ua.flatMap(t=>{let n=t.platforms[e];return n?[{id:t.id,...n}]:[]})}var pa=fa(process.platform),ma=Ca(pa),ha=new Set(pa.filter(e=>e.kind===\`editor\`).map(e=>e.id)),ga=null,_a=null;`;
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
    userDataDir: path.join(channelStateDir, 'user-data')
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

function buildWrapperScript({ channel, electronBinary, bundledCodexCliPath, userDataDir }) {
  const classArg = channel.wmClass;
  return `#!/usr/bin/env bash
set -euo pipefail
mkdir -p "${userDataDir}"
export CODEX_CLI_PATH="\${CODEX_CLI_PATH:-${bundledCodexCliPath}}"
chrome_sandbox="$(dirname "${electronBinary}")/chrome-sandbox"
sandbox_args=()

if [[ "\${CODEX_DESKTOP_FORCE_NO_SANDBOX:-0}" == "1" ]]; then
  sandbox_args=(--no-sandbox --disable-setuid-sandbox)
elif [[ "\${CODEX_DESKTOP_FORCE_SANDBOX:-0}" == "1" ]]; then
  sandbox_args=()
elif [[ ! -u "$chrome_sandbox" ]]; then
  sandbox_args=(--no-sandbox --disable-setuid-sandbox)
elif [[ "$(stat -c '%u' "$chrome_sandbox")" != "0" ]]; then
  sandbox_args=(--no-sandbox --disable-setuid-sandbox)
fi

exec "${electronBinary}" "\${sandbox_args[@]}" --class="${classArg}" --user-data-dir="${userDataDir}" "$@"
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
      return localRuntimeDir;
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

  return runtimeSourceDir;
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
