'use strict';

const projectService = require('../services/project.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendNoContent } = require('../utils/response');

module.exports = {
  create: asyncHandler(async (req, res) => {
    sendSuccess(res, await projectService.createProject(req.auth, req.body), { status: 201 });
  }),
  list: asyncHandler(async (req, res) => {
    const { items, meta } = await projectService.listProjects(req.auth, req.query);
    sendSuccess(res, items, { meta });
  }),
  getById: asyncHandler(async (req, res) => {
    sendSuccess(res, await projectService.getProject(req.auth, req.params.id));
  }),
  update: asyncHandler(async (req, res) => {
    sendSuccess(res, await projectService.updateProject(req.auth, req.params.id, req.body));
  }),
  remove: asyncHandler(async (req, res) => {
    await projectService.deleteProject(req.auth, req.params.id);
    sendNoContent(res);
  }),
  addMember: asyncHandler(async (req, res) => {
    sendSuccess(res, await projectService.addMember(req.auth, req.params.id, req.body));
  }),
  removeMember: asyncHandler(async (req, res) => {
    sendSuccess(res, await projectService.removeMember(req.auth, req.params.id, req.params.userId));
  }),
};
