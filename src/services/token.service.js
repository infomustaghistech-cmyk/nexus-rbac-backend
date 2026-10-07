'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { UnauthorizedError } = require('../utils/errors');

const { redis } = require('../config/redis');

const ALGORITHM = 'HS256';
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes

/**
 * Access token = short-lived, stateless JWT (verified without a DB call -> scales horizontally).
 * It carries identifiers and a unique jti for instant revocation.
 */
function signAccessToken(user) {
  const jti = crypto.randomUUID();
  return jwt.sign(
    { org: String(user.organization), role: String(user.role), typ: 'access', jti },
    config.jwt.accessSecret,
    {
      subject: String(user._id),
      expiresIn: config.jwt.accessExpiresIn,
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
      algorithm: ALGORITHM,
    },
  );
}

function verifyAccessToken(token) {
  try {
    const payload = jwt.verify(token, config.jwt.accessSecret, {
      algorithms: [ALGORITHM], // pinning the algorithm blocks "alg: none" / algorithm-confusion attacks
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    });
    if (payload.typ !== 'access' || !payload.sub || !payload.org || !payload.role) {
      throw new UnauthorizedError('Invalid access token');
    }
    return payload;
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    if (err.name === 'TokenExpiredError') throw new UnauthorizedError('Access token expired');
    throw new UnauthorizedError('Invalid access token');
  }
}

/** MFA token = 5-minute single-use JWT with typ 'mfa' */
function signMfaToken(user) {
  const jti = crypto.randomUUID();
  return jwt.sign(
    { typ: 'mfa', jti },
    config.jwt.accessSecret,
    {
      subject: String(user._id),
      expiresIn: '5m',
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
      algorithm: ALGORITHM,
    },
  );
}

function verifyMfaToken(token) {
  try {
    const payload = jwt.verify(token, config.jwt.accessSecret, {
      algorithms: [ALGORITHM],
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    });
    if (payload.typ !== 'mfa' || !payload.sub || !payload.jti) {
      throw new UnauthorizedError('Invalid MFA token');
    }
    return payload;
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    if (err.name === 'TokenExpiredError') throw new UnauthorizedError('MFA token expired');
    throw new UnauthorizedError('Invalid MFA token');
  }
}

/** Revoke single access or MFA token by jti */
async function revokeJti(jti, ttlSeconds = ACCESS_TOKEN_TTL_SECONDS) {
  if (!jti) return;
  await redis.set(`deny:jti:${jti}`, '1', 'EX', ttlSeconds);
}

/** Revoke all access tokens issued for a user at or before now */
async function revokeAllUserTokens(userId, ttlSeconds = ACCESS_TOKEN_TTL_SECONDS) {
  if (!userId) return;
  const nowUnix = Math.floor(Date.now() / 1000);
  await redis.set(`deny:user:${userId}`, String(nowUnix), 'EX', ttlSeconds);
}

/** Check if access token is revoked in Redis */
async function isTokenRevoked(payload) {
  if (!payload) return true;

  if (payload.jti) {
    const jtiRevoked = await redis.get(`deny:jti:${payload.jti}`);
    if (jtiRevoked) return true;
  }

  if (payload.sub && payload.iat) {
    const userRevokeTime = await redis.get(`deny:user:${payload.sub}`);
    if (userRevokeTime && payload.iat <= parseInt(userRevokeTime, 10)) {
      return true;
    }
  }

  return false;
}

/** Refresh token = opaque, high-entropy random string (not a JWT), stored hashed. */
function generateRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function refreshTokenExpiry() {
  return new Date(Date.now() + config.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  signMfaToken,
  verifyMfaToken,
  revokeJti,
  revokeAllUserTokens,
  isTokenRevoked,
  generateRefreshToken,
  hashToken,
  refreshTokenExpiry,
};
