import { createNodeRedisClient } from 'bullmq';
import { createClient } from 'redis';
import { config } from './configs';

const rawClient = createClient({
  url: config.REDIS_URL,
});

export const bullmqConnection = createNodeRedisClient(rawClient);
