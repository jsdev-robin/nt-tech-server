import mongoose from 'mongoose';

export const db = async (databaseUrl: string): Promise<void> => {
  await mongoose.connect(databaseUrl, {
    serverSelectionTimeoutMS: 50000,
  });
};
