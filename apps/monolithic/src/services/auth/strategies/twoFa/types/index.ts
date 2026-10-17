import { type Request } from 'express';
import { z } from 'zod';
import { ZTwoFaSchema } from '../../../../../validations/auth/ZTwoFaSchema';

export type ConfirmRequest = Request<
  unknown,
  unknown,
  z.infer<typeof ZTwoFaSchema.confirm.body>
>;
export type VerifyTokenRequest = Request<
  unknown,
  unknown,
  z.infer<typeof ZTwoFaSchema.verifyToken.body>
>;
export type VerifyBackupRequest = Request<
  unknown,
  unknown,
  z.infer<typeof ZTwoFaSchema.verifyBackup.body>
>;
