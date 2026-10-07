'use strict';

const { Router } = require('express');
const ctrl = require('../controllers/task.controller');
const v = require('../validators/task.validator');
const validate = require('../middlewares/validate');
const authorize = require('../middlewares/authorize');
const { PERMISSIONS: P } = require('../constants/permissions');

const router = Router();

router.get('/me', authorize(P.TASK_READ), validate(v.listMine), ctrl.listMine);
router.get('/:id', authorize(P.TASK_READ), validate(v.getById), ctrl.getById);
// Either permission passes the route guard; the service then enforces ownership for `task:update`.
router.patch('/:id', authorize.any(P.TASK_UPDATE, P.TASK_UPDATE_ANY), validate(v.update), ctrl.update);
router.delete('/:id', authorize(P.TASK_DELETE), validate(v.remove), ctrl.remove);

module.exports = router;
