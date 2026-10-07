'use strict';

const { Router } = require('express');
const ctrl = require('../controllers/role.controller');
const v = require('../validators/role.validator');
const validate = require('../middlewares/validate');
const authorize = require('../middlewares/authorize');
const { PERMISSIONS: P } = require('../constants/permissions');

const router = Router();

router.get('/', authorize(P.ROLE_READ), ctrl.list);
router.get('/permissions', authorize(P.ROLE_READ), ctrl.listPermissions);
router.post('/', authorize(P.ROLE_MANAGE), validate(v.create), ctrl.create);
router.patch('/:id', authorize(P.ROLE_MANAGE), validate(v.update), ctrl.update);
router.delete('/:id', authorize(P.ROLE_MANAGE), validate(v.remove), ctrl.remove);

module.exports = router;
