import { createAdapter } from '@socket.io/redis-streams-adapter';
import { registerProcessErrorHandlers } from 'express-global-guard';
import http from 'http';
import dns from 'node:dns/promises';
import { Server as SocketIOServer } from 'socket.io';
import app from './app';
import { config } from './configs/configs';
import {
  initializeCloudinary,
  initializeDB,
  initializeRedis,
} from './configs/connection';
import { redisClient } from './configs/redis';
dns.setServers(['1.1.1.1', '8.8.8.8']);

const httpServer = http.createServer(app);

export const io = new SocketIOServer(httpServer, {
  cors: {
    origin: 'https://tksr2gn8-3001.asse.devtunnels.ms',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true,
  },
  pingInterval: 25000,
  pingTimeout: 20000,
  maxHttpBufferSize: 1e6,
  transports: ['websocket', 'polling'],
});

(async function initializeApplication() {
  try {
    await initializeDB();
    await initializeRedis();
    await initializeCloudinary();

    io.adapter(
      createAdapter(redisClient, {
        maxLen: 15000,
      }),
    );
    console.log('✅ Socket.IO Redis Streams adapter attached');
  } catch (error) {
    console.error(
      'Application Initialization Failed',
      (error as Error).message,
    );
    process.exit(1);
  }
})();

httpServer.listen(Number(config.PORT), () => {
  console.log(
    ` Monolethic server is running on port ${config.PORT} in ${config.NODE_ENV}`,
  );
});

registerProcessErrorHandlers(httpServer);
