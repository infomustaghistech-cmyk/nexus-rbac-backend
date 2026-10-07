'use strict';

const { verifyAccessToken, isTokenRevoked } = require('../services/token.service');
const { UnauthorizedError } = require('../utils/errors');

/**
 * Verifies the Bearer JWT, checks the token denylist in Redis, and attaches caller context to req.auth.
 */
async function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new UnauthorizedError('Missing or malformed Authorization header'));
  }

  try {
    const payload = verifyAccessToken(token);

    const revoked = await isTokenRevoked(payload);
    if (revoked) {
      return next(new UnauthorizedError('Token has been revoked'));
    }

    req.auth = {
      userId: payload.sub,
      orgId: payload.org,
      roleId: payload.role,
      jti: payload.jti,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      requestId: req.id,
    };

    // Every log line for this request now carries who made it.
    if (req.log) req.log = req.log.child({ userId: payload.sub, orgId: payload.org });
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = authenticate;
