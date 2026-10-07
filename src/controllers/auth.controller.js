'use strict';

const authService = require('../services/auth.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendNoContent } = require('../utils/response');

const requestMeta = (req) => ({
  ip: req.ip,
  userAgent: req.get('user-agent'),
  requestId: req.id || req.headers['x-request-id'] || null,
});

module.exports = {
  register: asyncHandler(async (req, res) => {
    sendSuccess(res, await authService.register(req.body, requestMeta(req)), { status: 201 });
  }),
  login: asyncHandler(async (req, res) => {
    sendSuccess(res, await authService.login(req.body, requestMeta(req)));
  }),
  setup2FA: asyncHandler(async (req, res) => {
    sendSuccess(res, await authService.setup2FA(req.auth));
  }),
  enable2FA: asyncHandler(async (req, res) => {
    sendSuccess(res, await authService.enable2FA(req.auth, req.body));
  }),
  disable2FA: asyncHandler(async (req, res) => {
    sendSuccess(res, await authService.disable2FA(req.auth, req.body));
  }),
  verify2FA: asyncHandler(async (req, res) => {
    sendSuccess(res, await authService.verify2FA(req.body, requestMeta(req)));
  }),
  refresh: asyncHandler(async (req, res) => {
    sendSuccess(res, await authService.refresh(req.body.refreshToken, requestMeta(req)));
  }),
  logout: asyncHandler(async (req, res) => {
    await authService.logout(req.body?.refreshToken, req.headers.authorization);
    sendNoContent(res);
  }),
  logoutAll: asyncHandler(async (req, res) => {
    await authService.logoutAll(req.auth);
    sendNoContent(res);
  }),
  me: asyncHandler(async (req, res) => {
    sendSuccess(res, await authService.getProfile(req.auth));
  }),
};
