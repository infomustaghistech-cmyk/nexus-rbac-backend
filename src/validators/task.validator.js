'use strict';

const { z, objectId, idParam, cursorPagination, tags, nonEmpty } = require('./common');
const { TASK_STATUS, TASK_PRIORITY, LIMITS } = require('../constants/enums');

const checklist = z
  .array(z.object({ text: z.string().trim().min(1).max(300), done: z.boolean().default(false) }).strict())
  .max(LIMITS.MAX_CHECKLIST_ITEMS);

const fields = {
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(10000).optional(),
  status: z.enum(TASK_STATUS).optional(),
  priority: z.enum(TASK_PRIORITY).optional(),
  assignee: objectId.nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  labels: tags.optional(),
  checklist: checklist.optional(),
};

module.exports = {
  create: {
    params: z.object({ projectId: objectId }),
    body: z.object(fields).strict(),
  },
  listByProject: {
    params: z.object({ projectId: objectId }),
    query: z.object({
      ...cursorPagination,
      status: z.enum(TASK_STATUS).optional(),
      priority: z.enum(TASK_PRIORITY).optional(),
      assignee: objectId.optional(),
    }),
  },
  listMine: {
    query: z.object({ ...cursorPagination, status: z.enum(TASK_STATUS).optional() }),
  },
  getById: { params: idParam },
  update: {
    params: idParam,
    body: nonEmpty(z.object({ ...fields, title: fields.title.optional() }).strict()),
  },
  remove: { params: idParam },
};
