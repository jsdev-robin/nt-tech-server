import { Role } from '@server/types';
import express, { Router } from 'express';
import { validationRequest } from 'express-zod-guard';
import { authProtect } from '../controllers/authController';
import { TicketServices } from '../services/ticket/TicketServices';
import { ZTicketSchema } from '../validations/ticket/ZTicketSchema';

const router: Router = express.Router();

router.use(
  authProtect.validateToken,
  authProtect.requireAuth,
  authProtect.restrictTo([Role.ADMIN]),
);

router
  .route('/')
  .get(TicketServices.find)
  .post(validationRequest(ZTicketSchema.create), TicketServices.create);
router.route('/count').get(TicketServices.count);

router
  .route('/bulk/archive')
  .all(validationRequest(ZTicketSchema.bulkObjectId))
  .patch(TicketServices.bulkArchived);

router
  .route('/bulk/restore')
  .all(validationRequest(ZTicketSchema.bulkObjectId))
  .patch(TicketServices.bulkRestore);

router
  .route('/:id/archive')
  .all(validationRequest(ZTicketSchema.objectId))
  .patch(TicketServices.archived);

router
  .route('/:id/restore')
  .patch(validationRequest(ZTicketSchema.objectId), TicketServices.restore);

router
  .route('/:id')
  .all(validationRequest(ZTicketSchema.objectId))
  .get(TicketServices.findOne)
  .patch(validationRequest(ZTicketSchema.update), TicketServices.update);

export default router;
