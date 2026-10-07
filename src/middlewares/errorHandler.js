'use strict';

const mongoose = require('mongoose');
const config = require('../config');
const logger = require('../config/logger');
const { AppError } = require('../utils/errors');

/** Translates known library errors into operational AppErrors with a stable code. */
function normalise(err) {
  if (err instanceof AppError) return err;

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    return new AppError('Validation failed', 422, 'VALIDATION_ERROR', details);
  }
  if (err instanceof mongoose.Error.CastError) {
    return new AppError(`Invalid value for "${err.path}"`, 400, 'BAD_REQUEST');
  }
  if (err && err.code === 11000) {
    const fields = Object.keys(err.keyValue || err.keyPattern || {});
    return new AppError('A resource with the same unique value already exists', 409, 'CONFLICT', { fields });
  }
  if (err && err.type === 'entity.parse.failed') {
    return new AppError('Malformed JSON body', 400, 'BAD_REQUEST');
  }
  if (err && err.type === 'entity.too.large') {
    return new AppError('Request body is too large', 413, 'PAYLOAD_TOO_LARGE');
  }
  return null;
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  const known = normalise(err);
  const log = req.log || logger;
  const requestId = req.id;

  if (known) {
    if (known.headers) {
      res.set(known.headers);
    }
    // Expected errors: log at warn (4xx) without a stack trace to keep logs signal-rich.
    if (known.statusCode >= 500) log.error({ err }, known.message);
    else log.warn({ code: known.code, status: known.statusCode }, known.message);

    return res.status(known.statusCode).json({
      success: false,
      error: { code: known.code, message: known.message, details: known.details, requestId },
    });
  }

  // Unknown error = a bug. Log everything, but never leak internals to the client in production.
  log.error({ err }, 'Unhandled error');
  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: config.isProduction ? 'Something went wrong' : err.message,
      requestId,
    },
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: { code: 'ROUTE_NOT_FOUND', message: `Route ${req.method} ${req.originalUrl} not found`, requestId: req.id },
  });
}

module.exports = { errorHandler, notFoundHandler };
