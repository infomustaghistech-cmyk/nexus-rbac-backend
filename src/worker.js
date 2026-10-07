'use strict';

const { Worker } = require('bullmq');
const config = require('./config');
const logger = require('./config/logger');
const { connectDatabase, disconnectDatabase } = require('./config/db');
const { bullConnection } = require('./config/redis');
const AuditLog = require('./models/auditLog.model');
const { taskRepository } = require('./repositories');

async function processJob(job) {
  logger.info({ jobName: job.name, jobId: job.id }, 'Processing job');

  switch (job.name) {
    case 'audit.record': {
      await AuditLog.create(job.data);
      break;
    }
    case 'project.cleanup': {
      const { orgId, projectId } = job.data;
      if (orgId && projectId) {
        const { deletedCount } = await taskRepository.deleteMany({
          organization: orgId,
          project: projectId,
        });
        logger.info({ orgId, projectId, tasksDeleted: deletedCount }, 'Cleaned up tasks for deleted project');
      }
      break;
    }
    default:
      logger.warn({ jobName: job.name }, 'Unknown job type');
  }
}

async function start() {
  await connectDatabase();

  const worker = new Worker('nexus-jobs', processJob, {
    connection: bullConnection,
    concurrency: 10,
  });

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id, name: job.name }, 'Job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, name: job?.name, err }, 'Job failed');
  });

  logger.info('Nexus BullMQ worker started');

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down worker gracefully');

    try {
      await worker.close();
      await disconnectDatabase();
      await bullConnection.quit();
      logger.info('Worker shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during worker shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  logger.fatal({ err }, 'Worker failed to start');
  process.exit(1);
});
