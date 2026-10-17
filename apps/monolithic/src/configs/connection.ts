import { cloudinary } from './cloudinary';
import { config } from './configs';
import { db } from './db';
import { redisClient } from './redis';

// Initialize MongoDB connection
async function initializeDB() {
  try {
    await db(config.DB);
    console.log('✅ Connected to MongoDB 🍃');
  } catch (error) {
    console.error('❌ MongoDB 🍃 Connection Error:', (error as Error).message);
    process.exit(1);
  }
}

// Node Redis
async function initializeRedis() {
  const nodeRedis = await redisClient.connect();
  console.log('✅ Node Redis 🔗 Client Connection Successful', nodeRedis);
}

// Initialize Cloudinary connection
async function initializeCloudinary() {
  // Check if Cloudinary is properly configured
  const result = await cloudinary.api.ping();
  console.log('✅ Cloudinary ☁️  Connection Successful:', result.status);
}

export { initializeCloudinary, initializeDB, initializeRedis };
