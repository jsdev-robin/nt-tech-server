import { isValidObjectId } from 'mongoose';
import { z } from 'zod';

export const validObjectId = z.object({
  id: z
    .string()
    .refine(isValidObjectId, { message: 'Invalid ObjectId' })
    .optional(),
});
