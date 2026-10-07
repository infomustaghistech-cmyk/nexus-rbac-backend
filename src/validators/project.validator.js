'use strict';

const { z, objectId, idParam, offsetPagination, booleanString, tags, nonEmpty } = require('./common');
const { PROJECT_STATUS, PROJECT_MEMBER_ROLE } = require('../constants/enums');

const base = {
  name: z.string().trim().min(2).max(150),
  description: z.string().trim().max(5000).optional(),
  status: z.enum(PROJECT_STATUS).optional(),
  tags: tags.optional(),
};

module.exports = {
  create: { body: z.object(base).strict() },
  list: {
    query: z.object({
      ...offsetPagination,
      status: z.enum(PROJECT_STATUS).optional(),
      search: z.string().trim().min(1).max(100).optional(),
      mine: booleanString.optional(),
    }),
  },
  getById: { params: idParam },
  update: {
    params: idParam,
    body: nonEmpty(z.object({ ...base, name: base.name.optional() }).strict()),
  },
  remove: { params: idParam },
  addMember: {
    params: idParam,
    body: z.object({ userId: objectId, projectRole: z.enum(PROJECT_MEMBER_ROLE).default('contributor') }).strict(),
  },
  removeMember: { params: z.object({ id: objectId, userId: objectId }) },
};
