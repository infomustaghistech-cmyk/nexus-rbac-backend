'use strict';

const { z, objectId, idParam, email, password, offsetPagination, cursorPagination, booleanString, nonEmpty } = require('./common');

module.exports = {
  list: {
    query: z.object({ ...offsetPagination, roleId: objectId.optional(), isActive: booleanString.optional() }),
  },
  getById: { params: idParam },
  create: {
    body: z.object({ name: z.string().trim().min(2).max(100), email, password, roleId: objectId }).strict(),
  },
  update: {
    params: idParam,
    body: nonEmpty(z.object({
      name: z.string().trim().min(2).max(100).optional(),
      roleId: objectId.optional(),
      isActive: z.boolean().optional(),
      mfaEnabled: z.boolean().optional(),
    }).strict()),
  },
  listAuditLogs: {
    query: z.object({
      ...cursorPagination,
      action: z.string().trim().max(100).optional(),
      actorId: objectId.optional(),
    }),
  },
};
