'use strict';

/**
 * Permission strings follow a `resource:action[:scope]` convention.
 * Code always checks PERMISSIONS (never role names), so new roles can be
 * created at runtime without touching application code.
 */
const PERMISSIONS = Object.freeze({
  ORG_READ: 'org:read',
  ORG_MANAGE: 'org:manage',

  USER_READ: 'user:read',
  USER_MANAGE: 'user:manage',

  ROLE_READ: 'role:read',
  ROLE_MANAGE: 'role:manage',

  PROJECT_CREATE: 'project:create',
  PROJECT_READ: 'project:read',
  PROJECT_UPDATE: 'project:update',
  PROJECT_DELETE: 'project:delete',

  TASK_CREATE: 'task:create',
  TASK_READ: 'task:read',
  TASK_UPDATE: 'task:update', // only tasks the user created or is assigned to
  TASK_UPDATE_ANY: 'task:update:any', // any task in the organization
  TASK_DELETE: 'task:delete',

  AUDIT_READ: 'audit:read',
});

const ALL_PERMISSIONS = Object.freeze(Object.values(PERMISSIONS));

const P = PERMISSIONS;

/** Built-in roles seeded into the database. Organizations can add custom roles. */
const SYSTEM_ROLES = Object.freeze({
  admin: {
    description: 'Full access to the organization',
    permissions: [...ALL_PERMISSIONS],
  },
  manager: {
    description: 'Manages projects, tasks and can view team members',
    permissions: [
      P.ORG_READ, P.USER_READ, P.ROLE_READ,
      P.PROJECT_CREATE, P.PROJECT_READ, P.PROJECT_UPDATE, P.PROJECT_DELETE,
      P.TASK_CREATE, P.TASK_READ, P.TASK_UPDATE, P.TASK_UPDATE_ANY, P.TASK_DELETE,
    ],
  },
  member: {
    description: 'Works on tasks inside projects',
    permissions: [P.ORG_READ, P.USER_READ, P.PROJECT_READ, P.TASK_CREATE, P.TASK_READ, P.TASK_UPDATE],
  },
  viewer: {
    description: 'Read-only access',
    permissions: [P.ORG_READ, P.PROJECT_READ, P.TASK_READ],
  },
});

const DEFAULT_ROLE = 'member';
const OWNER_ROLE = 'admin';

module.exports = { PERMISSIONS, ALL_PERMISSIONS, SYSTEM_ROLES, DEFAULT_ROLE, OWNER_ROLE };
