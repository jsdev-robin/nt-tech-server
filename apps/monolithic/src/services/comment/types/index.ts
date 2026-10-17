import { Request } from 'express';
import z from 'zod';
import { ZCommentSchema } from '../../../validations/comment/ZCommentSchema';

export type CreateRequest = Request<
  unknown,
  unknown,
  z.infer<typeof ZCommentSchema.create.body>
>;

export type FindOneRequest = Request<
  z.infer<typeof ZCommentSchema.objectId.params>,
  unknown,
  unknown
>;

export type UpdateRequest = Request<
  z.infer<typeof ZCommentSchema.objectId.params>,
  unknown,
  z.infer<typeof ZCommentSchema.update.body>
>;

export type FindBulkRequest = Request<
  unknown,
  unknown,
  z.infer<typeof ZCommentSchema.bulkObjectId.body>
>;
