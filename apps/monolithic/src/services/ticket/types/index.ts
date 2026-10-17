import { Request } from 'express';
import z from 'zod';
import { ZTicketSchema } from '../../../validations/ticket/ZTicketSchema';

export type CreateRequest = Request<
  unknown,
  unknown,
  z.infer<typeof ZTicketSchema.create.body>
>;

export type FindOneRequest = Request<
  z.infer<typeof ZTicketSchema.objectId.params>,
  unknown,
  unknown
>;

export type UpdateRequest = Request<
  z.infer<typeof ZTicketSchema.objectId.params>,
  unknown,
  z.infer<typeof ZTicketSchema.update.body>
>;

export type FindBulkRequest = Request<
  unknown,
  unknown,
  z.infer<typeof ZTicketSchema.bulkObjectId.body>
>;
