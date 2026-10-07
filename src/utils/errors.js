'use strict';

/**
 * Operational errors: expected failures (bad input, missing resource, no access).
 * They carry an HTTP status and a stable machine-readable `code` that clients can rely on.
 * Anything that is NOT an AppError is treated as a bug and returned as a generic 500.
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = undefined) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class BadRequestError extends AppError {
  constructor(message = 'Bad request', details) { super(message, 400, 'BAD_REQUEST', details); }
}
class ValidationError extends AppError {
  constructor(message = 'Validation failed', details) { super(message, 422, 'VALIDATION_ERROR', details); }
}
class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') { super(message, 401, 'UNAUTHORIZED'); }
}
class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') { super(message, 403, 'FORBIDDEN'); }
}
class NotFoundError extends AppError {
  constructor(resource = 'Resource') { super(`${resource} not found`, 404, 'NOT_FOUND'); }
}
class ConflictError extends AppError {
  constructor(message = 'Resource already exists', details) { super(message, 409, 'CONFLICT', details); }
}
class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests', details, retryAfterSeconds = undefined, code = 'ACCOUNT_LOCKED') {
    super(message, 429, code, details);
    this.retryAfterSeconds = retryAfterSeconds;
    this.headers = retryAfterSeconds ? { 'Retry-After': String(retryAfterSeconds) } : undefined;
  }
}

module.exports = {
  AppError,
  BadRequestError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  TooManyRequestsError,
};
