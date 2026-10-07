'use strict';

const { Schema, model } = require('mongoose');
const { PROJECT_STATUS, PROJECT_MEMBER_ROLE, LIMITS } = require('../constants/enums');

/**
 * Embedded vs referenced (the key MongoDB modelling decision):
 * - `members` is EMBEDDED: it is bounded (capped at MAX_PROJECT_MEMBERS) and is
 *   almost always read together with the project, so one read returns everything.
 * - Tasks are REFERENCED in their own collection: they are unbounded and would
 *   eventually push the document toward the 16 MB limit.
 * - `taskStats` is a denormalised counter updated with atomic $inc, so dashboards
 *   never have to run count queries over the tasks collection.
 */
const memberSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    projectRole: { type: String, enum: PROJECT_MEMBER_ROLE, default: 'contributor' },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const projectSchema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 150 },
    description: { type: String, trim: true, maxlength: 5000, default: '' },
    status: { type: String, enum: PROJECT_STATUS, default: 'active' },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    members: {
      type: [memberSchema],
      validate: {
        validator: (m) => m.length <= LIMITS.MAX_PROJECT_MEMBERS,
        message: `A project can have at most ${LIMITS.MAX_PROJECT_MEMBERS} members`,
      },
    },
    tags: {
      type: [{ type: String, trim: true, lowercase: true, maxlength: 30 }],
      validate: { validator: (t) => t.length <= LIMITS.MAX_TAGS, message: `At most ${LIMITS.MAX_TAGS} tags` },
    },
    taskStats: {
      total: { type: Number, default: 0, min: 0 },
      done: { type: Number, default: 0, min: 0 },
    },
  },
  { timestamps: true, versionKey: false },
);

// Main listing query: projects of an organization filtered by status, newest first.
projectSchema.index({ organization: 1, status: 1, createdAt: -1 });
// "Projects I am a member of" (multikey index on the embedded array).
projectSchema.index({ organization: 1, 'members.user': 1 });
// Project names are unique inside an organization.
projectSchema.index({ organization: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
// Full-text search on name/description.
projectSchema.index({ name: 'text', description: 'text' }, { weights: { name: 5, description: 1 } });

module.exports = model('Project', projectSchema);
