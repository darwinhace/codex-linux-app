import os from 'node:os';
import path from 'node:path';
import { createLogger } from './logger.js';
import {
  parseUninstallArgs,
  renderUninstallHelp,
  uninstallDesktop
} from './uninstall.js';

async function main() {
  let options;
  try {
    options = parseUninstallArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(renderUninstallHelp());
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    console.log(renderUninstallHelp());
    return;
  }

  const logger = await createLogger(path.join(os.tmpdir(), 'codex-linux-app-uninstall-logs'));
  logger.info(`Log file: ${logger.logPath}`);

  try {
    await uninstallDesktop(logger);
  } catch (error) {
    logger.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await logger.close();
  }
}

await main();
