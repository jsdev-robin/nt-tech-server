import { COOKIES } from '@server/protect';
import { Role, type IUser } from '@server/types';
import { hash } from 'bcryptjs';
import {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import createError from 'http-errors';
import { ReasonPhrases, StatusCodes } from 'http-status-codes';
import jwt from 'jsonwebtoken';
import mongoose, { Model } from 'mongoose';
import { Crypto, type Decipheriv } from 'node-encryptor';
import pRetry from 'p-retry';
import { cloudinary } from '../../../../configs/cloudinary';
import { config } from '../../../../configs/configs';
import { redisClient } from '../../../../configs/redis';
import { PasswordResetModel } from '../../../../models/auth/password/PasswordResetModel';
import { SessionModel } from '../../../../models/auth/session/SessionModel';
import { SendEmail } from '../../../email/SendMail';
import { AuthEngine } from '../../engine/AuthEngine';
import { type Signature } from '../../engine/TokenService';
import {
  type ChallengeRequest,
  type ChangePasswordRequest,
  type ConfirmEmailChangeRequest,
  type ForgotPasswordRequest,
  type ReauthRequest,
  type RequestEmailChangeRequest,
  type ResetPasswordRequest,
  type SigninRequest,
  type SignoutARequest,
  type SignupRequest,
  type UpdateProfileRequest,
  type VerifyRequest,
} from './types';

export class AuthServices extends AuthEngine {
  constructor(options: { model: Model<IUser> }) {
    super(options);
  }

  public signup =
    (ROLE: Role[]): RequestHandler =>
    async (
      req: SignupRequest,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      // Extract signup fields from request body
      const { familyName, email } = req.body;

      // Check if a user with this email already exists for the given roles
      const exists = await this.model.exists({
        $and: [{ 'profile.email': email }, { role: { $in: ROLE } }],
      });

      if (exists) {
        // Block signup if email is already registered
        return next(
          createError(
            StatusCodes.BAD_REQUEST,
            'This email is already registered. Use a different email address.',
          ),
        );
      }

      // Generate OTP and JWT token carrying encrypted signup data
      const { token, otp } = await this.OTP(req.body);

      // Build payload for the verification email
      const payload = {
        user: {
          name: familyName,
          email: email,
        },
        otp: otp,
      };

      // Send OTP to the user's email
      await new SendEmail(payload).verifyEmail();

      // Respond with token (client sends this back along with OTP on verify)
      res.status(StatusCodes.OK).json({
        status: ReasonPhrases.OK,
        message: 'Verification code sent successfully to your email address.',
        payload: { token },
      });
    };

  public verify =
    (ROLE: Role): RequestHandler =>
    async (
      req: VerifyRequest,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      // Verify and decode the JWT to get encrypted signup data
      const { encrypted } = jwt.verify(
        req.body.token,
        config.ACTIVATION_SECRET,
      ) as {
        encrypted: Decipheriv;
      };

      // Decrypt the signup data embedded in the token
      const { familyName, givenName, email, password, otp } =
        await Crypto.decipheriv<{
          familyName: string;
          givenName: string;
          email: string;
          password: string;
          otp: string;
        }>(encrypted, config.CRYPTO_SECRET);

      // Compare submitted OTP with the decrypted OTP using safe comparison
      const isValid = Crypto.safeCompare(String(otp), String(req.body.otp));
      if (!isValid) {
        // Reject verification if OTP doesn't match
        return next(
          createError(
            StatusCodes.BAD_REQUEST,
            'The OTP you entered does not match. Please double-check the code and try again.',
          ),
        );
      }

      // Hash the password before storing
      const hashed = await hash(password, 12);

      // Create the verified user record
      await this.model.create({
        profile: {
          familyName,
          givenName,
          email,
        },
        auth: {
          password: hashed,
        },
        isVerified: true,
        role: [ROLE],
      });

      // Respond with success
      res.status(StatusCodes.CREATED).json({
        status: ReasonPhrases.CREATED,
        message: 'Your account has been successfully verified.',
      });
    };

  public signin =
    (ROLE: Role[]): RequestHandler =>
    async (
      req: SigninRequest,
      _: Response,
      next: NextFunction,
    ): Promise<void> => {
      const { email, password, remember } = req.body;

      const user = await this.model
        .findOne({ 'profile.email': email, role: { $in: ROLE } })
        .select('+auth.password')
        .exec();

      const isValid = await user?.checkPassword(password);

      if (!user || !isValid) {
        return next(
          createError(
            StatusCodes.UNAUTHORIZED,
            'Incorrect email or password. Please check your credentials and try again.',
          ),
        );
      }

      user.auth.password = undefined;
      req.self = user;
      req.remember = remember;

      next();
    };

  public isTwoFa: RequestHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const {
      remember,
      self: { auth, id },
    } = req;
    const isEnabled = auth?.twoFa?.isEnabled;

    if (isEnabled) {
      await this.setTwoFa(res, {
        id: id,
        remember: remember,
      });
      res.status(StatusCodes.OK).json({
        status: ReasonPhrases.OK,
        message:
          'Sign-in successful. Please complete two-factor authentication.',
        payload: {
          isEnabled: isEnabled,
        },
      });
    } else {
      next();
    }
  };

  public createSession: RequestHandler = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    // user object attached to request (from middleware)
    const { self, remember } = req;
    const { id, role, profile } = self;

    // Generate new access, refresh, and protect tokens
    const [accessToken, refreshToken] = this.rotateToken(req, {
      id,
      role,
      remember,
    });
    // Save access token in cookie
    res.cookie(...this.cookie('ACCESS', accessToken, remember));
    // Save refresh token in cookie
    res.cookie(...this.cookie('REFRESH', refreshToken, remember));

    this.statusToken(res, self);

    // Store session with user and access token
    await this.storeSession(req, {
      user: self,
      accessToken,
      refreshToken,
    });

    res.status(StatusCodes.OK).json({
      status: ReasonPhrases.OK,
      message: `Welcome back ${profile?.displayName}.`,
      payload: {
        accessToken,
        refreshToken,
        role,
      },
    });
  };

  public refreshToken: RequestHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const refreshCookie =
      req.cookies[COOKIES.REFRESH] || this.extractToken(req);

    if (!refreshCookie) {
      return this.clearCookies(res);
    }

    const decode = jwt.verify(refreshCookie, config.REFRESH_TOKEN) as Signature;
    const { remember, id, role, token } = decode;

    const hasedToken = Crypto.hmac(refreshCookie, config.HMAC_SECRET);
    const isActive = await redisClient.SISMEMBER(`${id}:refresh`, hasedToken);

    if (!isActive) {
      this.clearCookies(res);
      return next(
        createError(
          StatusCodes.UNAUTHORIZED,
          'Your session has expired. Please log in again.',
        ),
      );
    }

    const [accessToken, refreshToken] = this.rotateToken(req, {
      id: id,
      role: role,
      remember: remember,
    });

    res.cookie(...this.cookie('ACCESS', accessToken, remember));
    res.cookie(...this.cookie('REFRESH', refreshToken, remember));

    await this.rotateSession({
      id,
      oldToken: token,
      newToken: accessToken,
      oldRefreshToken: hasedToken,
      newRefreshToken: refreshToken,
    });

    res.status(StatusCodes.OK).json({
      status: ReasonPhrases.OK,
      message: 'Token refreshed successfully.',
      payload: {
        accessToken,
        refreshToken,
      },
    });
  };

  public signout: RequestHandler = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    // Get the currently authenticated user and accessToken from the request
    const { accessToken, self } = req;

    // Remove the user's session using their ID and hashed access token
    await this.removeASession({
      id: self._id,
      token: Crypto.hmac(accessToken, config.HMAC_SECRET),
    });

    this.clearCookies(res);

    // Send a success response to the client indicating signout is complete
    res.status(StatusCodes.OK).json({
      status: ReasonPhrases.OK,
      message: 'You have been successfully signed out.',
    });
  };

  public signoutSession: RequestHandler = async (
    req: SignoutARequest,
    res: Response,
  ): Promise<void> => {
    // Extract the session token from the request parameters
    const { token } = req.params;

    // Get the currently authenticated user from the request
    const user = req.self;

    // Remove the specific session associated with this user and token
    await this.removeASession({
      id: user._id,
      token: token ?? '',
    });

    // Send a success response to the client indicating the session logout is complete
    res.status(StatusCodes.OK).json({
      status: ReasonPhrases.OK,
      message: 'You have been successfully logged out.',
    });
  };

  public signoutAllSession: RequestHandler = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    // Get the currently authenticated user from the request
    const user = req.self;

    // Remove all sessions for this user except the current one
    await this.removeOtherSessions({
      id: user.id,
      accessToken: req.accessToken,
    });

    // Send a success response to the client indicating all other sessions have been logged out
    res.status(StatusCodes.OK).json({
      status: ReasonPhrases.OK,
      message: 'You have been successfully logged out.',
    });
  };

  public findProfile: RequestHandler = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const user = req.self;

    this.statusToken(res, user);

    res.status(StatusCodes.OK).json({
      status: ReasonPhrases.OK,
      message: 'Profile retrieved successfully',
      payload: { user },
    });
  };

  public updateProfile: RequestHandler = async (
    req: UpdateProfileRequest,
    res: Response,
  ): Promise<void> => {
    const { familyName, givenName, avatar } = req.body.profile;
    const public_id = req.self.profile.avatar?.public_id;

    const replaceTag = () =>
      avatar?.public_id
        ? cloudinary.uploader.replace_tag('verified', [avatar.public_id])
        : Promise.resolve();
    const destroy = () =>
      public_id
        ? cloudinary.uploader.destroy(String(public_id))
        : Promise.resolve();

    await Promise.all([pRetry(replaceTag), pRetry(destroy)]);

    const user = await this.model.findByIdAndUpdate(
      req.self._id,
      {
        $set: {
          'profile.familyName': familyName,
          'profile.givenName': givenName,
          'profile.avatar': avatar,
        },
      },
      { returnDocument: 'after' },
    );

    if (user) {
      await this.refreshCache(user);
    }

    res.status(StatusCodes.OK).json({
      status: ReasonPhrases.OK,
      message: 'Your profile updated successfully',
    });
  };

  public findSessions: RequestHandler = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const sessions = await SessionModel.find({ user: req.self._id })
      .sort({ loggedInAt: -1 })
      .lean();

    res.status(StatusCodes.OK).json({
      status: ReasonPhrases.OK,
      message: 'User sessions retrieved successfully',
      payload: {
        sessions: sessions,
      },
    });
  };

  public forgotPassword =
    (ROLE: Role[]): RequestHandler =>
    async (
      req: ForgotPasswordRequest,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      const user = await this.model.findOne({
        $and: [{ 'profile.email': req.body.email }, { role: { $in: ROLE } }],
      });

      if (!user) {
        // No matching account — respond with the generic message, don't reveal that.
        res.status(StatusCodes.OK).json({
          status: ReasonPhrases.OK,
          message:
            'Password reset link has been sent to your email. Please check your inbox (and spam folder) for instructions.',
        });
      } else {
        // Issues (or replaces) the reset token; hashed + TTL'd in PasswordResetModel.
        const resetToken = await PasswordResetModel.issueResetToken(user.id);

        const payload = {
          user: {
            name: user.profile?.displayName,
            email: user.profile?.email,
          },
          resetUrl: `${req.headers.origin}/forgot-password/${resetToken}/reset`,
          clientInfo: this.getDevice(req as Request),
        };

        try {
          await new SendEmail(payload).forgotPassword();
          res.status(StatusCodes.OK).json({
            status: ReasonPhrases.OK,
            message:
              'Password reset link has been sent to your email. Please check your inbox (and spam folder) for instructions.',
          });
        } catch (error) {
          // Email failed to send — don't leave a live, unusable token behind.
          await PasswordResetModel.findOneAndDelete({ userId: user.id });
          next(error);
        }
      }
    };

  public resetPassword: RequestHandler = async (
    req: ResetPasswordRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const token = await PasswordResetModel.verifyResetToken(
      String(req.params.token),
    );

    if (!token) {
      return next(
        createError(
          StatusCodes.BAD_REQUEST,
          'The password reset link has expired or is invalid. Please request a new one.',
        ),
      );
    }

    const user = await this.model.findById(token.userId);

    if (!user) {
      return next(
        createError(
          StatusCodes.NOT_FOUND,
          'The user associated with this password reset request was not found.',
        ),
      );
    }

    const hashedPassword = await hash(req.body.newPassword, 12);

    const session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        user.auth.password = hashedPassword;
        await user.save({ session });
        await PasswordResetModel.deleteOne({ _id: token._id }, { session });
        await this.restatusToken({ id: user.id }, session);
      });
    } catch (err) {
      return next(err);
    } finally {
      await session.endSession();
    }

    res.status(StatusCodes.OK).json({
      status: ReasonPhrases.OK,
      message: 'Your password has been successfully reset.',
    });
  };

  public changePassword: RequestHandler = async (
    req: ChangePasswordRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const { currentPassword, newPassword } = req.body;

    const user = await this.model
      .findById(req.self?._id)
      .select('+auth.password');

    // Check if user exists and password is valid
    const isValid = await user?.checkPassword(currentPassword);

    if (!user || !isValid) {
      return next(
        createError(
          StatusCodes.UNAUTHORIZED,
          'The current password you entered is incorrect. Please double-check and try again.',
        ),
      );
    }

    if (await user?.checkPassword(newPassword)) {
      return next(
        createError(
          StatusCodes.BAD_REQUEST,
          'New password must be different from the current password.',
        ),
      );
    }

    const hashedPassword = await hash(newPassword, 12);

    const session = await this.model.startSession();

    try {
      await session.withTransaction(async () => {
        user.auth.password = hashedPassword;
        await user.save({ session });
        await this.restatusToken({ id: user.id }, session);
      });
    } catch (err) {
      return next(err);
    } finally {
      await session.endSession();
    }

    this.clearCookies(res);

    res.status(StatusCodes.OK).json({
      status: ReasonPhrases.OK,
      message:
        'Your password has been updated successfully. Please use your new password the next time you log in.',
    });
  };

  public requestEmailChange: RequestHandler = async (
    req: RequestEmailChangeRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const { newEmail, password } = req.body;

    const exists = await this.model.exists({
      'profile.email': newEmail,
    });

    if (exists) {
      return next(
        createError(
          StatusCodes.NOT_FOUND,
          'This email is already in use by another account.',
        ),
      );
    }

    const user = await this.model
      .findById(req.self?._id)
      .select('+auth.password');

    const isValid = await user?.checkPassword(password);
    if (!user || !isValid) {
      return next(
        createError(
          StatusCodes.UNAUTHORIZED,
          'The current password you entered is incorrect. Please double-check and try again.',
        ),
      );
    }

    const device = this.getDevice(req as Request);

    const clientMeta = {
      ip: device.ip,
      location: `${device.city}, ${device.country}`,
      device: device?.os,
      oldEmail: user.profile.email,
      newEmail: newEmail,
    };

    const { token, otp } = await this.OTP(clientMeta);

    const newEmailPayload = {
      user: {
        name: user.profile.displayName,
        email: newEmail ?? '',
      },
      url: `${req.headers.origin}/sessions/email/change/confirm/${token}?redirect=${encodeURIComponent('/sign-in')}`,
      ...clientMeta,
    };

    const oldEmailPayload = {
      user: {
        name: user.profile?.displayName,
        email: user.profile?.email,
      },
      otp: otp,
      ...clientMeta,
    };

    await Promise.all([
      new SendEmail(oldEmailPayload).emailChangeAlert(),
      new SendEmail(newEmailPayload).emailChangeRequest(),
    ]);

    res.status(StatusCodes.OK).json({
      status: ReasonPhrases.OK,
      message:
        'Verification emails have been sent to both your old and new email addresses. Please check your inboxes to confirm the email update.',
    });
  };

  public confirmEmailChange: RequestHandler = async (
    req: ConfirmEmailChangeRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const { code } = req.body;
    const token = req.params.token;

    const { encrypted } = jwt.verify(
      String(token),
      config.ACTIVATION_SECRET,
    ) as {
      encrypted: Decipheriv;
    };

    const { oldEmail, newEmail, otp } = await Crypto.decipheriv<{
      oldEmail: string;
      newEmail: string;
      otp: string;
    }>(encrypted, config.CRYPTO_SECRET);

    const aBuf = String(code);
    const bBuf = String(otp);

    const isValid = Crypto.safeCompare(aBuf, bBuf);
    if (!isValid) {
      return next(
        createError(
          StatusCodes.BAD_REQUEST,
          'The OTP you entered does not match. Please double-check the code and try again.',
        ),
      );
    }

    const user = await this.model.findOneAndUpdate(
      { 'profile.email': oldEmail },
      { $set: { 'profile.email': newEmail } },
      {
        returnDocument: 'after',
      },
    );

    if (user) {
      await this.refreshCache(user);
    }

    res.status(StatusCodes.OK).json({
      status: ReasonPhrases.OK,
      message: 'Your email has been successfully updated.',
    });
  };

  public reauthRequest: RequestHandler = async (
    req: ReauthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    // Currently authenticated user's id
    const { id } = req.self;
    const { password } = req.body;

    // Fetch user with password hash included
    const user = await this.model.findById(id).select('+auth.password').exec();

    // Verify the submitted password against the stored hash
    const isValid = await user?.checkPassword(password);

    if (!user || !isValid) {
      // Reject if user doesn't exist or password is wrong
      return next(
        createError(StatusCodes.UNAUTHORIZED, 'Incorrect password. Try again.'),
      );
    }

    // Encrypt the user id so it's opaque inside the JWT
    const encrypted = await Crypto.cipheriv(id, config.CRYPTO_SECRET);

    // Sign the encrypted payload into a JWT with a short 3hours expiry
    const token = jwt.sign(
      { encrypted, isReauth: true },
      config.ACTIVATION_SECRET,
      {
        expiresIn: '3h',
      },
    );

    // Store a verify flag in Redis so a stolen JWT alone isn't enough
    await redisClient.setEx(`reauth:${id}`, 3 * 60 * 60, '1');

    // Set the REAUTH cookie so subsequent sensitive actions can verify recent auth
    res.cookie(...this.cookie('REAUTH', token, false));

    res.status(StatusCodes.OK).json({
      status: ReasonPhrases.OK,
      message: 'Re-authentication request successful.',
    });
  };

  public challenge: RequestHandler = async (
    req: ChallengeRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    // Currently authenticated user's id
    const { id } = req.self;
    const { password } = req.body;

    // Fetch user with password hash included
    const user = await this.model.findById(id).select('+auth.password').exec();

    // Verify the submitted password against the stored hash
    const isValid = await user?.checkPassword(password);

    if (!user || !isValid) {
      // Reject if user doesn't exist or password is wrong
      return next(
        createError(StatusCodes.UNAUTHORIZED, 'Incorrect password. Try again.'),
      );
    }

    // Encrypt the user id so it's opaque inside the JWT
    const encrypted = await Crypto.cipheriv(id, config.CRYPTO_SECRET);

    // Sign the encrypted payload into a JWT with a short 3 minutes expiry
    const token = jwt.sign(
      { encrypted, challenge: true },
      config.ACTIVATION_SECRET,
      {
        expiresIn: '3m',
      },
    );

    // Store a verify flag in Redis so a stolen JWT alone isn't enough
    await redisClient.setEx(`challenge:${id}`, 3 * 60, '1');

    // Set the REAUTH cookie so subsequent sensitive actions can verify recent auth
    res.cookie(...this.cookie('CHALLENGE', token, false));

    res.status(StatusCodes.OK).json({
      status: ReasonPhrases.OK,
      message: 'Re-authentication request successful.',
    });
  };
}
