import {
  decryptCodes,
  encryptCodes,
  formatCode,
  recoveryCodes,
} from 'backup-key';
import {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import createError from 'http-errors';
import { ReasonPhrases, StatusCodes } from 'http-status-codes';
import { Crypto } from 'node-encryptor';
import { generate, generateSecret, generateURI, verify } from 'otplib';
import { config } from '../../../../configs/configs';
import { redisClient } from '../../../../configs/redis';
import { AuthEngine } from '../../engine/AuthEngine';
import {
  type ConfirmRequest,
  type VerifyBackupRequest,
  type VerifyTokenRequest,
} from './types';

export class AuthTwoFaServices extends AuthEngine {
  public request: RequestHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    // Generate a new random secret for the user's 2FA setup
    const secret = generateSecret();

    // Generate a one-time token from the secret (used here just to sanity-check verification)
    const token = await generate({ secret });

    // Verify the freshly generated token against the secret to confirm the pair works
    const result = await verify({ secret, token });

    if (!result.valid) {
      return next(
        createError(
          StatusCodes.INTERNAL_SERVER_ERROR,
          'Failed to generate a valid two-factor authentication secret. Please try again.',
        ),
      );
    }

    // Build the otpauth:// URI so an authenticator app can register this secret
    const uri = generateURI({
      issuer: 'Dinely',
      label: req.self.profile.email,
      secret,
    });

    // Respond with the URI and verification result so the client can proceed to confirmation
    res.status(StatusCodes.OK).json({
      status: ReasonPhrases.OK,
      message: 'Two-factor authentication setup generated successfully.',
      payload: {
        uri: uri,
        secret: secret,
      },
    });
  };

  public confirm: RequestHandler = async (
    req: ConfirmRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    // Pull the secret and the token entered by the user from the request body
    const { secret, token } = req.body;

    // Verify the provided token against the provided secret
    const result = await verify({ secret, token });

    // Reject the request if the token is invalid, passing an error to the error-handling middleware
    if (!result.valid) {
      return next(
        createError(
          StatusCodes.BAD_REQUEST,
          'The verification code you entered is invalid. Please try again.',
        ),
      );
    }

    // Encrypt the secret before storing it, so it's never persisted in plain text
    const encryptedSecret = await Crypto.cipheriv(secret, config.CRYPTO_SECRET);

    // Generate recovery (backup) codes
    const encryptedCodes = await recoveryCodes(16, 12, 4, config.CRYPTO_SECRET);

    // Persist the encrypted secret and mark 2FA as enabled on the authenticated user's record,
    // returning the updated document
    const user = await this.model
      .findByIdAndUpdate(
        req.self._id,
        {
          $set: {
            'auth.twoFa.isEnabled': true,
            'auth.twoFa.enabledAt': new Date(),
            'auth.twoFa.secret': encryptedSecret,
            'auth.twoFa.backupCodes': encryptedCodes,
          },
        },
        {
          returnDocument: 'after',
        },
      )
      .exec();

    // If the update succeeded, refresh any cached copy of the user with the latest data
    if (user) {
      await this.refreshCache(user);
      this.statusToken(res, user);
    }

    // Confirm to the client that 2FA has been successfully enabled
    res.status(StatusCodes.OK).json({
      status: ReasonPhrases.OK,
      message: 'Two-factor authentication has been enabled successfully.',
    });
  };

  public verifyToken: RequestHandler = async (
    req: VerifyTokenRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    // Extract the TOTP code entered by the user from the request body
    const { token } = req.body;

    // Retrieve and decrypt the pending 2FA session data (set during login step 1)
    const data = await this.getTwoFa(req as Request);

    // If there's no pending 2FA session (missing/expired/invalid), clear auth cookies and stop
    if (!data) {
      return this.clearCookies(res);
    }

    // Destructure the pending user record and "remember me" preference
    const { user, remember } = data;

    // Decrypt the user's stored 2FA secret so it can be used for verification
    const secret = await Crypto.decipheriv<string>(
      user?.auth.twoFa.secret,
      config.CRYPTO_SECRET,
    );

    // Verify the submitted TOTP code against the decrypted secret
    const result = await verify({ secret, token });

    // Reject the request if the code is invalid or expired
    if (!result.valid) {
      return next(
        createError(
          StatusCodes.BAD_REQUEST,
          'Invalid or expired verification code. Check your Google Authenticator app and try again.',
        ),
      );
    }

    // 2FA verified — clear the temporary pending-2FA cookie, it's no longer needed
    this.clearCookie(res, 'PENDING_2FA');
    await redisClient.getDel(`pending2fa:${user.id}`);

    // Strip the password hash before attaching the user to the request
    user.auth.password = undefined;

    // Attach the authenticated user and remember-me preference to the request
    // for downstream middleware to use (e.g. session creation, token issuance)
    req.self = user;
    req.remember = remember;

    // Pass control to the next middleware in the chain
    next();
  };

  public verifyBackup: RequestHandler = async (
    req: VerifyBackupRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    // Normalize the user-submitted backup code into the expected stored format
    const code = formatCode(req.body.code);

    // Retrieve and decrypt the pending 2FA session data (set during login step 1)
    const data = await this.getTwoFa(req as Request);

    // If there's no pending 2FA session (missing/expired/invalid), clear auth cookies and stop
    if (!data) {
      return this.clearCookies(res);
    }

    // Destructure the pending user record and "remember me" preference
    const { user, remember } = data;

    // Decrypt the user's stored backup codes so they can be checked against the submitted code
    const secret = await decryptCodes(
      user.auth.twoFa.backupCodes,
      config.CRYPTO_SECRET,
    );

    // Reject the request if the submitted code doesn't match any stored backup code
    if (!secret.includes(code)) {
      return next(
        createError(
          StatusCodes.BAD_REQUEST,
          'Invalid backup code. Please try again.',
        ),
      );
    }

    // Remove the used code from the list so it can't be reused (one-time use)
    const secretRemaining = secret.filter((c) => c !== code);

    // Re-encrypt the remaining backup codes for storage
    const encryptedRemaining = await encryptCodes(
      secretRemaining,
      config.CRYPTO_SECRET,
    );
    user.auth.twoFa.backupCodes = encryptedRemaining;

    // Persist the updated (consumed) backup codes list to the user's record
    await user.save();

    // 2FA verified — clear the temporary pending-2FA cookie, it's no longer needed
    this.clearCookie(res, 'PENDING_2FA');
    await redisClient.getDel(`pending2fa:${user.id}`);

    // Strip the password hash before attaching the user to the request
    user.auth.password = undefined;

    // Attach the authenticated user and remember-me preference to the request
    // for downstream middleware to use (e.g. session creation, token issuance)
    req.self = user;
    req.remember = remember;

    // Pass control to the next middleware in the chain
    next();
  };

  public disabled: RequestHandler = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    // Turn off 2FA and strip the secret/backup codes from the user's record
    const user = await this.model.findByIdAndUpdate(
      req.self.id,
      {
        $set: {
          'auth.twoFa.isEnabled': false,
        },
        $unset: {
          'auth.twoFa.enabledAt': 1,
          'auth.twoFa.backupCodes': 1,
          'auth.twoFa.secret': 1,
        },
      },
      {
        returnDocument: 'after',
      },
    );

    // If the update succeeded, refresh any cached copy of the user with the latest data
    if (user) {
      await this.refreshCache(user);
      this.statusToken(res, user);
    }

    // Confirm to the client that 2FA has been disabled
    res.status(StatusCodes.OK).json({
      status: ReasonPhrases.OK,
      message: 'Two-factor authentication removed successfully.',
    });
  };

  public createBackup: RequestHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    // Pull the auth info off the authenticated user
    const { auth } = req.self;

    // Guard: can't regenerate backup codes if 2FA isn't enabled yet
    if (!auth?.twoFa?.isEnabled) {
      return next(
        createError(
          StatusCodes.BAD_REQUEST,
          'Two-factor authentication is not enabled. Please enable it first.',
        ),
      );
    }

    // Generate a new set of encrypted backup codes
    const encryptedCodes = await recoveryCodes(16, 12, 4, config.CRYPTO_SECRET);

    // Overwrite the user's stored backup codes with the newly generated set
    await this.model.findByIdAndUpdate(req.self._id, {
      $set: {
        'auth.twoFa.backupCodes': encryptedCodes,
      },
    });

    // Confirm to the client that new backup codes have been generated
    res.status(StatusCodes.OK).json({
      status: ReasonPhrases.OK,
      message: 'Backup codes generated successfully.',
    });
  };

  public findBackup: RequestHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    // Look up the user, selecting only the encrypted backup codes field
    const user = await this.model
      .findById(req.self._id)
      .select('auth.twoFa.backupCodes');

    // Guard: if the user can't be found, treat it as an expired/invalid session
    if (!user) {
      return next(
        createError(
          StatusCodes.UNAUTHORIZED,
          'Your session may have expired. Please log in again.',
        ),
      );
    }

    // Decrypt the stored backup codes so they can be returned in plain form
    const decryptedCodes = await decryptCodes(
      user.auth?.twoFa?.backupCodes,
      config.CRYPTO_SECRET,
    );

    // Return the decrypted backup codes to the client
    res.status(StatusCodes.OK).json({
      status: ReasonPhrases.OK,
      message: 'Backup codes retrieved successfully.',
      payload: {
        codes: decryptedCodes,
      },
    });
  };
}
