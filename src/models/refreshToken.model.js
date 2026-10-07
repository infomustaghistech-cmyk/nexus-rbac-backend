'use strict';

const { Schema, model } = require('mongoose');

/**
 * Refresh tokens are opaque random strings; only their SHA-256 hash is stored,
 * so a database leak does not expose usable tokens.
 * `family` groups a chain of rotated tokens: if an already-used token is presented
 * again (token theft), the whole family is revoked.
 */
const refreshTokenSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true },
    family: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedByHash: { type: String, default: null },
    createdByIp: { type: String, default: null },
    userAgent: { type: String, maxlength: 500, default: null },
  },
  { timestamps: true, versionKey: false },
);

refreshTokenSchema.index({ tokenHash: 1 }, { unique: true });
refreshTokenSchema.index({ family: 1 });
refreshTokenSchema.index({ user: 1, revokedAt: 1 });
// TTL index: MongoDB deletes expired tokens automatically, so the collection never grows unbounded.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = model('RefreshToken', refreshTokenSchema);
