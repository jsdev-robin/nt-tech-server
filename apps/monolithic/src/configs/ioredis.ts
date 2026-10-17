import IORedis from 'ioredis';
import { config } from './configs';

export const connection = new IORedis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
});
