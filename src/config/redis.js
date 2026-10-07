'use strict';

const Redis = require('ioredis');
const { Queue } = require('bullmq');
const config = require('./index');
const logger = require('./logger');

const redisOptions = {
  maxRetriesPerRequest: 20,
  enableReadyCheck: true,
  lazyConnect: false,
};

// Shared Redis client used for general caching, token revocation, lockout, and rate limiting
const redis = new Redis(config.redis.url, redisOptions);

redis.on('connect', () => logger.info('Connected to Redis'));
redis.on('error', (err) => logger.error({ err }, 'Redis connection error'));

// Dedicated connection for BullMQ (maxRetriesPerRequest must be null)
const bullConnection = new Redis(config.redis.url, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

bullConnection.on('error', (err) => logger.error({ err }, 'BullMQ Redis connection error'));

// Single BullMQ queue for background tasks
const nexusQueue = new Queue('nexus-jobs', {
  connection: bullConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

async function enqueue(name, data, options = {}) {
  return nexusQueue.add(name, data, options);
}

function isRedisReady() {
  return redis.status === 'ready';
}

async function closeRedis() {
  try {
    await nexusQueue.close();
    await bullConnection.quit();
    await redis.quit();
  } catch (err) {
    logger.warn({ err }, 'Error closing Redis connections');
  }
}

module.exports = {
  redis,
  bullConnection,
  nexusQueue,
  enqueue,
  isRedisReady,
  closeRedis,
};
