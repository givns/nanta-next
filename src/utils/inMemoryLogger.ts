let logs: string[] = [];

export function logMessage(message: string) {
  const timestamp = new Date().toISOString();
  logs.push(`${timestamp}: ${message}`);

  // Keep only the last 1000 log entries to prevent memory issues
  if (logs.length > 1000) {
    logs = logs.slice(-1000);
  }
}

export function getLogs() {
  return logs.join('\n');
}

export function clearLogs() {
  logs = [];
}
