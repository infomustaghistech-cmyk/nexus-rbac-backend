'use strict';

module.exports = Object.freeze({
  PROJECT_STATUS: ['active', 'completed', 'archived'],
  PROJECT_MEMBER_ROLE: ['lead', 'contributor', 'observer'],
  TASK_STATUS: ['todo', 'in_progress', 'review', 'done'],
  TASK_PRIORITY: ['low', 'medium', 'high', 'urgent'],
  ORG_PLAN: ['free', 'pro', 'enterprise'],
  LIMITS: Object.freeze({
    MAX_PROJECT_MEMBERS: 200,
    MAX_CHECKLIST_ITEMS: 50,
    MAX_TAGS: 20,
    DEFAULT_PAGE_SIZE: 20,
    MAX_PAGE_SIZE: 100,
  }),
});
