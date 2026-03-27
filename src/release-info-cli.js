import { collectReleaseInfo, formatReleaseInfo } from './release-info.js';

async function main() {
  const report = await collectReleaseInfo();
  process.stdout.write(formatReleaseInfo(report));
  if (report.hasErrors) {
    process.exitCode = 1;
  }
}

await main();
