'use strict';

const { Router } = require('express');
const ctrl = require('../controllers/project.controller');
const taskCtrl = require('../controllers/task.controller');
const v = require('../validators/project.validator');
const tv = require('../validators/task.validator');
const validate = require('../middlewares/validate');
const authorize = require('../middlewares/authorize');
const { PERMISSIONS: P } = require('../constants/permissions');

const router = Router();

router.get('/', authorize(P.PROJECT_READ), validate(v.list), ctrl.list);
router.post('/', authorize(P.PROJECT_CREATE), validate(v.create), ctrl.create);
router.get('/:id', authorize(P.PROJECT_READ), validate(v.getById), ctrl.getById);
router.patch('/:id', authorize(P.PROJECT_UPDATE), validate(v.update), ctrl.update);
router.delete('/:id', authorize(P.PROJECT_DELETE), validate(v.remove), ctrl.remove);

// Nested membership resource (embedded array in the project document).
router.post('/:id/members', authorize(P.PROJECT_UPDATE), validate(v.addMember), ctrl.addMember);
router.delete('/:id/members/:userId', authorize(P.PROJECT_UPDATE), validate(v.removeMember), ctrl.removeMember);

// Nested task collection.
router.get('/:projectId/tasks', authorize(P.TASK_READ), validate(tv.listByProject), taskCtrl.listByProject);
router.post('/:projectId/tasks', authorize(P.TASK_CREATE), validate(tv.create), taskCtrl.create);

module.exports = router;
