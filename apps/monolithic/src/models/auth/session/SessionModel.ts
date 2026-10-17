import { InferSchemaType, Model, Schema, model } from 'mongoose';

export const SessionSchema = new Schema(
  {
    accessToken: {
      type: String,
      required: true,
    },
    refreshToken: {
      type: String,
      required: true,
    },
    deviceInfo: {
      deviceType: String,
      os: String,
      browser: String,
      userAgent: String,
    },
    location: {
      city: String,
      country: String,
      lat: Number,
      lng: Number,
    },
    ip: {
      type: String,
    },
    status: {
      type: Boolean,
      default: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    },
    user: {
      type: Schema.Types.ObjectId,
    },
  },
  {
    timestamps: true,
    writeConcern: { w: 'majority', j: true, wtimeout: 5000 },
  },
);

SessionSchema.index({ user: 1, accessToken: 1 }, { unique: true });
SessionSchema.index({ user: 1, refreshToken: 1 }, { unique: true });
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type TSession = InferSchemaType<typeof SessionSchema>;

export const SessionModel: Model<TSession> = model<TSession>(
  'Session',
  SessionSchema,
);
