// utils/inMemoryLogger.ts

let logs: string[] = [];

export function logMessage(message: string) {
  const timestamp = new Date().toISOString();
  const logEntry = `${timestamp}: ${message}`;
  console.log(logEntry); // This will log to the console as well
  logs.push(logEntry);
}

export function getLogs() {
  return logs;
}

export function clearLogs() {
  logs = [];
}
