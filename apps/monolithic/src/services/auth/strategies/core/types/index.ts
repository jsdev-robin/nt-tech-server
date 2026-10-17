import { type Request } from 'express';
import { z } from 'zod';
import { ZAuthSchema } from '../../../../../validations/auth/ZAuthSchema';

export type SignupRequest = Request<
  unknown,
  unknown,
  z.infer<typeof ZAuthSchema.signup.body>
>;

export type VerifyRequest = Request<
  unknown,
  unknown,
  z.infer<typeof ZAuthSchema.verify.body>
>;

export type SigninRequest = Request<
  unknown,
  unknown,
  z.infer<typeof ZAuthSchema.signin.body>
>;

export type SignoutARequest = Request<
  z.infer<typeof ZAuthSchema.signoutSession.params>,
  unknown,
  unknown
>;

export type ForgotPasswordRequest = Request<
  unknown,
  unknown,
  z.infer<typeof ZAuthSchema.forgotPassword.body>
>;

export type ResetPasswordRequest = Request<
  z.infer<typeof ZAuthSchema.resetPassword.params>,
  unknown,
  z.infer<typeof ZAuthSchema.resetPassword.body>
>;

export type ChangePasswordRequest = Request<
  unknown,
  unknown,
  z.infer<typeof ZAuthSchema.chanagePassword.body>
>;

export type UpdateProfileRequest = Request<
  unknown,
  unknown,
  z.infer<typeof ZAuthSchema.updateProfile.body>
>;

export type RequestEmailChangeRequest = Request<
  unknown,
  unknown,
  z.infer<typeof ZAuthSchema.requestEmailChange.body>
>;

export type ConfirmEmailChangeRequest = Request<
  z.infer<typeof ZAuthSchema.confirmEmailChange.params>,
  unknown,
  z.infer<typeof ZAuthSchema.confirmEmailChange.body>
>;

export type ReauthRequest = Request<
  unknown,
  unknown,
  z.infer<typeof ZAuthSchema.reauthRequest.body>
>;

export type ChallengeRequest = Request<
  unknown,
  unknown,
  z.infer<typeof ZAuthSchema.challenge.body>
>;
