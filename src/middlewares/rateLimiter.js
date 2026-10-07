'use strict';

const { rateLimit } = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const config = require('../config');
const { redis } = require('../config/redis');

const createStore = (prefix) =>
  new RedisStore({
    sendCommand: (...args) => redis.call(...args),
    prefix: `rl:${prefix}:`,
  });

const common = {
  windowMs: config.rateLimit.windowMs,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => config.isTest,
  handler: (_req, res) => res.status(429).json({
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' },
  }),
};

const apiLimiter = rateLimit({
  ...common,
  limit: config.rateLimit.max,
  store: createStore('api'),
});

// Much stricter on credential endpoints to slow down brute-force and credential stuffing.
const authLimiter = rateLimit({
  ...common,
  limit: config.rateLimit.authMax,
  store: createStore('auth'),
});

module.exports = { apiLimiter, authLimiter };
