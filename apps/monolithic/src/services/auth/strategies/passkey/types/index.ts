import { type Request } from 'express';
import { z } from 'zod';
import { ZPasskeySchema } from '../../../../../validations/auth/ZPasskeySchema';

export type VerifyRegistrationRequest = Request<
  unknown,
  unknown,
  z.infer<typeof ZPasskeySchema.verifyRegistration.body>
>;

export type GenerateAuthenticationRequest = Request<
  unknown,
  unknown,
  z.infer<typeof ZPasskeySchema.generateAuthentication.body>
>;

export type VerifyAuthenticationRequest = Request<
  unknown,
  unknown,
  z.infer<typeof ZPasskeySchema.verifyAuthentication.body>
>;

export type UnregisterRequest = Request<
  z.infer<typeof ZPasskeySchema.unregister.params>,
  unknown,
  unknown
>;

export type VerifyReauthenticationRequest = Request<
  unknown,
  unknown,
  z.infer<typeof ZPasskeySchema.verifyReuthentication.body>
>;

export type VerifyChallengeRequest = Request<
  unknown,
  unknown,
  z.infer<typeof ZPasskeySchema.verifyChallenge.body>
>;
