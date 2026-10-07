'use strict';

const { Schema, model } = require('mongoose');
const { TASK_STATUS, TASK_PRIORITY, LIMITS } = require('../constants/enums');

/** Checklist items are small and bounded, so they are embedded in the task. */
const checklistItemSchema = new Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 300 },
    done: { type: Boolean, default: false },
  },
  { _id: true },
);

const taskSchema = new Schema(
  {
    // `organization` is duplicated on purpose: every query is tenant-scoped,
    // and having it here lets indexes start with it (no join to Project needed).
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    title: { type: String, required: true, trim: true, minlength: 2, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 10000, default: '' },
    status: { type: String, enum: TASK_STATUS, default: 'todo' },
    priority: { type: String, enum: TASK_PRIORITY, default: 'medium' },
    assignee: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    dueDate: { type: Date, default: null },
    labels: {
      type: [{ type: String, trim: true, lowercase: true, maxlength: 30 }],
      validate: { validator: (l) => l.length <= LIMITS.MAX_TAGS, message: `At most ${LIMITS.MAX_TAGS} labels` },
    },
    checklist: {
      type: [checklistItemSchema],
      validate: {
        validator: (c) => c.length <= LIMITS.MAX_CHECKLIST_ITEMS,
        message: `At most ${LIMITS.MAX_CHECKLIST_ITEMS} checklist items`,
      },
    },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

// Board view: tasks of a project by status, cursor-paginated on _id (ESR rule: Equality, Sort, Range).
taskSchema.index({ organization: 1, project: 1, status: 1, _id: -1 });
// Project task list without a status filter.
taskSchema.index({ organization: 1, project: 1, _id: -1 });
// "My tasks" view.
taskSchema.index({ organization: 1, assignee: 1, status: 1, _id: -1 });
// Overdue / upcoming tasks. Partial index keeps it small: only tasks that have a due date.
taskSchema.index(
  { organization: 1, dueDate: 1 },
  { partialFilterExpression: { dueDate: { $type: 'date' } } },
);

module.exports = model('Task', taskSchema);
