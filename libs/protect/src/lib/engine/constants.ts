export const ACCESS_TTL = 30; // minutes
export const REFRESH_TTL = 3; // days

export const ACCESS_COOKIE_EXP = {
  expires: new Date(Date.now() + ACCESS_TTL * 60 * 1000),
  maxAge: ACCESS_TTL * 60 * 1000,
};

export const REFRESH_COOKIE_EXP = {
  expires: new Date(Date.now() + REFRESH_TTL * 24 * 60 * 60 * 1000),
  maxAge: REFRESH_TTL * 24 * 60 * 60 * 1000,
};

export const ENABLE_SIGNATURE = {
  signed: true,
};

export const ENABLE_DEVTUNNELS = true;

export const COOKIES = {
  ACCESS: 'xsa1fe7',
  REFRESH: 'xsa2be3',
  PENDING_2FA: 'xsa3cd5',
  AUTH_STATUS: 'xsa4d2x',
  REQUIRE_STORE_SETUP: 'rss',
  REAUTH: 'xsa4de9',
  CHALLENGE: 'xsa4de7',
};
