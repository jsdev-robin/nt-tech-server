import { COOKIES, REFRESH_TTL } from '@server/protect';
import { type IUser } from '@server/types';
import { randomInt } from 'crypto';
import { type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { ClientSession, Types } from 'mongoose';
import { Crypto, Decipheriv } from 'node-encryptor';
import { config } from '../../../configs/configs';
import { redisClient } from '../../../configs/redis';
import { PasskeyModel } from '../../../models/auth/passkey/PasskeyModel';
import { SessionModel } from '../../../models/auth/session/SessionModel';
import { TokenService } from './TokenService';
export class AuthEngine extends TokenService {
  protected OTP = async (
    data: object,
  ): Promise<{ token: string; otp: string }> => {
    // Generate a random 6-digit OTP
    const otp = randomInt(100000, 1000000).toString().padStart(6, '0');

    // Encrypt the OTP along with additional data and client IP
    const encrypted = await Crypto.cipheriv(
      {
        ...data,
        otp,
      },
      config.CRYPTO_SECRET,
    );

    // Sign the encrypted data into a JWT token with 10 minutes expiry
    const token = jwt.sign({ encrypted }, config.ACTIVATION_SECRET, {
      expiresIn: '10m',
    });

    // Return both the JWT token and the plain OTP
    return { token, otp };
  };

  protected storeSession = async (
    req: Request,
    payload: {
      user: IUser;
      accessToken: string;
      refreshToken: string;
    },
  ): Promise<void> => {
    const { user, accessToken, refreshToken } = payload;
    const { id } = user;
    const hashedAccess = Crypto.hmac(accessToken, config.HMAC_SECRET);
    const hashedRefresh = Crypto.hmac(refreshToken, config.HMAC_SECRET);
    const session = await SessionModel.startSession();

    try {
      session.startTransaction();

      await SessionModel.create(
        [
          {
            user: id,
            accessToken: hashedAccess,
            refreshToken: hashedRefresh,
            deviceInfo: this.getDevice(req),
            location: this.getLocation(req),
            ip: req.ip,
          },
        ],
        { session: session },
      );

      const accessKey = `${id}:access`;
      const refreshKey = `${id}:refresh`;
      const userKey = `${id}:user`;

      const p = redisClient.multi();
      p.SADD(accessKey, hashedAccess);
      p.SADD(refreshKey, hashedRefresh);
      p.json.SET(userKey, '$', Object(user));
      p.EXPIRE(accessKey, REFRESH_TTL * 24 * 60 * 60);
      p.EXPIRE(refreshKey, REFRESH_TTL * 24 * 60 * 60);
      p.EXPIRE(userKey, REFRESH_TTL * 24 * 60 * 60);
      await p.exec();

      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      await session.endSession();
    }
  };

  protected rotateSession = async (payload: {
    id: string;
    oldToken: string;
    newToken: string;
    oldRefreshToken: string;
    newRefreshToken: string;
  }): Promise<void> => {
    const { id, oldToken, newToken, oldRefreshToken, newRefreshToken } =
      payload;
    const hashedAccess = Crypto.hmac(newToken, config.HMAC_SECRET);
    const hashedRefresh = Crypto.hmac(newRefreshToken, config.HMAC_SECRET);
    const session = await SessionModel.startSession();

    try {
      session.startTransaction();

      await SessionModel.findOneAndUpdate(
        {
          $and: [
            { user: id },
            { accessToken: oldToken },
            { refreshToken: oldRefreshToken },
          ],
        },
        {
          $set: {
            accessToken: hashedAccess,
            refreshToken: hashedRefresh,
            expiresAt: new Date(Date.now() + REFRESH_TTL * 24 * 60 * 60 * 1000),
          },
        },
        { session },
      );

      const accessKey = `${id}:access`;
      const refreshKey = `${id}:refresh`;

      const p = redisClient.multi();
      p.SREM(accessKey, String(oldToken));
      p.SADD(accessKey, hashedAccess);
      p.SREM(refreshKey, String(oldRefreshToken));
      p.SADD(refreshKey, hashedRefresh);
      p.EXPIRE(accessKey, REFRESH_TTL * 24 * 60 * 60);
      p.EXPIRE(refreshKey, REFRESH_TTL * 24 * 60 * 60);
      await p.exec();

      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      await session.endSession();
    }
  };

  protected removeASession = async (payload: {
    id: Types.ObjectId;
    token: string;
  }): Promise<void> => {
    const { id, token } = payload;
    const session = await SessionModel.startSession();

    try {
      session.startTransaction();

      const doc = await SessionModel.findOneAndUpdate(
        { $and: [{ user: id }, { accessToken: token }] },
        { $set: { status: false } },
        { session, returnDocument: 'after' },
      );

      const accessKey = `${id}:access`;
      const refreshKey = `${id}:refresh`;

      const p = redisClient.multi();
      p.SREM(accessKey, token);
      if (doc?.refreshToken) {
        p.SREM(refreshKey, doc.refreshToken);
      }
      await p.exec();

      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      await session.endSession();
    }
  };

  protected removeOtherSessions = async (payload: {
    id: string;
    accessToken: string;
  }): Promise<void> => {
    const { id, accessToken } = payload;
    const token = Crypto.hmac(accessToken, config.HMAC_SECRET);
    const session = await SessionModel.startSession();

    try {
      session.startTransaction();

      const current = await SessionModel.findOne(
        { $and: [{ user: id }, { accessToken: token }] },
        null,
        { session },
      );

      await SessionModel.deleteMany(
        { user: id, accessToken: { $ne: token } },
        { session },
      );

      const accessKey = `${id}:access`;
      const refreshKey = `${id}:refresh`;

      const p = redisClient.multi();
      p.DEL(accessKey);
      p.SADD(accessKey, token);
      p.DEL(refreshKey);
      if (current?.refreshToken) {
        p.SADD(refreshKey, current.refreshToken);
      }
      await p.exec();

      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      await session.endSession();
    }
  };

  protected statusToken = (res: Response, user: IUser): void => {
    const token = jwt.sign(
      {
        isPasskey: user?.auth?.passkey?.isEnabled,
        isTwoFa: user?.auth?.twoFa?.isEnabled,
        linkedTo: user?.linkedTo,
        id: user?.id,
      },
      config.CRYPTO_SECRET,
      {
        expiresIn: `${REFRESH_TTL}d`,
        algorithm: 'HS256',
      },
    );

    res.cookie(...this.cookie('AUTH_STATUS', token, false));
  };

  protected refreshCache = async (user: IUser): Promise<void> => {
    const p = redisClient.multi();

    const userKey = `${user.id}:user`;

    p.json.SET(userKey, '$', JSON.parse(JSON.stringify(user?.toObject())));
    p.EXPIRE(userKey, REFRESH_TTL * 24 * 60 * 60);
    await p.exec();
  };

  protected restatusToken = async (
    payload: { id: string },
    session: ClientSession,
  ): Promise<void> => {
    const { id } = payload;

    await this.model.updateOne(
      { _id: id },
      {
        $unset: {
          'auth.twoFa.secret': 1,
          'auth.twoFa.backupCodes': 1,
          'auth.twoFa.enabledAt': 1,
          'auth.passkey.enabledAt': 1,
        },
        $set: {
          'auth.twoFa.isEnabled': false,
          'auth.passkey.isEnabled': false,
          'auth.passkey.count': 0,
        },
      },
      { session },
    );
    await PasskeyModel.deleteMany({ user: id }, { session });
    await SessionModel.deleteMany({ user: id }, { session });

    const accessKey = `${id}:access`;
    const refreshKey = `${id}:refresh`;
    const userKey = `${id}:user`;

    const p = redisClient.multi();
    p.DEL(accessKey);
    p.DEL(refreshKey);
    p.DEL(userKey);
    await p.exec();
  };

  protected setTwoFa = async (
    res: Response,
    payload: {
      id: string;
      remember?: boolean;
    },
  ): Promise<void> => {
    // Encrypt the sensitive payload so it's opaque inside the cookie/JWT
    const encrypted = await Crypto.cipheriv(payload, config.CRYPTO_SECRET);

    // Sign the encrypted payload into a JWT with a short 5-minute expiry
    const token = jwt.sign({ encrypted }, config.ACTIVATION_SECRET, {
      expiresIn: '5m',
    });

    // Store a verify flag in Redis so a stolen JWT alone isn't enough
    await redisClient.setEx(`pending2fa:${payload.id}`, 5 * 60, '1');

    // Set the JWT as the PENDING_2FA cookie on the response
    res.cookie(...this.cookie('PENDING_2FA', token, false));
  };

  protected getTwoFa = async (
    req: Request,
  ): Promise<{
    user: IUser;
    remember: boolean;
  } | null> => {
    // Read the pending 2FA JWT from cookies
    const PENDING_2FA = req.cookies[COOKIES.PENDING_2FA];

    // Verify the JWT signature/expiry and extract the encrypted payload
    const { encrypted } = jwt.verify(PENDING_2FA, config.ACTIVATION_SECRET) as {
      encrypted: Decipheriv;
    };

    // Decrypt the payload to recover the user id, remember-me flag, and password
    const { id, remember } = await Crypto.decipheriv<{
      id: string;
      remember: boolean;
      password: string;
    }>(encrypted, config.CRYPTO_SECRET);

    // Check the Redis verify flag — reject if missing/expired
    const flag = await redisClient.get(`pending2fa:${id}`);
    if (!flag) {
      return null;
    }

    // Look up the user, selecting the password hash and 2FA fields needed to proceed
    const user = await this.model
      ?.findById({ _id: id })
      .select('+auth.twoFa.secret +auth.twoFa.backupCodes');

    // Bail out if the user doesn't exist or the password is no longer valid
    if (!user) {
      return null;
    }

    // Return the user and their remember-me preference for the next step
    return { user, remember };
  };
}
