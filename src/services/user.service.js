'use strict';

const { userRepository, refreshTokenRepository } = require('../repositories');
const tokenService = require('./token.service');
const roleService = require('./role.service');
const auditService = require('./audit.service');
const { hashPassword, validatePasswordPolicy } = require('./auth.service');
const { ConflictError, ForbiddenError, NotFoundError } = require('../utils/errors');
const { toOffset, offsetMeta } = require('../utils/pagination');

const ROLE_POPULATE = { path: 'role', select: 'name isSystem' };

async function listUsers(auth, { page, limit, roleId, isActive }) {
  const filter = { organization: auth.orgId };
  if (roleId) filter.role = roleId;
  if (isActive !== undefined) filter.isActive = isActive;

  const { skip } = toOffset({ page, limit });
  // Count and page run in parallel: one round-trip of latency instead of two.
  const [items, total] = await Promise.all([
    userRepository.find(filter, { sort: { createdAt: -1 }, skip, limit, populate: ROLE_POPULATE }),
    userRepository.count(filter),
  ]);
  return { items, meta: offsetMeta({ page, limit, total }) };
}

async function getUser(auth, userId) {
  const user = await userRepository.findInOrg(auth.orgId, userId, { populate: ROLE_POPULATE });
  if (!user) throw new NotFoundError('User');
  return user;
}

/** An admin adds a team member to their own organization. */
async function createUser(auth, { name, email, password, roleId }) {
  await validatePasswordPolicy(password, { name, email });
  const role = await roleService.getAssignableRole(auth.orgId, roleId);
  const exists = await userRepository.findOne({ email }, { select: '_id' });
  if (exists) throw new ConflictError('Email is already registered');

  const user = await userRepository.create({
    organization: auth.orgId,
    name,
    email,
    password: await hashPassword(password),
    role: role._id,
  });

  await auditService.record(auth, {
    action: 'user.created',
    resourceType: 'User',
    resourceId: user._id,
    changes: { name, email, role: role._id },
  });

  const { password: _omit, ...publicUser } = user;
  return publicUser;
}

async function updateUser(auth, userId, { name, roleId, isActive, mfaEnabled }) {
  const isSelf = String(userId) === String(auth.userId);
  // Guard against accidental lock-out: nobody can demote or disable themselves.
  if (isSelf && (roleId !== undefined || isActive === false)) {
    throw new ForbiddenError('You cannot change your own role or deactivate your own account');
  }

  const changes = {};
  if (name !== undefined) changes.name = name;
  if (isActive !== undefined) changes.isActive = isActive;
  if (roleId !== undefined) changes.role = (await roleService.getAssignableRole(auth.orgId, roleId))._id;
  if (mfaEnabled === false) {
    changes['mfa.enabled'] = false;
    changes['mfa.secret'] = null;
    changes['mfa.pendingSecret'] = null;
    changes['mfa.lastUsedStep'] = null;
  }

  const user = await userRepository.updateInOrg(auth.orgId, userId, { $set: changes }, { populate: ROLE_POPULATE });
  if (!user) throw new NotFoundError('User');

  // Deactivation or a role change ends all sessions, so the next refresh and access tokens fail immediately.
  if (isActive === false || roleId !== undefined) {
    await refreshTokenRepository.revokeAllForUser(user._id);
    await tokenService.revokeAllUserTokens(user._id);
  }

  await auditService.record(auth, {
    action: 'user.updated',
    resourceType: 'User',
    resourceId: user._id,
    changes,
  });

  return user;
}

module.exports = { listUsers, getUser, createUser, updateUser };
