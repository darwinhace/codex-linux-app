import os from 'node:os';
import path from 'node:path';

export const STABLE_FEED_URL =
  'https://persistent.oaistatic.com/codex-app-prod/appcast.xml';
export const BETA_FEED_URL =
  'https://persistent.oaistatic.com/codex-app-beta/appcast.xml';
export const SUPPORTED_PLATFORM = 'linux';
export const SUPPORTED_ARCH = 'x64';
export const ELECTRON_VERSION = '40.0.0';
export const NODE_ABI = '143';
export const CHANNELS = {
  stable: {
    id: 'stable',
    feedUrl: STABLE_FEED_URL,
    productName: 'Codex',
    executableName: 'codex',
    desktopFileName: 'codex.desktop',
    desktopId: 'com.openai.codex.desktop',
    wmClass: 'Codex',
    iconFileName: 'codex.png'
  },
  beta: {
    id: 'beta',
    feedUrl: BETA_FEED_URL,
    productName: 'Codex Beta',
    executableName: 'codex-beta',
    desktopFileName: 'codex-beta.desktop',
    desktopId: 'com.openai.codex.beta.desktop',
    wmClass: 'CodexBeta',
    iconFileName: 'codex-beta.svg'
  }
};

export function getPaths() {
  const home = os.homedir();
  const xdgDataHome = process.env.XDG_DATA_HOME ?? path.join(home, '.local', 'share');
  const xdgStateHome =
    process.env.XDG_STATE_HOME ?? path.join(home, '.local', 'state');
  const xdgCacheHome =
    process.env.XDG_CACHE_HOME ?? path.join(home, '.cache');
  return {
    home,
    dataHome: path.join(xdgDataHome, 'codex-linux-app'),
    desktopApplications: path.join(xdgDataHome, 'applications'),
    stateHome: path.join(xdgStateHome, 'codex-linux-app'),
    cacheHome: path.join(xdgCacheHome, 'codex-linux-app')
  };
}

export const NATIVE_MODULES = [
  'better-sqlite3',
  'node-pty',
  'bufferutil',
  'utf-8-validate'
];
