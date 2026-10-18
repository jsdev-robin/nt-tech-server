import { Role } from '@server/types';
import express, { type Router } from 'express';
import { validationRequest } from 'express-zod-guard';
import {
  authController,
  authPasskeyController,
  authProtect,
  authTwoFaController,
} from '../../controllers/authController';
import { limiter } from '../../middlewares/limiter';
import { ZAuthSchema } from '../../validations/auth/ZAuthSchema';
import { ZPasskeySchema } from '../../validations/auth/ZPasskeySchema';
import { ZTwoFaSchema } from '../../validations/auth/ZTwoFaSchema';

const router: Router = express.Router();

// ============================== Public Routes ==========================
router.post(
  '/signup',
  limiter(60 * 1000, 5),
  validationRequest(ZAuthSchema.signup),
  authController.signup([Role.CUSTOMER]),
);

router.post(
  '/verify',
  limiter(60 * 1000, 5),
  validationRequest(ZAuthSchema.verify),
  authController.verify(Role.CUSTOMER),
);

router.post(
  '/signin',
  limiter(60 * 1000, 5),
  validationRequest(ZAuthSchema.signin),
  authController.signin([Role.CUSTOMER, Role.ADMIN, Role.AGENT]),
  authController.isTwoFa,
  authController.createSession,
);

router.post('/refresh-token', authController.refreshToken);

router.post(
  '/forgot-password',
  limiter(60 * 1000, 5),
  validationRequest(ZAuthSchema.forgotPassword),
  authController.signin([Role.CUSTOMER, Role.ADMIN, Role.AGENT]),
);

router.patch(
  '/reset-password/:token',
  limiter(60 * 1000, 5),
  validationRequest(ZAuthSchema.resetPassword),
  authController.resetPassword,
);

// ============================== Passkey Public routes =======================
router.post(
  '/passkey/authentication/generate',
  limiter(60 * 1000, 5),
  validationRequest(ZPasskeySchema.generateAuthentication),
  authPasskeyController.generateAuthentication([
    Role.CUSTOMER,
    Role.ADMIN,
    Role.AGENT,
  ]),
);
router.post(
  '/passkey/authentication/verify',
  limiter(60 * 1000, 5),
  validationRequest(ZPasskeySchema.verifyAuthentication),
  authPasskeyController.verifyAuthentication,
  authController.createSession,
);

// ============================== 2FA Protect routes =======================
router.post(
  '/twofa/verify/token',
  limiter(60 * 1000, 5),
  validationRequest(ZTwoFaSchema.verifyToken),
  authTwoFaController.verifyToken,
  authController.createSession,
);
router.post(
  '/twofa/verify/backup',
  limiter(60 * 1000, 5),
  validationRequest(ZTwoFaSchema.verifyBackup),
  authTwoFaController.verifyBackup,
  authController.createSession,
);

// ============================== userProtected Routes =======================
router.use(
  authProtect.validateToken,
  authProtect.requireAuth,
  authProtect.restrictTo([Role.CUSTOMER, Role.ADMIN, Role.AGENT]),
);
router
  .route('/profile')
  .get(authController.findProfile)
  .patch(
    validationRequest(ZAuthSchema.updateProfile),
    authController.updateProfile,
  );
router.route('/sessions').get(authController.findSessions);
router.post('/signout', authController.signout);
router.post(
  '/signout/:token',
  validationRequest(ZAuthSchema.signoutSession),
  authController.signoutSession,
);
router.post('/signout-all', authController.signoutAllSession);

router.patch(
  '/password/change',
  validationRequest(ZAuthSchema.chanagePassword),
  authController.changePassword,
);

// ============================== Passkey Protect routes =======================
router
  .route('/passkey/registration/generate')
  .all(authProtect.reauthVerify)
  .post(authPasskeyController.generateRegistration);

router
  .route('/passkey/registration/verify')
  .all(authProtect.reauthVerify)
  .post(
    validationRequest(ZPasskeySchema.verifyRegistration),
    authPasskeyController.verifyRegistration,
  );

router
  .route('/passkey')
  .all(authProtect.reauthVerify)
  .get(authPasskeyController.findKeys);

router.delete(
  '/passkey/:id',
  authProtect.reauthVerify,
  validationRequest(ZPasskeySchema.unregister),
  authPasskeyController.unregister,
);

// ============================== Email Change routes =======================
router.post(
  '/email/change/request',
  validationRequest(ZAuthSchema.requestEmailChange),
  authController.requestEmailChange,
);
router.patch(
  '/email/change/confirm/:token',
  validationRequest(ZAuthSchema.confirmEmailChange),
  authController.confirmEmailChange,
);

// ============================== 2FA Protect routes =======================
router
  .route('/twofa/setup/request')
  .all(authProtect.reauthVerify)
  .get(authTwoFaController.request);
router.patch(
  '/twofa/setup/confirm',
  validationRequest(ZTwoFaSchema.confirm),
  authTwoFaController.confirm,
);
router
  .route('/twofa/backup-codes')
  .all(authProtect.reauthVerify)
  .patch(authTwoFaController.createBackup)
  .get(authTwoFaController.findBackup);
router
  .route('/twofa/disable')
  .all(authProtect.reauthVerify)
  .patch(authTwoFaController.disabled);

// ============================== ReAuth =======================
router
  .route('/reauth')
  .post(
    validationRequest(ZAuthSchema.reauthRequest),
    authController.reauthRequest,
  );

router.post(
  '/passkey/reauth/registration/generate',
  authPasskeyController.generatReauthentication,
);
router.post(
  '/passkey/reauth/registration/verify',
  validationRequest(ZPasskeySchema.verifyReuthentication),
  authPasskeyController.verifyReauthentication,
);

// ============================== Challenge =======================
router
  .route('/challenge')
  .post(validationRequest(ZAuthSchema.challenge), authController.challenge);

router.post(
  '/passkey/challenge/registration/generate',
  authPasskeyController.generateChallenge,
);
router.post(
  '/passkey/challenge/registration/verify',
  validationRequest(ZPasskeySchema.verifyChallenge),
  authPasskeyController.verifyChallenge,
);

export default router;
