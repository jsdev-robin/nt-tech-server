import { TicketPriority, TicketStatus } from '@server/constants';
import { isValidObjectId } from 'mongoose';
import { z } from 'zod';
import { validObjectId } from '../shared/ZSharedValidation';

const create = {
  body: z.object({
    title: z
      .string({ error: 'Title is required' })
      .trim()
      .nonempty({ error: 'Title is required' })
      .min(3, 'Title must be at least 3 characters')
      .max(150, 'Title must be 150 characters or less'),
    description: z
      .string({ error: 'Description is required' })
      .trim()
      .nonempty({ error: 'Description is required' })
      .max(5000, 'Description must be 5000 characters or less'),
    status: z
      .enum(TicketStatus, {
        error: 'Status must be open, in progress, resolved or closed',
      })
      .optional(),
    priority: z
      .enum(TicketPriority, {
        error: 'Priority must be low, medium, high or urgent',
      })
      .optional(),
    category: z
      .string()
      .trim()
      .max(50, 'Category must be 50 characters or less')
      .optional(),
    assignedTo: z
      .string()
      .trim()
      .refine(isValidObjectId, { error: 'Invalid assignee' })
      .nullable()
      .optional(),
  }),
};

const update = {
  body: create.body.partial(),
};

const objectId = {
  params: validObjectId,
};

const bulkObjectId = {
  body: z.object({
    ids: z
      .array(
        z.string().refine(isValidObjectId, { message: 'Invalid ObjectId' }),
      )
      .min(1, 'At least one id is required'),
  }),
};

export const ZTicketSchema = {
  create: create,
  update: update,
  objectId: objectId,
  bulkObjectId: bulkObjectId,
};
