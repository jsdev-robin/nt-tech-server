import { Document, Types } from 'mongoose';
import { type Decipheriv } from 'node-encryptor';

export enum Role {
  CUSTOMER = 'CUSTOMER',
  AGENT = 'AGENT',
  ADMIN = 'ADMIN',
}

export interface IUser extends Document {
  id: string;
  _id: Types.ObjectId;
  profile: {
    familyName: string;
    givenName: string;
    displayName: string;
    email: string;
    phone?: string;
    avatar?: {
      public_id: string;
      url: string;
    };
  };
  auth: {
    password?: string;
    passkey: {
      isEnabled: boolean;
      enabledAt?: Date;
      count: number;
    };
    twoFa: {
      isEnabled: boolean;
      enabledAt?: Date;
      backupCodes: Decipheriv[];
      secret: Decipheriv;
    };
  };
  role: Role[];
  isActive: boolean;
  isVerified: boolean;
  checkPassword: (plainPassword: string) => Promise<boolean>;
}
