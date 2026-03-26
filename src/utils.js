import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';

export async function ensureDir(dirPath) {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

export async function fileExists(filePath) {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function removeIfExists(targetPath) {
  await fs.promises.rm(targetPath, { recursive: true, force: true });
}

export async function copyDir(source, destination) {
  await fs.promises.cp(source, destination, {
    recursive: true,
    force: true,
    preserveTimestamps: true
  });
}

export async function copyFile(source, destination) {
  await ensureDir(path.dirname(destination));
  await fs.promises.copyFile(source, destination);
}

export async function writeExecutable(filePath, contents) {
  await ensureDir(path.dirname(filePath));
  await fs.promises.writeFile(filePath, contents, 'utf8');
  await fs.promises.chmod(filePath, 0o755);
}

export async function createTempDir(prefix) {
  return fs.promises.mkdtemp(path.join(os.tmpdir(), prefix));
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryForever(stageName, logger, task) {
  let attempt = 1;
  for (;;) {
    try {
      logger.info(`${stageName}: attempt ${attempt} started`);
      const result = await task(attempt);
      logger.info(`${stageName}: attempt ${attempt} succeeded`);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      logger.error(`${stageName}: attempt ${attempt} failed\n${message}`);
      const backoffMs = Math.min(30_000, Math.max(2_000, attempt * 2_000));
      logger.warn(`${stageName}: retrying in ${Math.round(backoffMs / 1000)}s`);
      attempt += 1;
      await sleep(backoffMs);
    }
  }
}

export async function runCommand(command, args, options = {}) {
  const { cwd, logger, env } = options;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        ...env
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (logger) {
        for (const line of text.split('\n')) {
          if (line) {
            logger.info(`${command}: ${line}`);
          }
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (logger) {
        for (const line of text.split('\n')) {
          if (line) {
            logger.warn(`${command}: ${line}`);
          }
        }
      }
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(' ')} exited with code ${code}\n${stderr || stdout}`.trim()
        )
      );
    });
  });
}

export async function downloadFile(url, destination) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  }
  await ensureDir(path.dirname(destination));
  await pipeline(response.body, fs.createWriteStream(destination));
}

export function parseJsonFile(filePath) {
  return fs.promises.readFile(filePath, 'utf8').then((value) => JSON.parse(value));
}
