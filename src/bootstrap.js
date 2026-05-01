import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REQUIRED_PACKAGES = ['asar', '@electron/rebuild'];

function packageJsonPath(packageName) {
  return path.join(PROJECT_ROOT, 'node_modules', ...packageName.split('/'), 'package.json');
}

async function hasRequiredDependencies() {
  for (const packageName of REQUIRED_PACKAGES) {
    try {
      await fs.promises.access(packageJsonPath(packageName), fs.constants.R_OK);
    } catch {
      return false;
    }
  }
  return true;
}

function runNpmInstall() {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['install', '--no-audit', '--no-fund'], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        npm_config_update_notifier: 'false'
      }
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`npm install --no-audit --no-fund exited with code ${code}`));
    });
  });
}

export async function bootstrap(entrypointPath, options = {}) {
  const { alwaysInstall = false } = options;
  if (alwaysInstall || !(await hasRequiredDependencies())) {
    console.error('Installing codex-linux-app npm dependencies...');
    await runNpmInstall();
  }

  await import(pathToFileURL(path.resolve(PROJECT_ROOT, entrypointPath)));
}
