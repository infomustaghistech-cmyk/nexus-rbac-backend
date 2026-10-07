'use strict';

const roleService = require('../services/role.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendNoContent } = require('../utils/response');
const { ALL_PERMISSIONS } = require('../constants/permissions');

module.exports = {
  list: asyncHandler(async (req, res) => {
    sendSuccess(res, await roleService.listRoles(req.auth.orgId));
  }),
  listPermissions: (_req, res) => sendSuccess(res, ALL_PERMISSIONS),
  create: asyncHandler(async (req, res) => {
    sendSuccess(res, await roleService.createRole(req.auth, req.body), { status: 201 });
  }),
  update: asyncHandler(async (req, res) => {
    sendSuccess(res, await roleService.updateRole(req.auth, req.params.id, req.body));
  }),
  remove: asyncHandler(async (req, res) => {
    await roleService.deleteRole(req.auth, req.params.id);
    sendNoContent(res);
  }),
};
