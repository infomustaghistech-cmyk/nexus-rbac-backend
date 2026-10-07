'use strict';

const { Router } = require('express');
const ctrl = require('../controllers/auth.controller');
const v = require('../validators/auth.validator');
const validate = require('../middlewares/validate');
const authenticate = require('../middlewares/authenticate');
const { authLimiter } = require('../middlewares/rateLimiter');

const router = Router();

router.post('/register', authLimiter, validate(v.register), ctrl.register);
router.post('/login', authLimiter, validate(v.login), ctrl.login);
router.post('/2fa/setup', authenticate, ctrl.setup2FA);
router.post('/2fa/enable', authenticate, validate(v.enable2FA), ctrl.enable2FA);
router.post('/2fa/disable', authenticate, validate(v.disable2FA), ctrl.disable2FA);
router.post('/2fa/verify', authLimiter, validate(v.verify2FA), ctrl.verify2FA);
router.post('/refresh', authLimiter, validate(v.refresh), ctrl.refresh);
router.post('/logout', validate(v.logout), ctrl.logout);
router.post('/logout-all', authenticate, ctrl.logoutAll);
router.get('/me', authenticate, ctrl.me);

module.exports = router;
