import { IUser, Role } from '@server/types';
import { compare } from 'bcryptjs';
import { HydratedDocument, model, Model, Schema } from 'mongoose';

const UserSchema = new Schema(
  {
    profile: {
      familyName: { type: String, required: true },
      givenName: { type: String, required: true },
      email: { type: String, required: true },
      phone: { type: String },
      avatar: {
        public_id: { type: String },
        url: { type: String },
      },
    },
    auth: {
      password: { type: String, select: false },
      passkey: {
        isEnabled: { type: Boolean, default: false },
        enabledAt: { type: Date },
        count: { type: Number, default: 0 },
      },
      twoFa: {
        isEnabled: { type: Boolean, default: false },
        enabledAt: { type: Date },
        backupCodes: {
          type: [
            {
              salt: { type: String },
              iv: { type: String },
              data: { type: String },
            },
          ],
          select: false,
        },
        secret: {
          type: {
            salt: { type: String },
            iv: { type: String },
            data: { type: String },
          },
          select: false,
        },
      },
    },
    role: {
      type: [String],
      enum: Object.values(Role),
      default: [Role.CUSTOMER],
    },
    isActive: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false },
  },
  {
    writeConcern: { w: 'majority', j: true, wtimeout: 5000 },
    timestamps: true,
    toJSON: {
      virtuals: true,
    },
    toObject: {
      virtuals: true,
    },
    versionKey: false,
  },
);

UserSchema.index(
  { 'profile.email': 1 },
  {
    unique: true,
    partialFilterExpression: { 'profile.email': { $type: 'string' } },
  },
);
UserSchema.index({ 'profile.email': 1, role: 1 });
UserSchema.index({ linkedTo: 1 });

UserSchema.virtual('profile.displayName').get(function (this) {
  return `${this.profile?.familyName ?? ''} ${this.profile?.givenName ?? ''}`.trim();
});

UserSchema.methods.checkPassword = async function (
  this: HydratedDocument<IUser>,
  password: string,
): Promise<boolean> {
  if (!this.auth?.password) {
    return false;
  } else {
    return compare(password, this.auth.password);
  }
};

export const UserModel: Model<IUser> = model<IUser>('User', UserSchema);
