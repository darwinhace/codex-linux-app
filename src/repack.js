import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPackage, extractAll } from 'asar';
import { rebuild } from '@electron/rebuild';
import {
  CHANNELS,
  ELECTRON_VERSION,
  NATIVE_MODULES,
  NODE_ABI,
  SUPPORTED_ARCH,
  SUPPORTED_PLATFORM,
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
  logger.info(`Using Codex CLI at ${codexCliPath}`);

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
  logger.info(
    `Upstream packaged app: ${appPackage.productName} ${appPackage.version} (flavor=${appPackage.codexBuildFlavor})`
  );

  patchPackageJson(appPackage, channel);
  await fs.promises.writeFile(appPackagePath, JSON.stringify(appPackage, null, 2), 'utf8');
  await patchBootstrap(extractedAppDir);
  await replaceNativeModules(extractedAppDir, logger);

  const packagedAsarDir = path.join(workDir, 'packaged');
  const packagedAsarPath = path.join(packagedAsarDir, 'app.asar');
  await ensureDir(packagedAsarDir);

  await retryForever(`pack-asar-${channel.id}-${release.version}`, logger, async () => {
    await removeIfExists(packagedAsarPath);
    await createPackage(extractedAppDir, packagedAsarPath);
  });

  const runtimeSourceDir = path.join(PROJECT_ROOT, 'node_modules', 'electron', 'dist');
  if (!(await fileExists(runtimeSourceDir))) {
    throw new Error('Electron runtime was not found. Run npm install in this repo first.');
  }

  const iconPath = await installChannelRuntime({
    channel,
    channelAppDir,
    channelBinDir,
    channelIconDir,
    channelStateDir,
    runtimeSourceDir,
    packagedAsarPath,
    unpackedSourceRoot: extractedAppDir,
    codexCliPath,
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

async function patchBootstrap(extractedAppDir) {
  const bootstrapDir = path.join(extractedAppDir, '.vite', 'build');
  const files = await fs.promises.readdir(bootstrapDir);
  const bootstrapFile = files.find((name) => /^bootstrap\..+\.js$/.test(name) || name === 'bootstrap.js');
  if (!bootstrapFile) {
    throw new Error('Could not locate bootstrap.js inside the extracted app bundle.');
  }
  const bootstrapPath = path.join(bootstrapDir, bootstrapFile);
  const original = await fs.promises.readFile(bootstrapPath, 'utf8');
  const search = 'await a.initialize();';
  if (!original.includes(search)) {
    throw new Error('Could not patch bootstrap updater initialization.');
  }
  const updated = original.replace(
    search,
    'if(process.platform===`darwin`){await a.initialize();}'
  );
  await fs.promises.writeFile(bootstrapPath, updated, 'utf8');
}

async function replaceNativeModules(extractedAppDir, logger) {
  await retryForever('rebuild-native-modules', logger, async () => {
    await rebuild({
      buildPath: PROJECT_ROOT,
      electronVersion: ELECTRON_VERSION,
      arch: process.arch,
      force: true,
      onlyModules: NATIVE_MODULES
    });
  });

  const extractedNodeModules = path.join(extractedAppDir, 'node_modules');
  await ensureDir(extractedNodeModules);

  for (const moduleName of NATIVE_MODULES) {
    const source = path.join(PROJECT_ROOT, 'node_modules', moduleName);
    const destination = path.join(extractedNodeModules, moduleName);
    if (await fileExists(source)) {
      await removeIfExists(destination);
      await copyDir(source, destination);
      logger.info(`Replaced native module ${moduleName} with rebuilt Linux copy`);
    }
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
  unpackedSourceRoot,
  codexCliPath,
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

  await copyFile(packagedAsarPath, path.join(resourcesDir, 'app.asar'));
  await installUnpackedRuntime({
    unpackedSourceRoot,
    destinationRoot: path.join(resourcesDir, 'app.asar.unpacked')
  });

  const iconPath = await installIcons({
    channel,
    channelIconDir,
    unpackedSourceRoot
  });

  const executablePath = path.join(channelBinDir, channel.executableName);
  const wrapper = buildWrapperScript({
    channel,
    electronBinary: packagedBinaryPath,
    codexCliPath,
    userDataDir: path.join(channelStateDir, 'user-data')
  });
  await writeExecutable(executablePath, wrapper);
  logger.info(`Installed wrapper ${executablePath}`);
  return iconPath;
}

async function installUnpackedRuntime({ unpackedSourceRoot, destinationRoot }) {
  await ensureDir(destinationRoot);
  const copyPairs = [
    {
      source: path.join(
        unpackedSourceRoot,
        'node_modules',
        'better-sqlite3',
        'build',
        'Release'
      ),
      destination: path.join(
        destinationRoot,
        'node_modules',
        'better-sqlite3',
        'build',
        'Release'
      )
    },
    {
      source: path.join(unpackedSourceRoot, 'node_modules', 'node-pty', 'build', 'Release'),
      destination: path.join(
        destinationRoot,
        'node_modules',
        'node-pty',
        'build',
        'Release'
      )
    },
    {
      source: path.join(
        unpackedSourceRoot,
        'node_modules',
        'node-pty',
        'bin',
        `${SUPPORTED_PLATFORM}-${SUPPORTED_ARCH}-${NODE_ABI}`
      ),
      destination: path.join(
        destinationRoot,
        'node_modules',
        'node-pty',
        'bin',
        `${SUPPORTED_PLATFORM}-${SUPPORTED_ARCH}-${NODE_ABI}`
      )
    },
    {
      source: path.join(unpackedSourceRoot, 'node_modules', 'bufferutil'),
      destination: path.join(destinationRoot, 'node_modules', 'bufferutil')
    },
    {
      source: path.join(unpackedSourceRoot, 'node_modules', 'utf-8-validate'),
      destination: path.join(destinationRoot, 'node_modules', 'utf-8-validate')
    }
  ];

  for (const pair of copyPairs) {
    if (await fileExists(pair.source)) {
      await ensureDir(path.dirname(pair.destination));
      await copyDir(pair.source, pair.destination);
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

function buildWrapperScript({ channel, electronBinary, codexCliPath, userDataDir }) {
  const classArg = channel.wmClass;
  return `#!/usr/bin/env bash
set -euo pipefail
mkdir -p "${userDataDir}"
export CODEX_CLI_PATH="${codexCliPath}"
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
