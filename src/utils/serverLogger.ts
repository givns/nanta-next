import fs from 'fs';
import path from 'path';

const logFilePath = path.join(process.cwd(), 'server-logs.txt');

export function logMessage(message: string) {
  const timestamp = new Date().toISOString();
  const logEntry = `${timestamp}: ${message}\n`;

  fs.appendFileSync(logFilePath, logEntry);
}
