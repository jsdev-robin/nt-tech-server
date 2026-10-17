import { isValidObjectId } from 'mongoose';
import { normalizeEmail } from 'validator';
import { z } from 'zod';

const base64url = z.string().regex(/^[A-Za-z0-9_-]+$/);

const verifyRegistration = {
  body: z
    .object({
      response: z
        .object({
          id: base64url,
          rawId: base64url,
          type: z.literal('public-key'),
          authenticatorAttachment: z
            .enum(['platform', 'cross-platform'])
            .optional(),
          clientExtensionResults: z.record(z.string(), z.any()),
          response: z
            .object({
              clientDataJSON: base64url,
              attestationObject: base64url,
              authenticatorData: base64url.optional(),
              transports: z
                .array(
                  z.enum([
                    'ble',
                    'cable',
                    'hybrid',
                    'internal',
                    'nfc',
                    'smart-card',
                    'usb',
                  ]),
                )
                .optional(),
              publicKeyAlgorithm: z.number().optional(),
              publicKey: base64url.optional(),
            })
            .strict(),
        })
        .strict(),
    })
    .strict(),
};

const generateAuthentication = {
  body: z.object({
    email: z
      .email({ error: 'Please enter a valid email address' })
      .transform((val) => normalizeEmail(val))
      .pipe(z.string({ error: 'Invalid email address' })),
  }),
};

const verifyAuthentication = {
  body: z
    .object({
      response: z
        .object({
          id: base64url,
          rawId: base64url,
          type: z.literal('public-key'),
          authenticatorAttachment: z
            .enum(['platform', 'cross-platform'])
            .optional(),
          clientExtensionResults: z.record(z.string(), z.any()),
          response: z
            .object({
              clientDataJSON: base64url,
              authenticatorData: base64url,
              signature: base64url,
              userHandle: base64url.optional(),
            })
            .strict(),
        })
        .strict(),
    })
    .strict(),
};

const verifyReuthentication = {
  body: z
    .object({
      response: z
        .object({
          id: base64url,
          rawId: base64url,
          type: z.literal('public-key'),
          authenticatorAttachment: z
            .enum(['platform', 'cross-platform'])
            .optional(),
          clientExtensionResults: z.record(z.string(), z.any()),
          response: z
            .object({
              clientDataJSON: base64url,
              authenticatorData: base64url,
              signature: base64url,
              userHandle: base64url.optional(),
            })
            .strict(),
        })
        .strict(),
    })
    .strict(),
};

const verifyChallenge = {
  body: z
    .object({
      response: z
        .object({
          id: base64url,
          rawId: base64url,
          type: z.literal('public-key'),
          authenticatorAttachment: z
            .enum(['platform', 'cross-platform'])
            .optional(),
          clientExtensionResults: z.record(z.string(), z.any()),
          response: z
            .object({
              clientDataJSON: base64url,
              authenticatorData: base64url,
              signature: base64url,
              userHandle: base64url.optional(),
            })
            .strict(),
        })
        .strict(),
    })
    .strict(),
};

const unregister = {
  params: z.object({
    id: z
      .string()
      .optional()
      .refine((val) => isValidObjectId(val), {
        error: 'Invalid ObjectId',
      }),
  }),
};

export const ZPasskeySchema = {
  verifyRegistration,
  generateAuthentication,
  verifyAuthentication,
  unregister,
  verifyReuthentication,
  verifyChallenge,
} as const;
