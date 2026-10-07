'use strict';

const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const pinoHttp = require('pino-http');

const config = require('./config');
const logger = require('./config/logger');
const sanitize = require('./middlewares/sanitize');
const { apiLimiter } = require('./middlewares/rateLimiter');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');

/**
 * Builds the Express app without starting a server or connecting to the DB,
 * so it can be reused by any entry point.
 */
function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy); // correct client IPs behind a load balancer

  // Request id + structured access log. Reuses an upstream X-Request-Id for distributed tracing.
  app.use(pinoHttp({
    logger,
    genReqId: (req, res) => {
      const incoming = req.headers['x-request-id'];
      const id = typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    autoLogging: { ignore: (req) => req.url.startsWith('/health') },
    serializers: {
      req: (req) => ({ id: req.id, method: req.method, url: req.url }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  }));

  app.use(helmet());
  app.use(cors({ origin: config.cors.origins, maxAge: 600 }));
  app.use(compression());
  app.use(express.json({ limit: '100kb' }));
  app.use(sanitize);

  app.use('/health', require('./routes/health.routes'));
  app.use('/api/v1', apiLimiter, require('./routes'));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
