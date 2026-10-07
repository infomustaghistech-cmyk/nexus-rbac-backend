'use strict';

const { Schema, model } = require('mongoose');
const { ORG_PLAN } = require('../constants/enums');

/** Tenant root. Every other business document carries an `organization` reference. */
const organizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    slug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug may contain lowercase letters, numbers and dashes'],
    },
    plan: { type: String, enum: ORG_PLAN, default: 'free' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false },
);

organizationSchema.index({ slug: 1 }, { unique: true });

module.exports = model('Organization', organizationSchema);
