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
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

commentSchema.index({ ticket: 1, createdAt: 1 });
commentSchema.index({ ticket: 1, isInternal: 1, createdAt: 1 });

export type IComment = InferSchemaType<typeof commentSchema>;
export type CommentDocument = HydratedDocument<IComment>;
export const CommentModel = model<IComment>('Comment', commentSchema);
