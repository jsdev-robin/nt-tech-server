import { model, Schema, Types } from 'mongoose';

interface IPasskey {
  internalUserId: Types.ObjectId;
  credId: string;
  credPublicKey: string;
  webauthnUserId: Uint8Array<ArrayBufferLike>;
  counter: number;
  backupEligible: boolean;
  backupStatus: boolean;
  transports?: string[];
  lastUsed?: Date;
  device?: string;
  browser?: string;
  os?: string;
}

const passkeySchema = new Schema<IPasskey>(
  {
    internalUserId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    credId: {
      type: String,
      required: true,
    },
    credPublicKey: {
      type: String,
      required: true,
    },
    webauthnUserId: {
      type: String,
      required: true,
    },
    counter: {
      type: Number,
      default: 0,
    },
    backupEligible: {
      type: Boolean,
      default: false,
    },
    backupStatus: {
      type: Boolean,
      default: false,
    },
    transports: {
      type: [String],
      default: [],
    },
    lastUsed: {
      type: Date,
    },
    device: {
      type: String,
    },
    browser: {
      type: String,
    },
    os: {
      type: String,
    },
  },
  {
    timestamps: true,
    writeConcern: { w: 'majority', j: true, wtimeout: 5000 },
  },
);

// export type TPasskey = InferSchemaType<typeof passkeySchema>;

export const PasskeyModel = model<IPasskey>('Passkey', passkeySchema);
