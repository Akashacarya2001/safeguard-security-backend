const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const ctrl = require('../controllers/alerts.controller');

const router = express.Router();

router.use(authenticate, requireRole('staff'));

router.get('/', ctrl.list);
router.patch('/:id/acknowledge', ctrl.acknowledge);
router.patch('/acknowledge-all', ctrl.acknowledgeAll);

module.exports = router;
