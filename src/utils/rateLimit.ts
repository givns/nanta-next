import { AppError, ErrorCode } from '@/types/errors';
import { NextApiRequest, NextApiResponse } from 'next';

// utils/rateLimit.ts
export class RateLimiter {
  private timestamps: Map<string, number[]>;
  private readonly windowMs: number;
  private readonly max: number;

  constructor(windowMs: number, max: number) {
    this.timestamps = new Map();
    this.windowMs = windowMs;
    this.max = max;
  }

  check(key: string): boolean {
    const now = Date.now();
    const timestamps = this.timestamps.get(key) || [];

    // Filter out old timestamps
    const validTimestamps = timestamps.filter(
      (timestamp) => now - timestamp < this.windowMs,
    );

    if (validTimestamps.length >= this.max) {
      return false;
    }

    validTimestamps.push(now);
    this.timestamps.set(key, validTimestamps);
    return true;
  }

  clear(key: string): void {
    this.timestamps.delete(key);
  }
}

// Create middleware function
export function createRateLimitMiddleware(windowMs: number, max: number) {
  const limiter = new RateLimiter(windowMs, max);

  return function rateLimitMiddleware(req: NextApiRequest) {
    const key =
      req.headers['x-forwarded-for']?.toString() ||
      req.socket.remoteAddress ||
      'unknown-ip';

    if (!limiter.check(key)) {
      throw new AppError({
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
        message: 'Too many requests, please try again later',
      });
    }
  };
}
