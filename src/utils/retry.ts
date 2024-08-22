import { logMessage } from './inMemoryLogger';

export async function retry<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  delay: number = 1000,
  backoff: number = 2,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries > 0) {
      logMessage(
        `Retry attempt ${4 - retries} of 3. Waiting ${delay}ms before next attempt.`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      return retry(fn, retries - 1, delay * backoff, backoff);
    } else {
      logMessage('All retry attempts exhausted. Throwing error.');
      throw error;
    }
  }
}
