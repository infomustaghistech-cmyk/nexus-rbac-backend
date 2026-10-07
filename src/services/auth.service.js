'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { authenticator } = require('otplib');
const config = require('../config');
const logger = require('../config/logger');
const { redis } = require('../config/redis');
const tokenService = require('./token.service');
const roleService = require('./role.service');
const auditService = require('./audit.service');
const { organizationRepository, userRepository, refreshTokenRepository } = require('../repositories');
const { OWNER_ROLE } = require('../constants/permissions');
const { AppError, ConflictError, UnauthorizedError, BadRequestError, TooManyRequestsError } = require('../utils/errors');

let dummyHashPromise;
/** Used to keep login timing identical whether or not the email exists (prevents user enumeration). */
function getDummyHash() {
  if (!dummyHashPromise) dummyHashPromise = bcrypt.hash('timing-equaliser-not-a-real-password', config.bcryptSaltRounds);
  return dummyHashPromise;
}

function hashPassword(password) {
  return bcrypt.hash(password, config.bcryptSaltRounds);
}

function slugify(text) {
  const base = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'org';
  return `${base}-${crypto.randomBytes(3).toString('hex')}`;
}

function toPublicUser(user) {
  const { password, mfa, ...rest } = user;
  return { ...rest, mfaEnabled: Boolean(mfa?.enabled) };
}

function getMfaKey() {
  return crypto.createHash('sha256').update(config.mfaEncryptionKey).digest();
}

