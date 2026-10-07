'use strict';

const { z } = require('zod');
const { LIMITS } = require('../constants/enums');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id');

const idParam = z.object({ id: objectId });

const email = z.string().trim().toLowerCase().email().max(254);

// At least 8 chars with upper, lower, number, special char; max 72 bytes because bcrypt ignores bytes after 72.
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/\d/, 'Password must contain a number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain a special character')
  .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'Password must be at most 72 bytes');

const offsetPagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(LIMITS.MAX_PAGE_SIZE).default(LIMITS.DEFAULT_PAGE_SIZE),
};

const cursorPagination = {
  limit: z.coerce.number().int().min(1).max(LIMITS.MAX_PAGE_SIZE).default(LIMITS.DEFAULT_PAGE_SIZE),
  cursor: z.string().max(100).optional(),
};

const booleanString = z.enum(['true', 'false']).transform((v) => v === 'true');

const tags = z.array(z.string().trim().toLowerCase().min(1).max(30)).max(LIMITS.MAX_TAGS);

/** Rejects PATCH bodies that contain no fields to update. */
const nonEmpty = (schema) => schema.refine((o) => Object.keys(o).length > 0, { message: 'At least one field is required' });

module.exports = { z, objectId, idParam, email, password, offsetPagination, cursorPagination, booleanString, tags, nonEmpty };
