export interface ICacheService {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl?: number): Promise<void>;
  del(key: string): Promise<void>;
  invalidatePattern(pattern: string): Promise<void>;
  getWithSWR<T>(
    key: string,
    fetchFunction: () => Promise<T>,
    ttl: number,
  ): Promise<T>;
}

export interface CacheOptions {
  redis: {
    url: string;
    ttl: number;
    prefix: string;
  };
  locks: {
    timeout: number;
    retry: number;
  };
}

export interface CacheMetadata {
  timestamp: number;
  version: number;
  lastUpdated: string;
}

export interface CachedData<T> {
  data: T;
  metadata: CacheMetadata;
}

export interface CacheConfig {
  ttl: number;
  prefix: string;
  invalidationPatterns: string[];
  options?: {
    compression?: boolean;
    encryption?: boolean;
  };
}
