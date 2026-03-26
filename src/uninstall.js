import path from 'node:path';
import { CHANNELS, getPaths } from './constants.js';
import { fileExists, removeIfExists } from './utils.js';

export function parseUninstallArgs(argv) {
  const options = {
    help: false
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

export function renderUninstallHelp() {
  return [
    'Usage:',
    '  uninstall-desktop'
  ].join('\n');
}

export async function uninstallDesktop(logger) {
  const paths = getPaths();
  const desktopFiles = Object.values(CHANNELS).map((channel) =>
    path.join(paths.desktopApplications, channel.desktopFileName)
  );
  const targets = [
    ...desktopFiles,
    paths.dataHome,
    paths.stateHome,
    paths.cacheHome
  ];

  for (const target of targets) {
    if (await fileExists(target)) {
      logger.info(`Removing ${target}`);
      await removeIfExists(target);
      continue;
    }
    logger.info(`Skipping missing target ${target}`);
  }
}
