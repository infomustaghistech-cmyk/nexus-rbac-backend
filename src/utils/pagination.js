'use strict';

const { BadRequestError } = require('./errors');

/**
 * Offset pagination: fine for small, admin-style lists (users, projects).
 */
function toOffset({ page, limit }) {
  return { skip: (page - 1) * limit, limit };
}

function offsetMeta({ page, limit, total }) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

/**
 * Cursor (keyset) pagination: used for large, fast-growing collections (tasks).
 * Cost stays constant no matter how deep the client pages, unlike skip/offset
 * which has to walk through every skipped document.
 * The cursor is an opaque base64url-encoded ObjectId.
 */
function encodeCursor(id) {
  return Buffer.from(String(id)).toString('base64url');
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  const id = Buffer.from(cursor, 'base64url').toString('utf8');
  if (!/^[a-f\d]{24}$/i.test(id)) throw new BadRequestError('Invalid cursor');
  return id;
}

/** Fetches limit + 1 rows to know whether a next page exists without a count query. */
function buildCursorPage(rows, limit) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? encodeCursor(items[items.length - 1]._id) : null;
  return { items, meta: { limit, hasMore, nextCursor } };
}

module.exports = { toOffset, offsetMeta, encodeCursor, decodeCursor, buildCursorPage };
