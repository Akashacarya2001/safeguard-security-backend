const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const ctrl = require('../controllers/staff.controller');

const router = express.Router();

// Every route here requires an authenticated Admin (GSA) token — a Staff
// token will get a 403 even if they somehow guess these URLs.
router.use(authenticate, requireRole('admin'));

router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.patch('/:id/permissions', ctrl.updatePermissions);
router.patch('/:id/active', ctrl.setActive);
router.delete('/:id', ctrl.remove);

module.exports = router;
