import fs from 'node:fs';
import path from 'node:path';

export async function createLogger(logDir) {
  await fs.promises.mkdir(logDir, { recursive: true });
  const timestamp = new Date().toISOString().replaceAll(':', '-');
  const logPath = path.join(logDir, `install-${timestamp}.log`);
  const stream = fs.createWriteStream(logPath, { flags: 'a' });

  function write(level, message) {
    const line = `[${new Date().toISOString()}] [${level}] ${message}`;
    stream.write(`${line}\n`);
    if (level === 'ERROR') {
      console.error(line);
    } else {
      console.log(line);
    }
  }

  return {
    logPath,
    info(message) {
      write('INFO', message);
    },
    warn(message) {
      write('WARN', message);
    },
    error(message) {
      write('ERROR', message);
    },
    close() {
      return new Promise((resolve, reject) => {
        stream.end((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  };
}
