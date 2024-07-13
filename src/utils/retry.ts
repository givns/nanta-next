// utils/retry.ts

export async function retry<T>(
    fn: () => Promise<T>,
    retries: number,
    delay: number,
    onRetry?: (error: Error, attempt: number) => void
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (retries <= 0) {
        throw error;
      }
      if (onRetry) {
        onRetry(error as Error, retries);
      }
      await new Promise(resolve => setTimeout(resolve, delay));
      return retry(fn, retries - 1, delay, onRetry);
    }
  }
  