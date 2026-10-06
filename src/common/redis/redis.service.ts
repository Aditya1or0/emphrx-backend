import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client!: Redis;

  onModuleInit(): void {
    const host = process.env.REDIS_HOST || '127.0.0.1';
    const port = Number(process.env.REDIS_PORT || 6379);
    const password = process.env.REDIS_PASSWORD || undefined;

    this.client = new Redis({
      host,
      port,
      password,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
  }

  onModuleDestroy(): void {
    this.client?.disconnect();
  }

  getClient(): Redis {
    return this.client;
  }

  /* Atomically acquires a debounce lock with expiry */
  async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.set(key, 'locked', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  /* Releases acquired lock */
  async releaseLock(key: string): Promise<void> {
    await this.client.del(key);
  }

  /* Stores string or JSON payload with TTL */
  async setWithExpiry(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  /* Retrieves raw value */
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /* Atomically verifies presence and invalidates nonce to prevent replay attacks */
  async consumeNonce(key: string): Promise<boolean> {
    const luaScript = `
      local current = redis.call("GET", KEYS[1])
      if not current then
        return 0
      end
      redis.call("DEL", KEYS[1])
      return 1
    `;
    const result = await this.client.eval(luaScript, 1, key);
    return result === 1;
  }
}
