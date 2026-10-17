import { type IUser, Role } from '@server/types';
import {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import createError from 'http-errors';
import { StatusCodes } from 'http-status-codes';
import jwt from 'jsonwebtoken';
import { Crypto, Decipheriv } from 'node-encryptor';
import { type RedisClientType } from 'redis';
import { COOKIES } from './engine/constants.js';
import { CookieService } from './engine/CookieService.js';

export class Protect extends CookieService {
  protected readonly redis: RedisClientType;
  constructor(options: { redis: RedisClientType }) {
    super();
    this.redis = options.redis;
  }

  public validateToken: RequestHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const accessToken =
      req.signedCookies[COOKIES.ACCESS] || this.extractToken(req);

    if (!accessToken) {
      return next(
        createError(
          StatusCodes.UNAUTHORIZED,
          'Your session has expired. Please log in again.',
        ),
      );
    }

    const { id } = jwt.verify(
      accessToken,
      String(process.env.ACCESS_TOKEN),
    ) as { id: string };

    req.userId = id;
    req.accessToken = accessToken;

    next();
  };

  public requireAuth: RequestHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const { userId, accessToken } = req;

    const p = this.redis.multi();
    p.SISMEMBER(
      `${userId}:access`,
      Crypto.hmac(String(accessToken), String(process.env.HMAC_SECRET)),
    );
    p.json.GET(`${userId}:user`);

    const [token, user] = (await p.exec()) as unknown as [string, IUser];

    if (!token || !user) {
      this.clearCookies(res);
      return next(
        createError(
          StatusCodes.UNAUTHORIZED,
          'Your session has expired. Please log in again.',
        ),
      );
    }

    req.self = user;

    next();
  };

  public restrictTo = (roles: Role[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
      const user = req.self;
      const hasRole = user.role.some((role) => roles.includes(role));
      if (!hasRole) {
        this.clearCookies(res);
        return next(
          createError(
            StatusCodes.UNAUTHORIZED,
            'Your session has expired. Please log in again.',
          ),
        );
      }

      next();
    };
  };

  public reauthVerify: RequestHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    // Read the REAUTH JWT from cookies
    const reauth = req.cookies[COOKIES.REAUTH];

    if (!reauth) {
      // No reauth cookie present, block the sensitive action
      return next(
        createError(
          StatusCodes.UNAUTHORIZED,
          'Please re-authenticate to continue.',
        ),
      );
    }

    // Verify the JWT signature/expiry and extract the encrypted payload
    // (Express 5 auto-forwards thrown/rejected errors to next(), e.g. expired/invalid token)
    const { encrypted } = jwt.verify(
      reauth,
      String(process.env.ACTIVATION_SECRET),
    ) as {
      encrypted: Decipheriv;
    };

    // Decrypt the payload to recover the user id
    const id = await Crypto.decipheriv<string>(
      encrypted,
      String(process.env.CRYPTO_SECRET),
    );

    // Ensure the reauth token belongs to the currently logged-in user using safe comparison
    const isValid = Crypto.safeCompare(String(id), String(req.self._id));
    if (!isValid) {
      return next(
        createError(
          StatusCodes.UNAUTHORIZED,
          'Please re-authenticate to continue.',
        ),
      );
    }

    // Check the Redis verify flag — reject if missing/expired
    const flag = await this.redis.get(`reauth:${id}`);
    if (!flag) {
      return next(
        createError(
          StatusCodes.UNAUTHORIZED,
          'Please re-authenticate to continue.',
        ),
      );
    }

    // Reauth verified, allow the request to proceed
    next();
  };

  public challengeVerify: RequestHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    // Read the REAUTH JWT from cookies
    const reauth = req.signedCookies[COOKIES.CHALLENGE];

    if (!reauth) {
      // No reauth cookie present, block the sensitive action
      return next(
        createError(
          StatusCodes.UNAUTHORIZED,
          'This action requires verification. Please confirm your password to continue.',
        ),
      );
    }

    // Verify the JWT signature/expiry and extract the encrypted payload
    // (Express 5 auto-forwards thrown/rejected errors to next(), e.g. expired/invalid token)
    const { encrypted } = jwt.verify(
      reauth,
      String(process.env.ACTIVATION_SECRET),
    ) as {
      encrypted: Decipheriv;
    };

    // Decrypt the payload to recover the user id
    const id = await Crypto.decipheriv<string>(
      encrypted,
      String(process.env.CRYPTO_SECRET),
    );

    // Ensure the reauth token belongs to the currently logged-in user using safe comparison
    const isValid = Crypto.safeCompare(String(id), String(req.self._id));
    if (!isValid) {
      return next(
        createError(
          StatusCodes.UNAUTHORIZED,
          'Verification does not match the current session. Please try again.',
        ),
      );
    }

    // Check the Redis verify flag — reject if missing/expired
    const flag = await this.redis.get(`challenge:${id}`);
    if (!flag) {
      return next(
        createError(
          StatusCodes.UNAUTHORIZED,
          'Your verification has expired. Please confirm your password again.',
        ),
      );
    }

    // Reauth verified — clear the flag and cookie so this challenge can't be reused
    await this.redis.del(`challenge:${id}`);
    this.clearCookie(res, 'CHALLENGE');

    // Reauth verified, allow the request to proceed
    next();
  };
}
