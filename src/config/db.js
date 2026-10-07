'use strict';

const mongoose = require('mongoose');
const config = require('./index');
const logger = require('./logger');

mongoose.set('strictQuery', true);

/**
 * Connects with an explicit connection pool and timeouts.
 * autoIndex is disabled in production: building indexes on a large live
 * collection can hurt it, so indexes are synced in a controlled step
 * (`npm run db:indexes`) as part of the deployment pipeline.
 */
async function connectDatabase(uri = config.mongo.uri) {
  mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('error', (err) => logger.error({ err }, 'MongoDB connection error'));

  await mongoose.connect(uri, {
    maxPoolSize: config.mongo.maxPoolSize,
    minPoolSize: config.mongo.minPoolSize,
    serverSelectionTimeoutMS: 5_000,
    socketTimeoutMS: 45_000,
    autoIndex: !config.isProduction,
  });

  return mongoose.connection;
}

async function disconnectDatabase() {
  await mongoose.disconnect();
}

function isDatabaseReady() {
  return mongoose.connection.readyState === 1;
}

module.exports = { connectDatabase, disconnectDatabase, isDatabaseReady };
