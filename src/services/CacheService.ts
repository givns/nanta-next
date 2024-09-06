// services/CacheService.ts
import NodeCache from 'node-cache';

export class CacheService {
  private cache: NodeCache;

  constructor(ttlSeconds: number = 60) {
    this.cache = new NodeCache({ stdTTL: ttlSeconds });
  }

  set(key: string, value: any): void {
    this.cache.set(key, value);
  }

  get<T>(key: string): T | undefined {
    return this.cache.get<T>(key);
  }

  del(key: string): void {
    this.cache.del(key);
  }
}
