import { createClient, type RedisClientType } from 'redis';
import { config } from './configs';

export const redisClient: RedisClientType = createClient({
  url: config.REDIS_URL,
});

redisClient.on('error', function (err) {
  throw err;
});
