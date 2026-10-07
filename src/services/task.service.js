'use strict';

const { taskRepository, projectRepository, userRepository } = require('../repositories');
const { getProjectOrThrow, invalidateProjectCache } = require('./project.service');
const { PERMISSIONS } = require('../constants/permissions');
const { ConflictError, ForbiddenError, NotFoundError } = require('../utils/errors');
const { decodeCursor, buildCursorPage } = require('../utils/pagination');

const TASK_POPULATE = [
  { path: 'assignee', select: 'name email' },
  { path: 'createdBy', select: 'name email' },
];

async function assertAssignable(orgId, userId) {
  if (!userId) return;
  const user = await userRepository.findInOrg(orgId, userId, { select: 'isActive' });
  if (!user || !user.isActive) throw new NotFoundError('Assignee');
}

async function getTaskOrThrow(orgId, taskId, options) {
  const task = await taskRepository.findInOrg(orgId, taskId, options);
  if (!task) throw new NotFoundError('Task');
  return task;
}

/**
 * Resource-level authorization on top of RBAC:
 * - `task:update:any` -> may edit any task in the organization (managers/admins)
 * - `task:update`     -> may edit only tasks they created or are assigned to (members)
 */
function assertCanModify(auth, task) {
  if (auth.permissions.has(PERMISSIONS.TASK_UPDATE_ANY)) return;
  const isOwner = String(task.createdBy) === auth.userId || String(task.assignee) === auth.userId;
  if (!auth.permissions.has(PERMISSIONS.TASK_UPDATE) || !isOwner) {
    throw new ForbiddenError('You can only modify tasks you created or are assigned to');
  }
}

async function createTask(auth, projectId, data) {
  await getProjectOrThrow(auth.orgId, projectId, { select: '_id' });
  await assertAssignable(auth.orgId, data.assignee);

  const isDone = data.status === 'done';
  const task = await taskRepository.create({
    ...data,
    organization: auth.orgId,
    project: projectId,
    createdBy: auth.userId,
    completedAt: isDone ? new Date() : null,
  });
  await projectRepository.incrementTaskStats(auth.orgId, projectId, { total: 1, done: isDone ? 1 : 0 });
  await invalidateProjectCache(auth.orgId);
  return task;
}

async function listTasks(auth, filter, { limit, cursor }) {
  const query = { organization: auth.orgId, ...filter };
  const after = decodeCursor(cursor);
  if (after) query._id = { $lt: after };

  const rows = await taskRepository.find(query, { sort: { _id: -1 }, limit: limit + 1, populate: TASK_POPULATE });
  return buildCursorPage(rows, limit);
}

async function listProjectTasks(auth, projectId, { limit, cursor, status, assignee, priority }) {
  await getProjectOrThrow(auth.orgId, projectId, { select: '_id' });
  const filter = { project: projectId };
  if (status) filter.status = status;
  if (assignee) filter.assignee = assignee;
  if (priority) filter.priority = priority;
  return listTasks(auth, filter, { limit, cursor });
}

function listMyTasks(auth, { limit, cursor, status }) {
  const filter = { assignee: auth.userId };
  if (status) filter.status = status;
  return listTasks(auth, filter, { limit, cursor });
}

function getTask(auth, taskId) {
  return getTaskOrThrow(auth.orgId, taskId, { populate: TASK_POPULATE });
}

async function updateTask(auth, taskId, changes) {
  const current = await getTaskOrThrow(auth.orgId, taskId);
  assertCanModify(auth, current);
  if (changes.assignee) await assertAssignable(auth.orgId, changes.assignee);

  const update = { ...changes };
  let doneDelta = 0;
  if (changes.status && changes.status !== current.status) {
    if (changes.status === 'done') { doneDelta = 1; update.completedAt = new Date(); }
    if (current.status === 'done') { doneDelta = -1; update.completedAt = null; }
  }

  // Optimistic concurrency: the write only applies if the status is still what we read.
  // This keeps the project's denormalised counters correct under concurrent updates.
  const updated = await taskRepository.findOneAndUpdate(
    { _id: taskId, organization: auth.orgId, status: current.status },
    { $set: update },
    { populate: TASK_POPULATE },
  );
  if (!updated) throw new ConflictError('Task was modified by another request; please retry');

  if (doneDelta !== 0) {
    await projectRepository.incrementTaskStats(auth.orgId, current.project, { done: doneDelta });
    await invalidateProjectCache(auth.orgId);
  }
  return updated;
}

async function deleteTask(auth, taskId) {
  const task = await getTaskOrThrow(auth.orgId, taskId);
  const deleted = await taskRepository.deleteInOrg(auth.orgId, taskId);
  if (!deleted) throw new NotFoundError('Task');
  await projectRepository.incrementTaskStats(auth.orgId, task.project, {
    total: -1,
    done: task.status === 'done' ? -1 : 0,
  });
  await invalidateProjectCache(auth.orgId);
}

module.exports = { createTask, listProjectTasks, listMyTasks, getTask, updateTask, deleteTask, assertCanModify };
