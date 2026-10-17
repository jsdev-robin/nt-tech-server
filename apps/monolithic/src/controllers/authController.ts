import { Protect } from '@server/protect';
import { redisClient } from '../configs/redis';
import { UserModel } from '../models/auth/user/UserModel';
import { AuthServices } from '../services/auth/strategies/core/AuthServices';
import { AuthPasskeyServices } from '../services/auth/strategies/passkey/AuthPasskeyServices';
import { AuthTwoFaServices } from '../services/auth/strategies/twoFa/AuthTwoFaServices';

export const authController = new AuthServices({
  model: UserModel,
});

export const authPasskeyController = new AuthPasskeyServices({
  model: UserModel,
});

export const authTwoFaController = new AuthTwoFaServices({
  model: UserModel,
});

export const authProtect = new Protect({
  redis: redisClient,
});
