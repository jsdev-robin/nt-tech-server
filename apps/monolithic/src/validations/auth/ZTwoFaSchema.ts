import { z } from 'zod';

const totpToken = z
  .string()
  .length(6, { error: 'Verification code must be exactly 6 digits' })
  .regex(/^\d+$/, { error: 'Verification code must contain only digits' });

const confirm = {
  body: z.object({
    token: totpToken,
    secret: z.string().nonempty({ error: 'Secret is required' }),
  }),
};

const verifyToken = {
  body: z.object({
    token: totpToken,
  }),
};

const verifyBackup = {
  body: z.object({
    code: z.string(),
  }),
};

export const ZTwoFaSchema = {
  confirm,
  verifyToken,
  verifyBackup,
} as const;
