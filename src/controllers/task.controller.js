'use strict';

const taskService = require('../services/task.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendNoContent } = require('../utils/response');

module.exports = {
  create: asyncHandler(async (req, res) => {
    sendSuccess(res, await taskService.createTask(req.auth, req.params.projectId, req.body), { status: 201 });
  }),
  listByProject: asyncHandler(async (req, res) => {
    const { items, meta } = await taskService.listProjectTasks(req.auth, req.params.projectId, req.query);
    sendSuccess(res, items, { meta });
  }),
  listMine: asyncHandler(async (req, res) => {
    const { items, meta } = await taskService.listMyTasks(req.auth, req.query);
    sendSuccess(res, items, { meta });
  }),
  getById: asyncHandler(async (req, res) => {
    sendSuccess(res, await taskService.getTask(req.auth, req.params.id));
  }),
  update: asyncHandler(async (req, res) => {
    sendSuccess(res, await taskService.updateTask(req.auth, req.params.id, req.body));
  }),
  remove: asyncHandler(async (req, res) => {
    await taskService.deleteTask(req.auth, req.params.id);
    sendNoContent(res);
  }),
};
