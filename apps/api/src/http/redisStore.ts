import { Redis } from 'ioredis';
import { RedisStore, type RedisReply } from 'rate-limit-redis';

/** A Redis-backed store factory for the rate limiters. The caller owns (and closes) the client. */
export function redisStoreFactory(url: string) {
  const client = new Redis(url, { maxRetriesPerRequest: 1, commandTimeout: 1000 });
  // Commands queue until the connection is up (the store loads a script when created) but give up after a
  // second, so a Redis outage costs a request at most that long before it fails open.
  client.on('error', () => {}); // outages are handled per request (limiters fail open), not as a crash
  const factory = (prefix: string) =>
    new RedisStore({
      prefix,
      sendCommand: (command: string, ...args: string[]) =>
        client.call(command, ...args) as Promise<RedisReply>,
    });
  return { client, factory };
}
