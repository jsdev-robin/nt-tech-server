import { ACCESS_TTL, CookieService, REFRESH_TTL } from '@server/protect';
import { IUser, Role } from '@server/types';
import { Request } from 'express';
import { UserAgent } from 'express-useragent';
import jwt from 'jsonwebtoken';
import { Model, Types } from 'mongoose';
import { Crypto } from 'node-encryptor';
import { config } from '../../../configs/configs';

export interface Signature {
  ip: string;
  browser: string;
  device: string;
  id: string;
  linkedTo: Types.ObjectId;
  role: Role[];
  remember: boolean;
  token: string;
}

export class TokenService extends CookieService {
  protected readonly model: Model<IUser>;
  constructor(options: { model: Model<IUser> }) {
    super();
    this.model = options.model;
  }

  protected getDevice = (req: Request) => {
    // Get the user agent object from the request (requires useragent middleware)
    const ua = new UserAgent().hydrate(String(req.headers['user-agent'])).Agent;

    // Determine the device type based on user agent flags
    let deviceType: string;

    switch (true) {
      case ua?.isSmartTV:
        deviceType = 'smart-tv';
        break;
      case ua?.isBot:
        deviceType = 'bot';
        break;
      case ua?.isMobileNative:
        deviceType = 'mobile-native';
        break;
      case ua?.isMobile:
        deviceType = 'mobile';
        break;
      case ua?.isTablet:
        deviceType = 'tablet';
        break;
      case ua?.isAndroidTablet:
        deviceType = 'android-tablet';
        break;
      case ua?.isiPad:
        deviceType = 'ipad';
        break;
      case ua?.isiPhone:
        deviceType = 'iphone';
        break;
      case ua?.isiPod:
        deviceType = 'ipod';
        break;
      case ua?.isKindleFire:
        deviceType = 'kindle-fire';
        break;
      case ua?.isDesktop:
        deviceType = 'desktop';
        break;
      case ua?.isWindows:
        deviceType = 'windows';
        break;
      case ua?.isMac:
        deviceType = 'mac';
        break;
      case ua?.isLinux:
        deviceType = 'linux';
        break;
      case ua?.isChromeOS:
        deviceType = 'chromeos';
        break;
      case ua?.isRaspberry:
        deviceType = 'raspberry-pi';
        break;
      default:
        deviceType = 'unknown';
    }

    return {
      deviceType,
      os: ua?.os ?? 'unknown',
      version: ua?.version ?? 'unknown',
      browser: ua?.browser ?? 'unknown',
      userAgent: req.headers['user-agent'] ?? 'unknown',
      ip: req.ip,
      location: req.ipinfo?.location,
      date: Date.now(),
      ...this.getLocation(req),
    };
  };

  protected getLocation = (req: Request) => ({
    city: req.ipinfo?.city || 'unknown',
    country: req.ipinfo?.country || 'unknown',
    lat: Number(req.ipinfo?.loc?.split(',')[0]) || 0,
    lng: Number(req.ipinfo?.loc?.split(',')[1]) || 0,
  });

  private signature(
    req: Request,
    user: {
      id: string;
      role: Role[];
    },
  ) {
    const parser = new UserAgent().hydrate(String(req.headers['user-agent']));
    const { id, role } = user;

    return {
      ip: req.ip,
      id: id,
      role: role,
      browser: Crypto.hmac(String(parser.Agent?.browser), config.HMAC_SECRET),
      device: Crypto.hmac(String(parser.Agent?.os), config.HMAC_SECRET),
    };
  }

  protected rotateToken = (
    req: Request,
    payload: {
      id: string;
      role: Role[];
      remember?: boolean;
    },
  ): [string, string] => {
    const { id, role, remember } = payload;

    // Generate a hashed signature for the client
    const signature = this.signature(req, {
      id: id,
      role: role,
    });

    // Create an access token with a short TTL
    const accessToken = jwt.sign({ ...signature }, config.ACCESS_TOKEN, {
      expiresIn: `${ACCESS_TTL}m`,
      algorithm: 'HS256',
    });

    const refreshToken = jwt.sign(
      {
        ...signature,
        remember: remember,
        token: Crypto.hmac(accessToken, config.HMAC_SECRET),
      },
      config.REFRESH_TOKEN,
      {
        expiresIn: `${REFRESH_TTL}d`,
        algorithm: 'HS256',
      },
    );

    // Return all three tokens
    return [accessToken, refreshToken];
  };
}
