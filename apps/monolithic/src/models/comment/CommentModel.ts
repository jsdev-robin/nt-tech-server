import { Status } from '@server/constants';
import { HydratedDocument, InferSchemaType, Schema, model } from 'mongoose';

const commentSchema = new Schema(
  {
    ticket: {
      type: Schema.Types.ObjectId,
      ref: 'Ticket',
      required: true,
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    isInternal: {
      type: Boolean,
      default: false,
    },
    recordStatus: {
      type: String,
      enum: Object.values(Status),
      default: Status.ACTIVE,
    },
    linkedTo: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    expiresAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

commentSchema.index({ linkedTo: 1, recordStatus: 1, createdAt: -1 });
commentSchema.index({ linkedTo: 1, ticket: 1, recordStatus: 1, createdAt: 1 });
commentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type IComment = InferSchemaType<typeof commentSchema>;
export type CommentDocument = HydratedDocument<IComment>;

export const CommentModel = model<IComment>('Comment', commentSchema);
