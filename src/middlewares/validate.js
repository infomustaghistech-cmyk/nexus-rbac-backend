'use strict';

const { ValidationError } = require('../utils/errors');

/**
 * Validates and normalises request input with Zod schemas.
 * Unknown keys are stripped, so clients cannot smuggle extra fields
 * (e.g. `organization`, `role`, `$where`) into database writes.
 */
function validate(schemas) {
  return (req, _res, next) => {
    const details = [];
    for (const part of ['params', 'query', 'body']) {
      if (!schemas[part]) continue;
      const result = schemas[part].safeParse(req[part] ?? {});
      if (result.success) {
        req[part] = result.data;
      } else {
        for (const issue of result.error.issues) {
          details.push({ location: part, field: issue.path.join('.') || part, message: issue.message });
        }
      }
    }
    if (details.length) return next(new ValidationError('Request validation failed', details));
    return next();
  };
}

module.exports = validate;
