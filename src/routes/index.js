'use strict';

const { Router } = require('express');
const authenticate = require('../middlewares/authenticate');
const authorize = require('../middlewares/authorize');
const validate = require('../middlewares/validate');
const { PERMISSIONS } = require('../constants/permissions');
const userController = require('../controllers/user.controller');
const userValidators = require('../validators/user.validator');

const router = Router();

router.use('/auth', require('./auth.routes'));

// Everything below requires a valid access token.
router.use(authenticate);
router.use('/users', require('./user.routes'));
router.use('/roles', require('./role.routes'));
router.use('/projects', require('./project.routes'));
router.use('/tasks', require('./task.routes'));

router.get('/audit-logs', authorize(PERMISSIONS.AUDIT_READ), validate(userValidators.listAuditLogs), userController.listAuditLogs);

module.exports = router;
