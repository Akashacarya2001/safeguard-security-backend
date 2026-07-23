const express = require('express');
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/auth.controller');

const router = express.Router();

router.post('/login', ctrl.login);
router.get('/me', authenticate, ctrl.me);

module.exports = router;
