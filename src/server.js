'use strict';

const config = require('./config');
const logger = require('./config/logger');
const { connectDatabase, disconnectDatabase } = require('./config/db');
const { closeRedis } = require('./config/redis');
const { ensureSystemRoles } = require('./services/role.service');
const { createApp } = require('./app');

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function start() {
  await connectDatabase();
  await ensureSystemRoles();

  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.env }, 'Server listening');
  });

  // Keep-alive slightly above typical load balancer idle timeouts (AWS ALB = 60s) to avoid 502s.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  /**
   * Graceful shutdown: stop accepting new connections, let in-flight requests finish,
   * then close the DB pool and Redis connections. Zero-downtime rolling deploys depend on this.
   */
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down gracefully');

    const force = setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    force.unref();

    server.close(async () => {
      await disconnectDatabase();
      await closeRedis();
      logger.info('Shutdown complete');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
