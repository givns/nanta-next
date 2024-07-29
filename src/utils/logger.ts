export async function logMessage(message: string) {
  try {
    await fetch('/api/logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    });
  } catch (error) {
    console.error('Failed to log message:', error);
  }
}
