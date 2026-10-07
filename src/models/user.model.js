'use strict';

const { Schema, model } = require('mongoose');

const userSchema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email address'],
    },
    // Never returned by queries unless explicitly requested with .select('+password').
    password: { type: String, required: true, select: false },
    role: { type: Schema.Types.ObjectId, ref: 'Role', required: true },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
    mfa: {
      enabled: { type: Boolean, default: false },
      secret: { type: String, select: false, default: null },
      pendingSecret: { type: String, select: false, default: null },
      lastUsedStep: { type: Number, select: false, default: null },
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform: (_doc, ret) => {
        delete ret.password;
        return ret;
      },
    },
  },
);

// Login lookup + global uniqueness.
userSchema.index({ email: 1 }, { unique: true });
// "List users in my organization", newest first / filtered by role.
userSchema.index({ organization: 1, createdAt: -1 });
userSchema.index({ organization: 1, role: 1 });

module.exports = model('User', userSchema);
