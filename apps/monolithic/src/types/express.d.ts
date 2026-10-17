import { type IUser } from '@server/types';

declare global {
  namespace Express {
    interface Request {
      userId: string;
      linkedTo?: string;
      self: IUser;
      remember?: boolean;
      accessToken: string;
      ipinfo?: {
        ip: string;
        city: string;
        region: string;
        country: string;
        loc: string;
        org: string;
        postal: string;
        timezone: string;
        countryCode?: string;
        countryFlag?: {
          emoji: string;
          unicode: string;
        };
        countryFlagURL?: string;
        countryCurrency?: {
          code: string;
          symbol: string;
        };
        continent?: {
          code: string;
          name: string;
        };
        isEU?: boolean;
        [key: string]: unknown;
      };
    }
  }
}

export {};
