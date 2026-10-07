'use strict';

const { Schema, model } = require('mongoose');
const { ALL_PERMISSIONS } = require('../constants/permissions');

/**
 * Roles are data, not code.
 * - System roles (organization = null) are shared by every tenant and cannot be edited.
 * - Custom roles belong to one organization.
 */
const roleSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: [/^[a-z][a-z0-9_-]{1,39}$/, 'Invalid role name'],
    },
    description: { type: String, trim: true, maxlength: 300, default: '' },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', default: null },
    permissions: {
      type: [{ type: String, enum: ALL_PERMISSIONS }],
      validate: {
        validator: (perms) => new Set(perms).size === perms.length,
        message: 'Permissions must be unique',
      },
    },
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false },
);

// A role name is unique inside its organization (system roles share organization = null).
roleSchema.index({ organization: 1, name: 1 }, { unique: true });

module.exports = model('Role', roleSchema);
