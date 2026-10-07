'use strict';

const config = require('../config');
const logger = require('../config/logger');
const { roleRepository, userRepository } = require('../repositories');
const { SYSTEM_ROLES } = require('../constants/permissions');
const { NotFoundError, ForbiddenError, ConflictError, BadRequestError } = require('../utils/errors');

const { redis } = require('../config/redis');

const ROLE_PERM_TTL_SECONDS = 300;

async function getPermissions(roleId) {
  const key = `perm:${roleId}`;
  try {
    const cached = await redis.get(key);
    if (cached) {
      return new Set(JSON.parse(cached));
    }
  } catch (err) {
    logger.warn({ err, roleId }, 'Redis permission cache get failed; falling back to DB');
  }

  const role = await roleRepository.findById(String(roleId), { select: 'permissions' });
  const permissionsList = role ? role.permissions : [];

  try {
    await redis.set(key, JSON.stringify(permissionsList), 'EX', ROLE_PERM_TTL_SECONDS);
  } catch (err) {
    logger.warn({ err, roleId }, 'Redis permission cache set failed');
  }

  return new Set(permissionsList);
}

async function invalidateRole(roleId) {
  try {
    await redis.del(`perm:${roleId}`);
  } catch (err) {
    logger.warn({ err, roleId }, 'Redis permission cache invalidation failed');
  }
}

async function clearPermissionCache() {
  try {
    const keys = await redis.keys('perm:*');
    if (keys.length > 0) await redis.del(...keys);
  } catch (err) {
    logger.warn({ err }, 'Redis permission cache clear failed');
  }
}

/**
 * Idempotently creates/updates the built-in roles. Runs on every boot, so code and
 * database never drift apart. Safe when several instances start at the same time.
 */
async function ensureSystemRoles() {
  for (const [name, def] of Object.entries(SYSTEM_ROLES)) {
    try {
      await roleRepository.model.updateOne(
        { organization: null, name },
        {
          $set: { description: def.description, permissions: def.permissions, isSystem: true },
          $setOnInsert: { organization: null, name },
        },
        { upsert: true },
      );
    } catch (err) {
      // Another instance inserted the same role concurrently: that is fine.
      if (err.code !== 11000) throw err;
    }
  }
  await clearPermissionCache();
  logger.info({ roles: Object.keys(SYSTEM_ROLES) }, 'System roles ensured');
}

function getSystemRole(name) {
  return roleRepository.findSystemRoleByName(name);
}

function listRoles(orgId) {
  return roleRepository.findAvailableForOrg(orgId);
}

/** A role can be assigned to a user only if it is a system role or belongs to the same organization. */
async function getAssignableRole(orgId, roleId) {
  const role = await roleRepository.findOne({
    _id: roleId,
    $or: [{ organization: null }, { organization: orgId }],
  });
  if (!role) throw new NotFoundError('Role');
  return role;
}

const auditService = require('./audit.service');

async function createRole(auth, { name, description, permissions }) {
  const orgId = typeof auth === 'object' ? auth.orgId : auth;
  if (SYSTEM_ROLES[name]) throw new ConflictError(`"${name}" is a reserved system role name`);
  const role = await roleRepository.create({ name, description, permissions, organization: orgId, isSystem: false });
  await auditService.record(auth, {
    action: 'role.created',
    resourceType: 'Role',
    resourceId: role._id,
    changes: { name, description, permissions },
  });
  return role;
}

async function findCustomRole(orgId, roleId) {
  const role = await roleRepository.findOne({ _id: roleId, $or: [{ organization: null }, { organization: orgId }] });
  if (!role) throw new NotFoundError('Role');
  if (role.isSystem) throw new ForbiddenError('System roles cannot be modified');
  return role;
}

async function updateRole(auth, roleId, changes) {
  const orgId = typeof auth === 'object' ? auth.orgId : auth;
  await findCustomRole(orgId, roleId);
  if (changes.name && SYSTEM_ROLES[changes.name]) {
    throw new ConflictError(`"${changes.name}" is a reserved system role name`);
  }
  const updated = await roleRepository.updateInOrg(orgId, roleId, { $set: changes });
  await invalidateRole(roleId);
  await auditService.record(auth, {
    action: 'role.updated',
    resourceType: 'Role',
    resourceId: roleId,
    changes,
  });
  return updated;
}

async function deleteRole(auth, roleId) {
  const orgId = typeof auth === 'object' ? auth.orgId : auth;
  await findCustomRole(orgId, roleId);
  const inUse = await userRepository.count({ organization: orgId, role: roleId });
  if (inUse > 0) throw new BadRequestError(`Role is assigned to ${inUse} user(s); reassign them first`);
  await roleRepository.deleteInOrg(orgId, roleId);
  await invalidateRole(roleId);
  await auditService.record(auth, {
    action: 'role.deleted',
    resourceType: 'Role',
    resourceId: roleId,
  });
}

module.exports = {
  getPermissions,
  invalidateRole,
  clearPermissionCache,
  ensureSystemRoles,
  getSystemRole,
  listRoles,
  getAssignableRole,
  createRole,
  updateRole,
  deleteRole,
};