function encryptMfaSecret(plain) {
  if (!plain) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getMfaKey(), iv);
  let enc = cipher.update(plain, 'utf8', 'hex');
  enc += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc}`;
}

function decryptMfaSecret(cipherText) {
  if (!cipherText) return null;
  const parts = cipherText.split(':');
  if (parts.length !== 3) return null;
  const [ivHex, tagHex, encHex] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', getMfaKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  let dec = decipher.update(encHex, 'hex', 'utf8');
  dec += decipher.final('utf8');
  return dec;
}

async function validatePasswordPolicy(password, { name, email }) {
  const lowerPwd = password.toLowerCase();

  if (name) {
    const parts = name.toLowerCase().split(/\s+/).filter((p) => p.length >= 3);
    for (const part of parts) {
      if (lowerPwd.includes(part)) {
        throw new BadRequestError('Password cannot contain your name');
      }
    }
  }

  if (email) {
    const prefix = email.toLowerCase().split('@')[0];
    if (prefix && prefix.length >= 3 && lowerPwd.includes(prefix)) {
      throw new BadRequestError('Password cannot contain your email username');
    }
  }

  if (config.passwordBreachCheck) {
    try {
      const sha1 = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
      const prefix = sha1.slice(0, 5);
      const suffix = sha1.slice(5);

      const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        signal: AbortSignal.timeout(2000),
      });

      if (res.ok) {
        const text = await res.text();
        const lines = text.split('\r\n');
        for (const line of lines) {
          const [hashSuffix] = line.split(':');
          if (hashSuffix && hashSuffix.trim().toUpperCase() === suffix) {
            throw new BadRequestError('This password has appeared in a known data breach and cannot be used');
          }
        }
      }
    } catch (err) {
      if (err instanceof BadRequestError) throw err;
      logger.warn({ err }, 'Have I Been Pwned API check timed out or unreachable');
    }
  }
}

async function checkAccountLockout(identifierKey) {
  const lockKey = `lockout:locked:${identifierKey}`;
  const ttl = await redis.ttl(lockKey);
  if (ttl > 0) {
    throw new TooManyRequestsError(
      `Too many failed attempts. Please try again in ${ttl} seconds.`,
      { retryAfterSeconds: ttl },
      ttl,
    );
  }
}

async function recordFailedLockoutAttempt(identifierKey, meta, auditDetails) {
  const attemptsKey = `lockout:attempts:${identifierKey}`;
  const lockKey = `lockout:locked:${identifierKey}`;

  const attempts = await redis.incr(attemptsKey);
  await redis.expire(attemptsKey, config.lockout.resetMinutes * 60);

  if (attempts >= config.lockout.maxAttempts) {
    await redis.set(lockKey, '1', 'EX', config.lockout.lockSeconds);
    if (auditDetails) {
      await auditService.record(meta, {
        action: 'auth.locked',
        changes: { identifier: identifierKey, attempts, lockSeconds: config.lockout.lockSeconds },
        ...auditDetails,
      });
    }
    throw new TooManyRequestsError(
      `Too many failed attempts. Please try again in ${config.lockout.lockSeconds} seconds.`,
      { retryAfterSeconds: config.lockout.lockSeconds },
      config.lockout.lockSeconds,
    );
  }
}

async function clearAccountLockout(identifierKey) {
  await redis.del(`lockout:attempts:${identifierKey}`, `lockout:locked:${identifierKey}`);
}

async function persistRefreshToken(user, rawToken, family, meta = {}) {
  await refreshTokenRepository.create({
    user: user._id,
    tokenHash: tokenService.hashToken(rawToken),
    family,
    expiresAt: tokenService.refreshTokenExpiry(),
    createdByIp: meta.ip || null,
    userAgent: meta.userAgent ? String(meta.userAgent).slice(0, 500) : null,
  });
}

async function issueTokens(user, meta, family = crypto.randomUUID()) {
  const refreshToken = tokenService.generateRefreshToken();
  await persistRefreshToken(user, refreshToken, family, meta);
  return {
    accessToken: tokenService.signAccessToken(user),
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: config.jwt.accessExpiresIn,
  };
}

/**
 * Creates a new tenant (organization) and its first admin user inside a replica set transaction.
 */
async function register({ organizationName, name, email, password }, meta) {
  await validatePasswordPolicy(password, { name, email });

  const adminRole = await roleService.getSystemRole(OWNER_ROLE);
  if (!adminRole) throw new AppError('System roles are not initialised', 500, 'SETUP_REQUIRED');

  const session = await mongoose.startSession();
  let createdOrg;
  let createdUser;

  try {
    await session.withTransaction(async () => {
      const existing = await userRepository.findOne({ email }, { select: '_id', session });
      if (existing) throw new ConflictError('Email is already registered');

      createdOrg = await organizationRepository.create(
        { name: organizationName, slug: slugify(organizationName) },
        { session },
      );

      const hashedPassword = await hashPassword(password);
      createdUser = await userRepository.create(
        {
          organization: createdOrg._id,
          name,
          email,
          password: hashedPassword,
          role: adminRole._id,
        },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  logger.info({ orgId: createdOrg._id, userId: createdUser._id }, 'Organization registered');
  await auditService.record(
    { orgId: createdOrg._id, userId: createdUser._id, ...meta },
    {
      action: 'org.registered',
      resourceType: 'Organization',
      resourceId: createdOrg._id,
      changes: { organizationName, name, email },
    },
  );

  const tokens = await issueTokens(createdUser, meta);
  return { user: toPublicUser(createdUser), organization: createdOrg, ...tokens };
}

async function login({ email, password }, meta) {
  const normalizedEmail = email.toLowerCase().trim();
  await checkAccountLockout(normalizedEmail);

  const user = await userRepository.model
    .findOne({ email: normalizedEmail })
    .select('+password +mfa.secret +mfa.lastUsedStep')
    .lean()
    .exec();

  const passwordOk = await bcrypt.compare(password, user ? user.password : await getDummyHash());

  if (!user || !passwordOk) {
    logger.warn({ email: normalizedEmail, ip: meta.ip }, 'Failed login attempt');
    await recordFailedLockoutAttempt(normalizedEmail, meta, user ? { organization: user.organization, actor: user._id } : null);
    throw new UnauthorizedError('Invalid email or password');
  }

  if (!user.isActive) throw new UnauthorizedError('Account is disabled');

  const organization = await organizationRepository.findById(user.organization, { select: 'isActive' });
  if (!organization || !organization.isActive) throw new UnauthorizedError('Organization is disabled');

  // If 2FA is enabled, issue short-lived single-use MFA token instead of full access
  if (user.mfa?.enabled) {
    const mfaToken = tokenService.signMfaToken(user);
    return { mfaRequired: true, mfaToken };
  }

  await clearAccountLockout(normalizedEmail);
  await userRepository.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  logger.info({ userId: user._id }, 'User logged in');

  await auditService.record(
    { orgId: user.organization, userId: user._id, ...meta },
    { action: 'auth.login', resourceType: 'User', resourceId: user._id },
  );

  const tokens = await issueTokens(user, meta);
  return { user: toPublicUser(user), ...tokens };
}

async function setup2FA(auth) {
  const user = await userRepository.findInOrg(auth.orgId, auth.userId);
  if (!user) throw new UnauthorizedError('Account not found');

  const secret = authenticator.generateSecret();
  const encrypted = encryptMfaSecret(secret);

  await userRepository.updateOne({ _id: user._id }, { $set: { 'mfa.pendingSecret': encrypted } });

  const otpauthUrl = authenticator.keyuri(user.email, 'Nexus RBAC', secret);
  return { secret, otpauthUrl };
}

async function enable2FA(auth, { code }) {
  const user = await userRepository.model
    .findOne({ _id: auth.userId, organization: auth.orgId })
    .select('+mfa.pendingSecret')
    .exec();

  if (!user || !user.mfa?.pendingSecret) {
    throw new BadRequestError('2FA setup has not been initiated');
  }

  const secret = decryptMfaSecret(user.mfa.pendingSecret);
  const isValid = authenticator.verify({ token: code, secret });
  if (!isValid) throw new BadRequestError('Invalid 2FA verification code');

  const currentStep = Math.floor(Date.now() / 30000);
  user.mfa.enabled = true;
  user.mfa.secret = user.mfa.pendingSecret;
  user.mfa.pendingSecret = null;
  user.mfa.lastUsedStep = currentStep;
  await user.save();

  await auditService.record(auth, {
    action: '2fa.enabled',
    resourceType: 'User',
    resourceId: user._id,
  });

  return { message: 'Two-factor authentication enabled successfully' };
}

async function disable2FA(auth, { password, code }) {
  const user = await userRepository.model
    .findOne({ _id: auth.userId, organization: auth.orgId })
    .select('+password +mfa.secret')
    .exec();

  if (!user || !user.mfa?.enabled || !user.mfa?.secret) {
    throw new BadRequestError('2FA is not enabled on this account');
  }

  const passwordOk = await bcrypt.compare(password, user.password);
  if (!passwordOk) throw new UnauthorizedError('Invalid password');

  const secret = decryptMfaSecret(user.mfa.secret);
  const isValid = authenticator.verify({ token: code, secret });
  if (!isValid) throw new BadRequestError('Invalid 2FA verification code');

  user.mfa.enabled = false;
  user.mfa.secret = null;
  user.mfa.pendingSecret = null;
  user.mfa.lastUsedStep = null;
  await user.save();

  await auditService.record(auth, {
    action: '2fa.disabled',
    resourceType: 'User',
    resourceId: user._id,
  });

  return { message: 'Two-factor authentication disabled successfully' };
}

async function verify2FA({ mfaToken, code }, meta) {
  const payload = tokenService.verifyMfaToken(mfaToken);

  // Single-use enforcement: immediately revoke the mfaToken jti
  const revoked = await tokenService.isTokenRevoked(payload);
  if (revoked) throw new UnauthorizedError('MFA token has already been used or expired');
  await tokenService.revokeJti(payload.jti, 5 * 60);

  const mfaLockKey = `mfa:${payload.sub}`;
  await checkAccountLockout(mfaLockKey);

  const user = await userRepository.model
    .findById(payload.sub)
    .select('+mfa.secret +mfa.lastUsedStep')
    .exec();

  if (!user || !user.mfa?.enabled || !user.mfa?.secret) {
    throw new UnauthorizedError('Invalid MFA verification attempt');
  }

  const secret = decryptMfaSecret(user.mfa.secret);
  const currentStep = Math.floor(Date.now() / 30000);

  if (user.mfa.lastUsedStep === currentStep) {
    throw new BadRequestError('This code was already used; please wait for the next code');
  }

  const isValid = authenticator.verify({ token: code, secret });
  if (!isValid) {
    await recordFailedLockoutAttempt(mfaLockKey, meta, { organization: user.organization, actor: user._id });
    throw new UnauthorizedError('Invalid MFA code');
  }

  await clearAccountLockout(mfaLockKey);
  await clearAccountLockout(user.email.toLowerCase().trim());

  user.mfa.lastUsedStep = currentStep;
  user.lastLoginAt = new Date();
  await user.save();

  await auditService.record(
    { orgId: user.organization, userId: user._id, ...meta },
    { action: 'auth.login', resourceType: 'User', resourceId: user._id, changes: { method: 'mfa' } },
  );

  const tokens = await issueTokens(user.toObject(), meta);
  return { user: toPublicUser(user.toObject()), ...tokens };
}

/**
 * Refresh-token rotation with reuse detection.
 */
async function refresh(rawToken, meta) {
  const stored = await refreshTokenRepository.findOne({ tokenHash: tokenService.hashToken(rawToken) });
  if (!stored) throw new UnauthorizedError('Invalid refresh token');

  if (stored.revokedAt) {
    await refreshTokenRepository.revokeFamily(stored.family);
    await tokenService.revokeAllUserTokens(stored.user);
    logger.warn({ userId: stored.user, family: stored.family }, 'Refresh token reuse detected; family and access tokens revoked');
    await auditService.record(meta, {
      action: 'auth.refresh_reuse',
      actor: stored.user,
      changes: { family: stored.family },
    });
    throw new UnauthorizedError('Refresh token has been revoked');
  }
  if (stored.expiresAt <= new Date()) throw new UnauthorizedError('Refresh token expired');

  const user = await userRepository.findById(stored.user);
  if (!user || !user.isActive) {
    await refreshTokenRepository.revokeFamily(stored.family);
    await tokenService.revokeAllUserTokens(stored.user);
    throw new UnauthorizedError('Account is disabled');
  }

  const newRefreshToken = tokenService.generateRefreshToken();
  const result = await refreshTokenRepository.updateOne(
    { _id: stored._id, revokedAt: null },
    { $set: { revokedAt: new Date(), replacedByHash: tokenService.hashToken(newRefreshToken) } },
  );
  if (result.modifiedCount === 0) {
    await refreshTokenRepository.revokeFamily(stored.family);
    await tokenService.revokeAllUserTokens(stored.user);
    throw new UnauthorizedError('Refresh token has been revoked');
  }

  await persistRefreshToken(user, newRefreshToken, stored.family, meta);
  return {
    accessToken: tokenService.signAccessToken(user),
    refreshToken: newRefreshToken,
    tokenType: 'Bearer',
    expiresIn: config.jwt.accessExpiresIn,
  };
}

async function logout(rawToken, authHeader) {
  if (rawToken) {
    await refreshTokenRepository.updateOne(
      { tokenHash: tokenService.hashToken(rawToken), revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  }

  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const payload = tokenService.verifyAccessToken(authHeader.split(' ')[1]);
      if (payload.jti) await tokenService.revokeJti(payload.jti);
    } catch {
      // Ignore if access token is invalid or expired
    }
  }
}

async function logoutAll(auth) {
  const userId = typeof auth === 'object' ? auth.userId : auth;
  await refreshTokenRepository.revokeAllForUser(userId);
  await tokenService.revokeAllUserTokens(userId);
  await auditService.record(auth, {
    action: 'auth.logout_all',
    resourceType: 'User',
    resourceId: userId,
  });
}

async function getProfile(auth) {
  const user = await userRepository.findInOrg(auth.orgId, auth.userId, {
    populate: [
      { path: 'role', select: 'name permissions' },
      { path: 'organization', select: 'name slug plan' },
    ],
  });
  if (!user) throw new UnauthorizedError('Account no longer exists');
  return toPublicUser(user);
}

module.exports = {
  register,
  login,
  setup2FA,
  enable2FA,
  disable2FA,
  verify2FA,
  refresh,
  logout,
  logoutAll,
  getProfile,
  hashPassword,
  validatePasswordPolicy,
};
