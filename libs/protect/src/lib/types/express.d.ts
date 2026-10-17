import { type IUser } from '@server/types';

declare global {
  namespace Express {
    interface Request {
      userId: string;
      self: IUser;
      remember?: boolean;
      accessToken: string;
    }
  }
}

export {};
