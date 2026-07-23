const { pool } = require('../config/db');
const zm = require('../services/zoneminder.service');

/**
 * Lists devices with a live stream URL attached — backs the Live Feeds view.
 * This is the ONE place the frontend gets a real video URL; it never talks
 * to ZoneMinder directly.
 */
async function listFeeds(req, res, next) {
  try {
    const [devices] = await pool.query('SELECT * FROM devices ORDER BY name');
    const feeds = await Promise.all(
      devices.map(async (d) => {
        if (d.status !== 'online' || !d.zm_monitor_id) {
          return { ...d, streamUrl: null };
        }
        try {
          const streamUrl = await zm.getLiveStreamUrl(d.zm_monitor_id);
          return { ...d, streamUrl };
        } catch {
          return { ...d, streamUrl: null };
        }
      })
    );
    res.json(feeds);
  } catch (err) {
    next(err);
  }
}

/**
 * Playback view: pulls recorded events for a device/date range from ZM.
 */
async function getPlayback(req, res, next) {
  try {
    const { deviceId } = req.params;
    const { date } = req.query; // YYYY-MM-DD
    if (!date) return res.status(400).json({ error: 'date query param is required' });

    const [rows] = await pool.query('SELECT * FROM devices WHERE id = ?', [deviceId]);
    const device = rows[0];
    if (!device) return res.status(404).json({ error: 'Device not found' });
    if (!device.zm_monitor_id) return res.status(422).json({ error: 'Device has no linked ZoneMinder monitor' });

    const events = await zm.listEvents(device.zm_monitor_id, {
      startTime: `${date} 00:00:00`,
      endTime: `${date} 23:59:59`,
    });
    res.json({ deviceId: device.id, date, events });
  } catch (err) {
    if (err.isAxiosError) {
      return res.status(502).json({ error: 'ZoneMinder is not reachable yet — this feature needs a live camera connection.' });
    }
    next(err);
  }
}

/**
 * Start/stop recording — flips the ZM monitor's Function state and logs a
 * recording_sessions row for audit purposes.
 */
async function startRecording(req, res, next) {
  try {
    const { deviceId } = req.params;
    const [rows] = await pool.query('SELECT * FROM devices WHERE id = ?', [deviceId]);
    const device = rows[0];
    if (!device) return res.status(404).json({ error: 'Device not found' });
    if (!device.zm_monitor_id) return res.status(422).json({ error: 'Device has no linked ZoneMinder monitor' });

    await zm.setRecording(device.zm_monitor_id, true);
    await pool.query(
      'INSERT INTO recording_sessions (device_id, started_at, started_by) VALUES (?, datetime(\'now\'), ?)',
      [device.id, req.user.id]
    );
    res.json({ ok: true, recording: true });
  } catch (err) {
    if (err.isAxiosError) {
      return res.status(502).json({ error: 'ZoneMinder is not reachable yet — this feature needs a live camera connection.' });
    }
    next(err);
  }
}

async function stopRecording(req, res, next) {
  try {
    const { deviceId } = req.params;
    const [rows] = await pool.query('SELECT * FROM devices WHERE id = ?', [deviceId]);
    const device = rows[0];
    if (!device) return res.status(404).json({ error: 'Device not found' });
    if (!device.zm_monitor_id) return res.status(422).json({ error: 'Device has no linked ZoneMinder monitor' });

    await zm.setRecording(device.zm_monitor_id, false);
    await pool.query(
      `UPDATE recording_sessions SET stopped_at = datetime('now')
       WHERE device_id = ? AND stopped_at IS NULL
       ORDER BY started_at DESC LIMIT 1`,
      [device.id]
    );
    res.json({ ok: true, recording: false });
  } catch (err) {
    if (err.isAxiosError) {
      return res.status(502).json({ error: 'ZoneMinder is not reachable yet — this feature needs a live camera connection.' });
    }
    next(err);
  }
}

module.exports = { listFeeds, getPlayback, startRecording, stopRecording };
