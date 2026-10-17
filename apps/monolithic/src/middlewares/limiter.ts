import rateLimit from 'express-rate-limit';
import createError from 'http-errors';
import { StatusCodes } from 'http-status-codes';

export const limiter = (windowMs?: number, limit?: number) => {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    ipv6Subnet: 56,
    handler: (_req, _res, next) => {
      return next(
        createError(
          StatusCodes.TOO_MANY_REQUESTS,
          'Too many requests, please try again later.',
        ),
      );
    },
  });
};
