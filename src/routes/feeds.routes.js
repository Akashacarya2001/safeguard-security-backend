const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const ctrl = require('../controllers/feeds.controller');

const router = express.Router();

router.use(authenticate, requireRole('staff'));

router.get('/', ctrl.listFeeds);
router.get('/:deviceId/playback', ctrl.getPlayback);
router.post('/:deviceId/recording/start', ctrl.startRecording);
router.post('/:deviceId/recording/stop', ctrl.stopRecording);

module.exports = router;
