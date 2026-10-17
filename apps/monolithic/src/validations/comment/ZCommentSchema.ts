import { isValidObjectId } from 'mongoose';
import { z } from 'zod';
import { validObjectId } from '../shared/ZSharedValidation';

const create = {
  body: z.object({
    ticket: z
      .string({ error: 'Ticket is required' })
      .trim()
      .nonempty({ error: 'Ticket is required' })
      .refine(isValidObjectId, { error: 'Invalid ticket' }),
    message: z
      .string({ error: 'Message is required' })
      .trim()
      .nonempty({ error: 'Message is required' })
      .max(5000, 'Message must be 5000 characters or less'),
    isInternal: z
      .boolean({ error: 'isInternal must be true or false' })
      .optional(),
  }),
};

const update = {
  body: create.body.omit({ ticket: true }).partial(),
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

export const ZCommentSchema = {
  create: create,
  update: update,
  objectId: objectId,
  bulkObjectId: bulkObjectId,
};
