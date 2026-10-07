'use strict';

const crypto = require('crypto');
const { projectRepository, userRepository } = require('../repositories');
const { BadRequestError, ConflictError, NotFoundError } = require('../utils/errors');
const { toOffset, offsetMeta } = require('../utils/pagination');
const logger = require('../config/logger');
const { redis, enqueue } = require('../config/redis');
const auditService = require('./audit.service');
const { LIMITS } = require('../constants/enums');

const MEMBER_POPULATE = [
  { path: 'owner', select: 'name email' },
  { path: 'members.user', select: 'name email' },
];

async function getProjectCacheVersion(orgId) {
  try {
    const v = await redis.get(`projects:${orgId}:version`);
    return v || '1';
  } catch {
    return '1';
  }
}

async function invalidateProjectCache(orgId) {
  try {
    await redis.incr(`projects:${orgId}:version`);
  } catch (err) {
    logger.warn({ err, orgId }, 'Failed to increment project cache version');
  }
}

async function getProjectOrThrow(orgId, projectId, options) {
  const project = await projectRepository.findInOrg(orgId, projectId, options);
  if (!project) throw new NotFoundError('Project');
  return project;
}

async function createProject(auth, { name, description, tags, status }) {
  const project = await projectRepository.create({
    organization: auth.orgId,
    name,
    description,
    tags,
    status,
    owner: auth.userId,
    members: [{ user: auth.userId, projectRole: 'lead' }],
  });

  await invalidateProjectCache(auth.orgId);
  await auditService.record(auth, {
    action: 'project.created',
    resourceType: 'Project',
    resourceId: project._id,
    changes: { name, status },
  });

  return project;
}

async function listProjects(auth, query = {}) {
  const { page, limit, status, search, mine } = query;
  const version = await getProjectCacheVersion(auth.orgId);

  const cachePayload = { page, limit, status, search, mine };
  if (mine) cachePayload.userId = auth.userId;
  const queryHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(cachePayload))
    .digest('hex')
    .slice(0, 16);

  const cacheKey = `projects:${auth.orgId}:v${version}:${queryHash}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (err) {
    logger.warn({ err }, 'Redis project list cache read failed');
  }

  const filter = { organization: auth.orgId };
  if (status) filter.status = status;
  if (mine) filter['members.user'] = auth.userId;
  if (search) filter.$text = { $search: search };

  const { skip } = toOffset({ page, limit });
  const sort = search ? { score: { $meta: 'textScore' } } : { createdAt: -1 };
  // Members array is excluded from list views to keep payloads small; it is returned by GET /:id.
  const select = search ? { members: 0, score: { $meta: 'textScore' } } : { members: 0 };

  const [items, total] = await Promise.all([
    projectRepository.find(filter, { select, sort, skip, limit }),
    projectRepository.count(filter),
  ]);

  const result = { items, meta: offsetMeta({ page, limit, total }) };

  try {
    await redis.set(cacheKey, JSON.stringify(result), 'EX', 30);
  } catch (err) {
    logger.warn({ err }, 'Redis project list cache write failed');
  }

  return result;
}

function getProject(auth, projectId) {
  return getProjectOrThrow(auth.orgId, projectId, { populate: MEMBER_POPULATE });
}

async function updateProject(auth, projectId, changes) {
  const project = await projectRepository.updateInOrg(auth.orgId, projectId, { $set: changes }, { populate: MEMBER_POPULATE });
  if (!project) throw new NotFoundError('Project');

  await invalidateProjectCache(auth.orgId);
  return project;
}

/**
 * Deletes the project and enqueues task cleanup in BullMQ background worker.
 */
async function deleteProject(auth, projectId) {
  const deleted = await projectRepository.deleteInOrg(auth.orgId, projectId);
  if (!deleted) throw new NotFoundError('Project');

  await invalidateProjectCache(auth.orgId);
  await enqueue('project.cleanup', { orgId: auth.orgId, projectId });

  await auditService.record(auth, {
    action: 'project.deleted',
    resourceType: 'Project',
    resourceId: projectId,
  });

  logger.info({ projectId }, 'Project deleted and cleanup job enqueued');
}

async function addMember(auth, projectId, { userId, projectRole }) {
  const user = await userRepository.findInOrg(auth.orgId, userId, { select: 'isActive' });
  if (!user || !user.isActive) throw new NotFoundError('User');

  const updated = await projectRepository.addMember(auth.orgId, projectId, { user: userId, projectRole });
  if (!updated) {
    // Null means: project missing, user already a member, or member limit reached.
    const project = await getProjectOrThrow(auth.orgId, projectId, { select: 'members.user' });
    if (project.members.some((m) => String(m.user) === String(userId))) {
      throw new ConflictError('User is already a member of this project');
    }
    throw new BadRequestError(`A project can have at most ${LIMITS.MAX_PROJECT_MEMBERS} members`);
  }

  await invalidateProjectCache(auth.orgId);
  await auditService.record(auth, {
    action: 'project.member_added',
    resourceType: 'Project',
    resourceId: projectId,
    changes: { userId, projectRole },
  });

  return getProject(auth, projectId);
}

async function removeMember(auth, projectId, userId) {
  const project = await getProjectOrThrow(auth.orgId, projectId, { select: 'owner' });
  if (String(project.owner) === String(userId)) throw new BadRequestError('The project owner cannot be removed');
  await projectRepository.removeMember(auth.orgId, projectId, userId);

  await invalidateProjectCache(auth.orgId);
  await auditService.record(auth, {
    action: 'project.member_removed',
    resourceType: 'Project',
    resourceId: projectId,
    changes: { userId },
  });

  return getProject(auth, projectId);
}

module.exports = {
  getProjectOrThrow,
  createProject,
  listProjects,
  getProject,
  updateProject,
  deleteProject,
  addMember,
  removeMember,
  invalidateProjectCache,
};
