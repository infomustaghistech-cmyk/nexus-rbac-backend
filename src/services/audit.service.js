'use strict';

const AuditLog = require('../models/auditLog.model');
const { enqueue } = require('../config/redis');
const logger = require('../config/logger');
const { decodeCursor, buildCursorPage } = require('../utils/pagination');

/**
 * Enqueues an audit log record into BullMQ. Never throws to avoid failing caller transactions.
 */
async function record(ctx = {}, event = {}) {
  try {
    const orgId = ctx.orgId || event.organization;
    if (!orgId) return;

    await enqueue('audit.record', {
      organization: String(orgId),
      actor: ctx.userId || event.actor || null,
      action: event.action,
      resourceType: event.resourceType || null,
      resourceId: event.resourceId ? String(event.resourceId) : null,
      changes: event.changes || null,
      ip: ctx.ip || event.ip || null,
      userAgent: (ctx.userAgent || event.userAgent) ? String(ctx.userAgent || event.userAgent).slice(0, 500) : null,
      requestId: ctx.requestId || event.requestId || null,
      createdAt: new Date(),
    });
  } catch (err) {
    logger.error({ err }, 'Failed to enqueue audit record');
  }
}

/**
 * List audit logs for an organization with keyset cursor pagination, reading from secondary replicas.
 */
async function listAuditLogs(auth, { action, actorId, limit = 20, cursor }) {
  const query = { organization: auth.orgId };
  if (action) query.action = action;
  if (actorId) query.actor = actorId;

  const after = decodeCursor(cursor);
  if (after) query._id = { $lt: after };

  const parsedLimit = Number(limit) || 20;

  const rows = await AuditLog.find(query)
    .read('secondaryPreferred')
    .sort({ _id: -1 })
    .limit(parsedLimit + 1)
    .populate({ path: 'actor', select: 'name email' })
    .lean()
    .exec();

  return buildCursorPage(rows, parsedLimit);
}

module.exports = {
  record,
  listAuditLogs,
};
