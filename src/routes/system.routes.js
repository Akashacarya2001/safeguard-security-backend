const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const ctrl = require('../controllers/system.controller');

const router = express.Router();

router.use(authenticate, requireRole('admin'));

router.get('/', ctrl.get);
router.put('/', ctrl.update);

module.exports = router;
