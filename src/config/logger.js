'use strict';

/**
 * Structured JSON logging with pino (one of the fastest Node loggers).
 * - JSON in production so logs can be shipped to ELK / Datadog / CloudWatch.
 * - Pretty output in development for readability.
 * - Sensitive fields are redacted at the logger level, so they can never leak.
 */
const pino = require('pino');
const config = require('./index');

const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'password',
  '*.password',
  'refreshToken',
  '*.refreshToken',
  'accessToken',
  '*.accessToken',
  'code',
  '*.code',
  'mfaToken',
  '*.mfaToken',
  'secret',
  '*.secret',
  'pendingSecret',
  '*.pendingSecret',
];

const logger = pino({
  level: config.isTest ? 'silent' : config.logLevel,
  base: { service: 'nexus-rbac-api', env: config.env },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: { paths: redactPaths, censor: '[REDACTED]' },
  ...(config.env === 'development' && {
    transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } },
  }),
});

module.exports = logger;
