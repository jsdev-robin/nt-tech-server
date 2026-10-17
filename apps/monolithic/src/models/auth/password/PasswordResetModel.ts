import { Document, Model, Schema, model } from 'mongoose';
import { Crypto } from 'node-encryptor';

export interface ResetDocument extends Document {
  userId: string;
  token: string;
  changedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
}

interface ResetModel extends Model<ResetDocument> {
  issueResetToken: (userId: string) => Promise<string>;
  verifyResetToken: (token: string) => Promise<ResetDocument>;
}

const PasswordResetSchema = new Schema<ResetDocument>(
  {
    userId: {
      type: String,
      required: true,
      unique: true, // one active reset doc per user — new request replaces the old one
    },
    token: {
      type: String,
      required: true,
      unique: true, // stored hashed, never the raw token
    },
    changedAt: {
      type: Date,
      select: false,
    },
    expiresAt: {
      type: Date,
      required: true,
      expires: 0, // TTL index — doc auto-deletes once this date passes
    },
  },
  {
    timestamps: true,
    writeConcern: { w: 'majority', j: true, wtimeout: 5000 },
  },
);

PasswordResetSchema.index({ userId: 1, token: 1 });

// creates (or replaces) the reset token for a user, valid 10 minutes
PasswordResetSchema.statics.issueResetToken = async function (userId: string) {
  const resetToken = Crypto.randomHexString();
  const hashedToken = Crypto.hash(resetToken);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  // upsert so a repeat request replaces the old token instead of colliding
  await this.findOneAndUpdate(
    { userId },
    { token: hashedToken, expiresAt, $unset: { changedAt: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  return resetToken;
};

// looks up by hashed token, only matches if not yet expired
PasswordResetSchema.statics.verifyResetToken = async function (token: string) {
  const hashedToken = Crypto.hash(token);

  return this.findOne({
    token: hashedToken,
    expiresAt: { $gt: new Date() },
  });
};

export const PasswordResetModel = model<ResetDocument, ResetModel>(
  'PasswordReset',
  PasswordResetSchema,
);
