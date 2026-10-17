import { TicketPriority, TicketStatus } from '@server/constants';
import { HydratedDocument, InferSchemaType, Schema, model } from 'mongoose';

const ticketSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 150,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    status: {
      type: String,
      enum: Object.values(TicketStatus),
      default: TicketStatus.OPEN,
    },
    priority: {
      type: String,
      enum: Object.values(TicketPriority),
      default: TicketPriority.MEDIUM,
    },
    category: { type: String, trim: true, maxlength: 50 },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    dueDate: { type: Date },
    aiSuggestion: {
      suggestedCategory: { type: String, trim: true, maxlength: 50 },
      suggestedPriority: {
        type: String,
        enum: Object.values(TicketPriority),
      },
      suggestedAt: { type: Date },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

ticketSchema.index({ status: 1 });
ticketSchema.index({ priority: 1 });
ticketSchema.index({ status: 1, priority: 1, dueDate: 1 });

export type ITicket = InferSchemaType<typeof ticketSchema>;
export type TicketDocument = HydratedDocument<ITicket>;

export const TicketModel = model<ITicket>('Ticket', ticketSchema);
