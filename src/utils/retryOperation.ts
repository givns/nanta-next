// utils/retryOperation.ts

const DEFAULT_RETRIES = 3;
const DEFAULT_DELAY = 1000; // 1 second

export async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = DEFAULT_RETRIES,
  delay: number = DEFAULT_DELAY,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      console.warn(`Attempt ${attempt} failed. Retrying...`);
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Operation failed after multiple retries');
}
