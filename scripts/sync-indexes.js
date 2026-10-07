'use strict';

/**
 * Creates/updates indexes declared in the Mongoose schemas (and drops ones that were removed).
 * Run as a deployment step, because autoIndex is off in production.
 *   npm run db:indexes
 */
const logger = require('../src/config/logger');
const { connectDatabase, disconnectDatabase } = require('../src/config/db');
const models = require('../src/models');

(async () => {
  try {
    await connectDatabase();
    for (const [name, model] of Object.entries(models)) {
      const dropped = await model.syncIndexes();
      logger.info({ model: name, dropped }, 'Indexes synced');
    }
  } catch (err) {
    logger.fatal({ err }, 'Index sync failed');
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
})();
