'use strict';

const { Router } = require('express');
const ctrl = require('../controllers/user.controller');
const v = require('../validators/user.validator');
const validate = require('../middlewares/validate');
const authorize = require('../middlewares/authorize');
const { PERMISSIONS: P } = require('../constants/permissions');

const router = Router();

router.get('/', authorize(P.USER_READ), validate(v.list), ctrl.list);
router.post('/', authorize(P.USER_MANAGE), validate(v.create), ctrl.create);
router.get('/:id', authorize(P.USER_READ), validate(v.getById), ctrl.getById);
router.patch('/:id', authorize(P.USER_MANAGE), validate(v.update), ctrl.update);

module.exports = router;
