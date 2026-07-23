const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const ctrl = require('../controllers/devices.controller');

const router = express.Router();

router.use(authenticate, requireRole('admin'));

router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.delete('/:id', ctrl.remove);
router.post('/:id/test-connection', ctrl.testConnection);

module.exports = router;
