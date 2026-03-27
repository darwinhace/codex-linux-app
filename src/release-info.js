import path from 'node:path';
import { extractFile } from 'asar';
import { CHANNELS, getPaths } from './constants.js';
import { fetchAppcastReleases } from './appcast.js';

const CHANNEL_LABELS = {
  stable: 'prod',
  beta: 'beta'
};

function getInstalledAsarPath(paths, channelId) {
  return path.join(paths.dataHome, 'channels', channelId, 'app', 'resources', 'app.asar');
}

export async function readInstalledRelease(channelId, options = {}) {
  const { paths = getPaths(), extractFileImpl = extractFile } = options;
  const asarPath = getInstalledAsarPath(paths, channelId);

  try {
    const packageJson = JSON.parse(extractFileImpl(asarPath, 'package.json').toString());
    return {
      channelId,
      label: CHANNEL_LABELS[channelId] ?? channelId,
      version: packageJson.version ?? null,
      buildNumber: packageJson.codexBuildNumber ?? null,
      flavor: packageJson.codexBuildFlavor ?? null
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    if (error instanceof Error && /Cannot read .*app\.asar/i.test(error.message)) {
      return null;
    }
    throw error;
  }
}

export async function fetchChannelAppcast(channelId, options = {}) {
  const channel = CHANNELS[channelId];
  if (!channel) {
    throw new Error(`Unknown channel: ${channelId}`);
  }

  const releases = await fetchAppcastReleases(channel.feedUrl, options);
  return {
    channelId,
    label: CHANNEL_LABELS[channelId] ?? channelId,
    releases
  };
}

export async function collectReleaseInfo(options = {}) {
  const installedChannels = ['stable', 'beta'];
  const appcastChannels = ['stable', 'beta'];

  const current = await Promise.all(
    installedChannels.map(async (channelId) => ({
      channelId,
      label: CHANNEL_LABELS[channelId] ?? channelId,
      release: await readInstalledRelease(channelId, options)
    }))
  );

  const appcasts = await Promise.all(
    appcastChannels.map(async (channelId) => {
      try {
        const info = await fetchChannelAppcast(channelId, options);
        return {
          channelId,
          label: info.label,
          releases: info.releases.slice(0, 3),
          error: null
        };
      } catch (error) {
        return {
          channelId,
          label: CHANNEL_LABELS[channelId] ?? channelId,
          releases: [],
          error: error instanceof Error ? error.message : String(error)
        };
      }
    })
  );

  return {
    current,
    appcasts,
    hasErrors: appcasts.some((appcast) => appcast.error)
  };
}

export function formatReleaseInfo(report) {
  const lines = ['Current installs'];

  for (const entry of report.current) {
    if (!entry.release) {
      lines.push(`${entry.label}: not installed`);
      continue;
    }

    lines.push(
      `${entry.label}: ${entry.release.version} build ${entry.release.buildNumber} flavor ${entry.release.flavor}`
    );
  }

  for (const appcast of report.appcasts) {
    lines.push('');
    lines.push(`Appcast ${appcast.label}`);

    if (appcast.error) {
      lines.push(`error: ${appcast.error}`);
      continue;
    }

    for (const release of appcast.releases) {
      lines.push(`${release.version} build ${release.buildNumber} ${release.pubDate}`);
    }
  }

  return `${lines.join('\n')}\n`;
}
