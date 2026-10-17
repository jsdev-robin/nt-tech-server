import { isStrongPassword, normalizeEmail } from 'validator';
import { z } from 'zod';

const signup = {
  body: z
    .object({
      familyName: z
        .string()
        .nonempty('Family name is required')
        .min(2, { error: 'Family name must be at least 2 characters' })
        .max(32, { error: 'Family name cannot exceed 32 characters' }),
      givenName: z
        .string()
        .nonempty('Given name is required')
        .min(2, { error: 'Given name must be at least 2 characters' })
        .max(32, { error: 'Given name cannot exceed 32 characters' }),
      email: z
        .email({ error: 'Please enter a valid email address' })
        .transform((val) => normalizeEmail(val))
        .pipe(z.string({ error: 'Invalid email address' })),
      password: z
        .string()
        .nonempty('Password is required')
        .refine((val) => isStrongPassword(val), {
          error:
            'Password must include uppercase, lowercase, number & special character',
        }),
      passwordConfirm: z.string().nonempty('Password confirmation is required'),
    })
    .refine((data) => data.password === data.passwordConfirm, {
      path: ['passwordConfirm'],
      error: 'Passwords do not match',
    }),
};

const verify = {
  body: z.object({
    token: z
      .jwt({ error: 'Please provide a valid token' })
      .nonempty({ error: 'Token is required' }),
    otp: z.string({ error: 'OTP is required' }).min(6, {
      error: 'Your one-time password must be 6 characters.',
    }),
  }),
};

const signin = {
  body: z.object({
    email: z
      .email({ error: 'Please enter a valid email address' })
      .transform((val) => normalizeEmail(val))
      .pipe(z.string({ error: 'Invalid email address' })),
    password: z.string().nonempty('Password is required'),
    remember: z
      .boolean({ error: 'Remember must be true or false' })
      .default(false)
      .optional(),
  }),
};

const signoutSession = {
  params: z.object({
    token: z.string({ error: 'Token must be string' }).optional(),
  }),
};

const forgotPassword = {
  body: z.object({
    email: z
      .email({ error: 'Please enter a valid email address' })
      .transform((val) => normalizeEmail(val))
      .pipe(z.string({ error: 'Invalid email address' })),
  }),
};

const resetPassword = {
  params: z.object({
    token: z.string().optional(),
  }),
  body: z
    .object({
      newPassword: z
        .string()
        .nonempty('Password is required')
        .refine((val) => isStrongPassword(val), {
          error:
            'Password must include uppercase, lowercase, number & special character',
        }),
      confirmNewPassword: z
        .string()
        .nonempty('Password confirmation is required'),
    })
    .refine((data) => data.newPassword === data.confirmNewPassword, {
      path: ['confirmNewPassword'],
      error: 'Passwords do not match',
    }),
};

const chanagePassword = {
  body: z
    .object({
      currentPassword: z
        .string()
        .nonempty({ error: 'Current password is required' }),
      newPassword: z
        .string()
        .nonempty({ error: "'Password is required'" })
        .refine((val) => isStrongPassword(val), {
          error:
            'Password must include uppercase, lowercase, number & special character',
        }),
      confirmNewPassword: z
        .string()
        .nonempty({ error: 'Password confirmation is required' }),
    })
    .refine((data) => data.newPassword === data.confirmNewPassword, {
      path: ['confirmNewPassword'],
      error: 'Passwords do not match',
    }),
};

const updateProfile = {
  body: z.object({
    profile: z.object({
      familyName: z.string().optional(),
      givenName: z.string().optional(),
      avatar: z
        .object({
          public_id: z.string().optional(),
          url: z.url().optional().or(z.literal('')),
        })
        .optional(),
    }),
  }),
};

const requestEmailChange = {
  body: z
    .object({
      newEmail: z
        .email({ error: 'Please enter a valid email address' })
        .transform((val) => normalizeEmail(val))
        .pipe(z.string({ error: 'Invalid email address' })),
      confirmEmail: z
        .email({ error: 'Please enter a valid email address' })
        .transform((val) => normalizeEmail(val))
        .pipe(z.string({ error: 'Invalid email address' })),
      password: z.string().nonempty('Password is required'),
    })
    .refine((data) => data.newEmail === data.confirmEmail, {
      path: ['confirmEmail'],
      error: 'Emails do not match',
    }),
};

const confirmEmailChange = {
  params: z.object({
    token: z.string().optional(),
  }),
  body: z.object({
    code: z.string({ error: 'Code is required' }),
  }),
};

const reauthRequest = {
  body: z.object({
    password: z.string().nonempty('Password is required'),
  }),
};

const challenge = {
  body: z.object({
    password: z.string().nonempty('Password is required'),
  }),
};

export const ZAuthSchema = {
  signup,
  verify,
  signin,
  signoutSession,
  forgotPassword,
  resetPassword,
  chanagePassword,
  updateProfile,
  requestEmailChange,
  confirmEmailChange,
  reauthRequest,
  challenge,
} as const;
