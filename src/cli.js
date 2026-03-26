import path from 'node:path';
import { createLogger } from './logger.js';
import { getPaths } from './constants.js';
import { installDesktop, parseArgs, renderHelp } from './repack.js';

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(renderHelp());
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    console.log(renderHelp());
    return;
  }

  const paths = getPaths();
  const logger = await createLogger(path.join(paths.stateHome, 'logs'));
  logger.info(`Log file: ${logger.logPath}`);

  try {
    await installDesktop(options, logger);
  } catch (error) {
    logger.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await logger.close();
  }
}

await main();
