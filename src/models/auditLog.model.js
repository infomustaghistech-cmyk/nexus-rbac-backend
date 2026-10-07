'use strict';

const { Schema, model } = require('mongoose');
const config = require('../config');

const auditLogSchema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    action: { type: String, required: true, trim: true },
    resourceType: { type: String, default: null, trim: true },
    resourceId: { type: String, default: null, trim: true },
    changes: { type: Schema.Types.Mixed, default: null },
    ip: { type: String, default: null, trim: true },
    userAgent: { type: String, default: null, trim: true },
    requestId: { type: String, default: null, trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  {
    timestamps: false,
    versionKey: false,
  },
);

auditLogSchema.index({ organization: 1, _id: -1 });
auditLogSchema.index({ organization: 1, actor: 1, _id: -1 });
auditLogSchema.index({ organization: 1, action: 1, _id: -1 });
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: (config.auditRetentionDays || 365) * 86400 });

module.exports = model('AuditLog', auditLogSchema);
