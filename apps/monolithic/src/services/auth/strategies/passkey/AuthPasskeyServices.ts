import { Role, type IUser } from '@server/types';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { randomBytes } from 'crypto';
import {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import createError from 'http-errors';
import { ReasonPhrases, StatusCodes } from 'http-status-codes';
import jwt from 'jsonwebtoken';
import { Model } from 'mongoose';
import { Crypto } from 'node-encryptor';
import { config } from '../../../../configs/configs';
import { redisClient } from '../../../../configs/redis';
import { PasskeyModel } from '../../../../models/auth/passkey/PasskeyModel';
import { AuthEngine } from '../../engine/AuthEngine';
import {
  type GenerateAuthenticationRequest,
  type UnregisterRequest,
  type VerifyAuthenticationRequest,
  type VerifyChallengeRequest,
  type VerifyReauthenticationRequest,
  type VerifyRegistrationRequest,
} from './types';

export class AuthPasskeyServices extends AuthEngine {
  constructor(options: { model: Model<IUser> }) {
    super(options);
  }

  public generateRegistration: RequestHandler = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    // Get the current user from request
    const user = req.self;

    // Fetch existing passkeys for the user
    const passkey = await PasskeyModel.find({
      internalUserId: req.self._id,
    });

    const options = await generateRegistrationOptions({
      rpName: config.RP_NAME,
      rpID: config.DOMAIN,
      userID: Buffer.from(user.id, 'hex'),
      challenge: randomBytes(32).toString('base64url'),
      userName: user.profile.familyName,
      userDisplayName: user.profile.familyName + ' ' + user.profile.givenName,
      timeout: 60000,
      attestationType: 'none',
      excludeCredentials: passkey?.map((pk) => ({
        id: pk.credId,
        transports: pk.transports,
      })),
      authenticatorSelection: {
        authenticatorAttachment: undefined,
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    // Store challenge in Redis with a TTL of 60 seconds
    await redisClient.setEx(
      `reg_challenge:${user._id}`,
      60,
      JSON.stringify({ challenge: options.challenge }),
    );

    // Send registration options to client
    res.status(StatusCodes.OK).json({
      status: ReasonPhrases.OK,
      message:
        'Ready to set up your passkey. Follow the next steps to complete registration.',
      payload: options,
    });
  };

  public verifyRegistration: RequestHandler = async (
    req: VerifyRegistrationRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    // Extract credential data from request body
    const { response } = req.body;

    // Get the currently authenticated user
    const user = req.self;

    // Retrieve the stored registration challenge from Redis
    const storedChallenge = await redisClient.get(`reg_challenge:${user._id}`);

    // Handle case when challenge is not found
    if (!storedChallenge) {
      return next(
        createError(
          StatusCodes.NOT_FOUND,
          'No registration challenge found. Please restart the registration process.',
        ),
      );
    }

    // Parse the stored challenge
    const { challenge } = JSON.parse(storedChallenge);

    // Verify the registration response using WebAuthn
    const verification = await verifyRegistrationResponse({
      response: response,
      expectedChallenge: challenge,
      expectedOrigin: String(req.headers.origin),
      expectedRPID: config.DOMAIN,
    });

    const { verified, registrationInfo } = verification;

    // Handle failed verification
    if (!verified || !registrationInfo) {
      return next(
        createError(
          StatusCodes.UNAUTHORIZED,
          'Passkey registration could not be verified. Please try again.',
        ),
      );
    }

    const { credential, credentialDeviceType, credentialBackedUp } =
      registrationInfo;

    const device = this.getDevice(req as Request);

    await PasskeyModel.create({
      internalUserId: req.self._id,
      credId: credential.id,
      credPublicKey: Buffer.from(credential.publicKey).toString('hex'),
      webauthnUserId: Buffer.from(user.id, 'hex'),
      counter: credential.counter,
      backupEligible: credentialDeviceType === 'multiDevice',
      backupStatus: credentialBackedUp,
      transports: credential.transports,
      device: credentialDeviceType,
      browser: device.browser,
      os: device.os,
    });

    // Update user session with passkey information
    const newSession = await this.model
      ?.findByIdAndUpdate(
        user._id,
        {
          $set: {
            'auth.passkey.isEnabled': true,
            'auth.passkey.enabledAt': new Date(),
          },
          $inc: {
            'auth.passkey.count': 1,
          },
        },
        {
          returnDocument: 'after',
        },
      )
      .exec();

    // Update Redis: remove used challenge and store updated session
    if (newSession) {
      await redisClient.del(`reg_challenge:${user._id}`);
      await this.refreshCache(newSession);
      this.statusToken(res, user);
    }

    // Send success response to client
    res.status(StatusCodes.OK).json({
      status: ReasonPhrases.OK,
      message:
        'Your passkey has been successfully registered and is ready to use.',
    });
  };

  public generateAuthentication =
    (ROLE: Role[]): RequestHandler =>
    async (
      req: GenerateAuthenticationRequest,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      const { email } = req.body;

      // Find user by email
      const user = await this.model?.findOne({
        $and: [
          { 'profile.email': email },
          { 'auth.passkey.isEnabled': true },
          { role: { $in: ROLE } },
        ],
      });

      // Handle case when user is not found
      if (!user) {
        return next(
          createError(
            StatusCodes.NOT_FOUND,
            'No passkeys are registered for this account. Please register a passkey first.',
          ),
        );
      }

      // Fetch registered passkeys for the user
      const passkeys = await PasskeyModel.find({
        internalUserId: user?._id,
      });

      // Handle case when user has no passkeys
      if (!passkeys) {
        return next(
          createError(
            StatusCodes.BAD_REQUEST,
            'No passkeys registered for this account. Please register a passkey first.',
          ),
        );
      }

      // Generate WebAuthn authentication options
      const options = await generateAuthenticationOptions({
        rpID: config.DOMAIN,
        allowCredentials: passkeys?.map((pk) => ({
          id: pk.credId,
          transports: pk.transports,
        })),
        userVerification: 'preferred',
      });

      // Save authentication challenge in Redis with TTL
      await redisClient.setEx(
        `auth_challenge:${user._id}`,
        60,
        JSON.stringify({ challenge: options.challenge }),
      );

      res.status(StatusCodes.OK).json({
        status: ReasonPhrases.OK,
        message:
          'Passkey authentication initiated! Follow the instructions to securely sign in.',
        payload: {
          options,
        },
      });
    };

  public verifyAuthentication: RequestHandler = async (
    req: VerifyAuthenticationRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const { response } = req.body;

    const passkey = await PasskeyModel.findOne({
      credId: response.id,
    });

    if (!passkey) {
      return next(
        createError(
          StatusCodes.UNAUTHORIZED,
          'No passkeys are registered for this account. Please register a passkey first.',
        ),
      );
    }

    const storedChallenge = await redisClient.get(
      `auth_challenge:${passkey.internalUserId}`,
    );

    if (!storedChallenge) {
      return next(
        createError(
          StatusCodes.UNAUTHORIZED,
          'Challenge not found. Please restart the authentication process.',
        ),
      );
    }

    const { challenge } = JSON.parse(storedChallenge);

    const verification = await verifyAuthenticationResponse({
      response: response,
      expectedChallenge: challenge,
      expectedOrigin: String(req.headers.origin),
      expectedRPID: config.DOMAIN,
      credential: {
        id: passkey.credId,
        publicKey: new Uint8Array(Buffer.from(passkey.credPublicKey, 'hex')),
        counter: passkey.counter,
        transports: passkey.transports,
      },
    });

    const { verified, authenticationInfo } = verification;

    if (!verified || !authenticationInfo) {
      return next(
        createError(
          StatusCodes.UNAUTHORIZED,
          'Authentication verification failed. Please try again.',
        ),
      );
    }

    await PasskeyModel.findOneAndUpdate(
      { credId: response.id },
      {
        $set: {
          counter: authenticationInfo.newCounter,
          lastUsed: new Date(),
        },
      },
    );

    await redisClient.del(`auth_challenge:${passkey.internalUserId}`);

    const user = await this.model?.findOne({ _id: passkey.internalUserId });

    if (!user) {
      return next(createError(StatusCodes.UNAUTHORIZED, 'No account found.'));
    }

    req.self = user;
    req.remember = true;

    next();
  };

  public unregister: RequestHandler = async (
    req: UnregisterRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const session = await PasskeyModel.startSession();

    try {
      session.startTransaction();

      const passkey = await PasskeyModel.findByIdAndDelete(
        req.params.id,
      ).session(session);

      if (!passkey) {
        await session.abortTransaction();
        session.endSession();
        return next(
          createError(
            StatusCodes.NOT_FOUND,
            'No passkey found. Please try again.',
          ),
        );
      }

      const user = await this.model
        ?.findByIdAndUpdate(
          req.self._id,
          [
            {
              $set: {
                'auth.passkey.count': {
                  $max: [{ $subtract: ['$auth.passkey.count', 1] }, 0],
                },
                'auth.passkey.isEnabled': {
                  $gt: [{ $subtract: ['$auth.passkey.count', 1] }, 0],
                },
                'auth.passkey.enabledAt': {
                  $cond: [
                    { $gt: [{ $subtract: ['$auth.passkey.count', 1] }, 0] },
                    '$auth.passkey.enabledAt',
                    '$$REMOVE',
                  ],
                },
              },
            },
          ],
          {
            returnDocument: 'after',
            updatePipeline: true,
          },
        )
        .session(session);

      await session.commitTransaction();
      session.endSession();

      if (user) {
        await this.refreshCache(user);
        this.statusToken(res, user);
      }

      res.status(StatusCodes.NO_CONTENT).send();
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      return next(error);
    }
  };

  public findKeys: RequestHandler = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const user = req.self;

    const passkeys = await PasskeyModel.find({
      internalUserId: user._id,
    }).select('transports device browser counter os lastUsed createdAt');

    res.status(StatusCodes.OK).json({
      status: ReasonPhrases.OK,
      message: 'Passkey information retrieved successfully.',
      payload: {
        passkeys,
      },
    });
  };

  public generatReauthentication: RequestHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const { profile } = req.self;

    // Find user by email
    const user = await this.model?.findOne({
      $and: [
        { 'profile.email': profile.email },
        { 'auth.passkey.isEnabled': true },
      ],
    });

    // Handle case when user is not found
    if (!user) {
      return next(
        createError(
          StatusCodes.NOT_FOUND,
          'No passkeys are registered for this account. Please register a passkey first.',
        ),
      );
    }

    // Fetch registered passkeys for the user
    const passkeys = await PasskeyModel.find({
      internalUserId: user?._id,
    });

    // Handle case when user has no passkeys
    if (!passkeys) {
      return next(
        createError(
          StatusCodes.BAD_REQUEST,
          'No passkeys registered for this account. Please register a passkey first.',
        ),
      );
    }

    // Generate WebAuthn authentication options
    const options = await generateAuthenticationOptions({
      rpID: config.DOMAIN,
      allowCredentials: passkeys?.map((pk) => ({
        id: pk.credId,
        transports: pk.transports,
      })),
      userVerification: 'preferred',
    });

    // Save authentication challenge in Redis with TTL
    await redisClient.setEx(
      `reauth_challenge:${user._id}`,
      60,
      JSON.stringify({ challenge: options.challenge }),
    );

    res.status(StatusCodes.OK).json({
      status: ReasonPhrases.OK,
      message:
        'Passkey authentication initiated! Follow the instructions to securely sign in.',
      payload: {
        options,
      },
    });
  };

  public verifyReauthentication: RequestHandler = async (
    req: VerifyReauthenticationRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const { response } = req.body;

    const passkey = await PasskeyModel.findOne({
      credId: response.id,
    });

    if (!passkey) {
      return next(
        createError(
          StatusCodes.UNAUTHORIZED,
          'No passkeys are registered for this account. Please register a passkey first.',
        ),
      );
    }

    const storedChallenge = await redisClient.get(
      `reauth_challenge:${passkey.internalUserId}`,
    );

    if (!storedChallenge) {
      return next(
        createError(
          StatusCodes.UNAUTHORIZED,
          'Challenge not found. Please restart the authentication process.',
        ),
      );
    }

    const { challenge } = JSON.parse(storedChallenge);

    const verification = await verifyAuthenticationResponse({
      response: response,
      expectedChallenge: challenge,
      expectedOrigin: String(req.headers.origin),
      expectedRPID: config.DOMAIN,
      credential: {
        id: passkey.credId,
        publicKey: new Uint8Array(Buffer.from(passkey.credPublicKey, 'hex')),
        counter: passkey.counter,
        transports: passkey.transports,
      },
    });

    const { verified, authenticationInfo } = verification;

    if (!verified || !authenticationInfo) {
      return next(
        createError(
          StatusCodes.UNAUTHORIZED,
          'Authentication verification failed. Please try again.',
        ),
      );
    }

    await PasskeyModel.findOneAndUpdate(
      { credId: response.id },
      {
        $set: {
          counter: authenticationInfo.newCounter,
          lastUsed: new Date(),
        },
      },
    );

    await redisClient.del(`reauth_challenge:${passkey.internalUserId}`);

    const user = await this.model?.findOne({ _id: passkey.internalUserId });

    if (!user) {
      return next(createError(StatusCodes.UNAUTHORIZED, 'No account found.'));
    }

    const { id } = user;

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

  public generateChallenge: RequestHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const { profile } = req.self;

    // Find user by email
    const user = await this.model?.findOne({
      $and: [
        { 'profile.email': profile.email },
        { 'auth.passkey.isEnabled': true },
      ],
    });

    // Handle case when user is not found
    if (!user) {
      return next(
        createError(
          StatusCodes.NOT_FOUND,
          'No passkeys are registered for this account. Please register a passkey first.',
        ),
      );
    }

    // Fetch registered passkeys for the user
    const passkeys = await PasskeyModel.find({
      internalUserId: user?._id,
    });

    // Handle case when user has no passkeys
    if (!passkeys) {
      return next(
        createError(
          StatusCodes.BAD_REQUEST,
          'No passkeys registered for this account. Please register a passkey first.',
        ),
      );
    }

    // Generate WebAuthn authentication options
    const options = await generateAuthenticationOptions({
      rpID: config.DOMAIN,
      allowCredentials: passkeys?.map((pk) => ({
        id: pk.credId,
        transports: pk.transports,
      })),
      userVerification: 'preferred',
    });

    // Save challenge in Redis with TTL
    await redisClient.setEx(
      `challenge_verify:${user._id}`,
      60,
      JSON.stringify({ challenge: options.challenge }),
    );

    res.status(StatusCodes.OK).json({
      status: ReasonPhrases.OK,
      message:
        "Passkey verification initiated! Follow the instructions to confirm it's you.",
      payload: {
        options,
      },
    });
  };

  public verifyChallenge: RequestHandler = async (
    req: VerifyChallengeRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const { response } = req.body;

    const passkey = await PasskeyModel.findOne({
      credId: response.id,
    });

    if (!passkey) {
      return next(
        createError(
          StatusCodes.UNAUTHORIZED,
          'No passkeys are registered for this account. Please register a passkey first.',
        ),
      );
    }

    const storedChallenge = await redisClient.get(
      `challenge_verify:${passkey.internalUserId}`,
    );

    if (!storedChallenge) {
      return next(
        createError(
          StatusCodes.UNAUTHORIZED,
          'Challenge not found. Please restart the authentication process.',
        ),
      );
    }

    const { challenge } = JSON.parse(storedChallenge);

    const verification = await verifyAuthenticationResponse({
      response: response,
      expectedChallenge: challenge,
      expectedOrigin: String(req.headers.origin),
      expectedRPID: config.DOMAIN,
      credential: {
        id: passkey.credId,
        publicKey: new Uint8Array(Buffer.from(passkey.credPublicKey, 'hex')),
        counter: passkey.counter,
        transports: passkey.transports,
      },
    });

    const { verified, authenticationInfo } = verification;

    if (!verified || !authenticationInfo) {
      return next(
        createError(
          StatusCodes.UNAUTHORIZED,
          'Authentication verification failed. Please try again.',
        ),
      );
    }

    await PasskeyModel.findOneAndUpdate(
      { credId: response.id },
      {
        $set: {
          counter: authenticationInfo.newCounter,
          lastUsed: new Date(),
        },
      },
    );

    await redisClient.del(`challenge_verify:${passkey.internalUserId}`);

    const user = await this.model?.findOne({ _id: passkey.internalUserId });

    if (!user) {
      return next(createError(StatusCodes.UNAUTHORIZED, 'No account found.'));
    }

    const { id } = user;

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

    // Set the CHALLENGE cookie so subsequent sensitive actions can verify recent auth
    res.cookie(...this.cookie('CHALLENGE', token, false));

    res.status(StatusCodes.OK).json({
      status: ReasonPhrases.OK,
      message: 'Re-authentication request successful.',
    });
  };
}
