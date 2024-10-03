import { Redis } from 'ioredis';

let redis: Redis | null = null;

if (typeof window === 'undefined' && process.env.REDIS_URL) {
  import('ioredis')
    .then((RedisModule) => {
      const RedisClient = RedisModule.default || RedisModule.Redis;
      if (process.env.REDIS_URL) {
        redis = new RedisClient(process.env.REDIS_URL);
      }
    })
    .catch((error) => {
      console.error('Failed to initialize Redis:', error);
    });
}

export default redis;
