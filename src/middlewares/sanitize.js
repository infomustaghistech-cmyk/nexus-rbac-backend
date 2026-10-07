'use strict';

/**
 * Defence in depth against NoSQL operator injection
 * (e.g. `{"email": {"$gt": ""}}`). Validation already rejects these on every
 * documented route; this strips `$`-prefixed and dotted keys from ANY input anyway.
 */
function clean(value, depth = 0) {
  if (depth > 10 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => clean(v, depth + 1));
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (key.startsWith('$') || key.includes('.') || key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    out[key] = clean(val, depth + 1);
  }
  return out;
}

function sanitize(req, _res, next) {
  if (req.body) req.body = clean(req.body);
  if (req.query) req.query = clean(req.query);
  next();
}

module.exports = sanitize;
