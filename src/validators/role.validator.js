'use strict';

const { z, idParam, nonEmpty } = require('./common');
const { ALL_PERMISSIONS } = require('../constants/permissions');

const name = z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_-]{1,39}$/, 'Lowercase letters, numbers, _ or -; 2-40 chars');
const permissions = z
  .array(z.enum(ALL_PERMISSIONS))
  .min(1)
  .refine((p) => new Set(p).size === p.length, 'Permissions must be unique');

module.exports = {
  create: {
    body: z.object({ name, description: z.string().trim().max(300).optional(), permissions }).strict(),
  },
  update: {
    params: idParam,
    body: nonEmpty(z.object({
      name: name.optional(),
      description: z.string().trim().max(300).optional(),
      permissions: permissions.optional(),
    }).strict()),
  },
  remove: { params: idParam },
};
