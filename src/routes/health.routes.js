'use strict';

const { Router } = require('express');
const { isDatabaseReady } = require('../config/db');
const { isRedisReady } = require('../config/redis');

const router = Router();

/** Liveness: the process is up. Used by Kubernetes / Docker to restart a hung container. */
router.get('/live', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

/** Readiness: dependencies are reachable. Load balancers stop routing traffic when this fails. */
router.get('/ready', (_req, res) => {
  const dbReady = isDatabaseReady();
  const redisReady = isRedisReady();
  const ready = dbReady && redisReady;
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    database: dbReady ? 'up' : 'down',
    redis: redisReady ? 'up' : 'down',
  });
});

module.exports = router;
