'use strict';

const roleService = require('../services/role.service');
const { ForbiddenError, UnauthorizedError } = require('../utils/errors');

/**
 * RBAC guard factory.
 *   authorize('project:delete')                       -> needs ALL listed permissions
 *   authorize.any('task:update', 'task:update:any')   -> needs AT LEAST ONE
 *
 * Permissions are resolved from the user's role (cached), then attached to
 * `req.auth.permissions` so services can make finer, resource-level decisions.
 */
function buildGuard(required, mode) {
  return async function authorizeMiddleware(req, _res, next) {
    try {
      if (!req.auth) throw new UnauthorizedError();

      const permissions = await roleService.getPermissions(req.auth.roleId);
      req.auth.permissions = permissions;

      const allowed = mode === 'all'
        ? required.every((p) => permissions.has(p))
        : required.some((p) => permissions.has(p));

      if (!allowed) {
        req.log?.warn({ required, mode }, 'Authorization denied');
        throw new ForbiddenError();
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

const authorize = (...permissions) => buildGuard(permissions, 'all');
authorize.any = (...permissions) => buildGuard(permissions, 'any');

module.exports = authorize;
