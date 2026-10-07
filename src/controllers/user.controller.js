'use strict';

const userService = require('../services/user.service');
const auditService = require('../services/audit.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');

module.exports = {
  list: asyncHandler(async (req, res) => {
    const { items, meta } = await userService.listUsers(req.auth, req.query);
    sendSuccess(res, items, { meta });
  }),
  getById: asyncHandler(async (req, res) => {
    sendSuccess(res, await userService.getUser(req.auth, req.params.id));
  }),
  create: asyncHandler(async (req, res) => {
    sendSuccess(res, await userService.createUser(req.auth, req.body), { status: 201 });
  }),
  update: asyncHandler(async (req, res) => {
    sendSuccess(res, await userService.updateUser(req.auth, req.params.id, req.body));
  }),
  listAuditLogs: asyncHandler(async (req, res) => {
    const result = await auditService.listAuditLogs(req.auth, req.query);
    sendSuccess(res, result.items, { meta: result.meta });
  }),
};
