'use strict';

/**
 * Centralised, validated configuration.
 * The app refuses to boot with missing or weak settings (fail fast),
 * so misconfiguration is caught at deploy time instead of at runtime.
 */
const fs = require('fs');
require('dotenv').config({ quiet: true });
const { z } = require('zod');

// Secrets Manager / Docker secrets / Kubernetes secrets support:
// If <NAME>_FILE is set, read the secret from the file before schema validation.
const secretFileVars = ['JWT_ACCESS_SECRET', 'MFA_ENCRYPTION_KEY', 'MONGO_URI', 'REDIS_URL'];
for (const name of secretFileVars) {
  const fileVar = `${name}_FILE`;
  if (process.env[fileVar]) {
    try {
      process.env[name] = fs.readFileSync(process.env[fileVar], 'utf8').trim();
    } catch {
      // Ignored here; let Zod validate the resulting env var.
    }
  }
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
  MONGO_MAX_POOL_SIZE: z.coerce.number().int().positive().default(50),
  MONGO_MIN_POOL_SIZE: z.coerce.number().int().min(0).default(5),

  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_ISSUER: z.string().default('nexus-rbac-api'),
  JWT_AUDIENCE: z.string().default('nexus-clients'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),

  MFA_ENCRYPTION_KEY: z.string().min(32, 'MFA_ENCRYPTION_KEY must be at least 32 characters'),

  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  LOGIN_LOCK_SECONDS: z.coerce.number().int().positive().default(15),
  LOGIN_ATTEMPT_RESET_MINUTES: z.coerce.number().int().positive().default(60),

  AUDIT_RETENTION_DAYS: z.coerce.number().int().positive().default(365),
  PASSWORD_BREACH_CHECK: z.preprocess((v) => (v === undefined ? true : v === 'true' || v === true), z.boolean()).default(true),

  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),

  CORS_ORIGINS: z.string().default('*'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),

  ROLE_CACHE_TTL_MS: z.coerce.number().int().min(0).default(60_000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // Logger is not available yet (it depends on config), so use stderr directly.
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const env = parsed.data;

module.exports = Object.freeze({
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: env.PORT,
  trustProxy: env.TRUST_PROXY,
  mongo: {
    uri: env.MONGO_URI,
    maxPoolSize: env.MONGO_MAX_POOL_SIZE,
    minPoolSize: env.MONGO_MIN_POOL_SIZE,
  },
  redis: {
    url: env.REDIS_URL,
  },
  jwt: {
    accessSecret: env.JWT_ACCESS_SECRET,
    accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  },
  refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
  mfaEncryptionKey: env.MFA_ENCRYPTION_KEY,
  lockout: {
    maxAttempts: env.LOGIN_MAX_ATTEMPTS,
    lockSeconds: env.LOGIN_LOCK_SECONDS,
    resetMinutes: env.LOGIN_ATTEMPT_RESET_MINUTES,
  },
  auditRetentionDays: env.AUDIT_RETENTION_DAYS,
  passwordBreachCheck: env.PASSWORD_BREACH_CHECK,
  bcryptSaltRounds: env.BCRYPT_SALT_ROUNDS,
  cors: {
    origins: env.CORS_ORIGINS === '*' ? '*' : env.CORS_ORIGINS.split(',').map((o) => o.trim()),
  },
  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    authMax: env.AUTH_RATE_LIMIT_MAX,
  },
  roleCacheTtlMs: env.ROLE_CACHE_TTL_MS,
  logLevel: env.LOG_LEVEL,
});
