import { type CookieOptions, type Request, type Response } from 'express';
import {
  ACCESS_COOKIE_EXP,
  COOKIES,
  ENABLE_DEVTUNNELS,
  REFRESH_COOKIE_EXP,
} from './constants';

export class CookieService {
  protected extractToken(req: Request): string | undefined {
    const authHeader = req.headers['authorization'];

    return authHeader?.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : undefined;
  }

  private options(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'none',
      secure: true,
      path: '/',
      domain: ENABLE_DEVTUNNELS ? 'devtunnels.ms' : process.env.DOMAIN,
    };
  }

  private config(
    type:
      | 'ACCESS'
      | 'REFRESH'
      | 'PENDING_2FA'
      | 'AUTH_STATUS'
      | 'REQUIRE_STORE_SETUP'
      | 'REAUTH'
      | 'CHALLENGE',
  ) {
    return {
      name: COOKIES[type],
      expires:
        type === 'ACCESS'
          ? ACCESS_COOKIE_EXP
          : type === 'REFRESH'
            ? REFRESH_COOKIE_EXP
            : type === 'PENDING_2FA'
              ? {}
              : type === 'REAUTH'
                ? {}
                : undefined,
      options: this.options(),
      signed: type === 'ACCESS' || type === 'CHALLENGE',
    };
  }

  protected cookie = (
    type:
      | 'ACCESS'
      | 'REFRESH'
      | 'PENDING_2FA'
      | 'AUTH_STATUS'
      | 'REQUIRE_STORE_SETUP'
      | 'REAUTH'
      | 'CHALLENGE',
    payload = '',
    remember = false,
  ): [string, string, CookieOptions] => {
    const base = this.config(type);

    const options = remember
      ? {
          ...base.options,
          ...base.expires,
          signed: base.signed,
        }
      : {
          ...base.options,
          signed: base.signed,
        };

    return [base.name, payload, options];
  };

  protected clearCookie = (
    res: Response,
    type:
      | 'ACCESS'
      | 'REFRESH'
      | 'PENDING_2FA'
      | 'AUTH_STATUS'
      | 'REQUIRE_STORE_SETUP'
      | 'REAUTH'
      | 'CHALLENGE',
  ) => {
    const { name, options } = this.config(type);
    res.clearCookie(name, options);
  };

  protected clearCookies = (res: Response) => {
    (
      Object.keys(COOKIES) as Array<
        | 'ACCESS'
        | 'REFRESH'
        | 'PENDING_2FA'
        | 'AUTH_STATUS'
        | 'REQUIRE_STORE_SETUP'
        | 'REAUTH'
        | 'CHALLENGE'
      >
    ).forEach((key) => {
      const { name, options } = this.config(key);
      res.clearCookie(name, options);
    });
  };
}
