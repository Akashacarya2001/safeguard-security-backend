const { pool } = require('../config/db');
const zm = require('../services/zoneminder.service');
const { encrypt } = require('../utils/crypto');

// Never return this column to the client, under any circumstances.
const SAFE_DEVICE_COLUMNS =
  'id, zm_monitor_id, name, ip_address, rtsp_url, channel_number, dvr_username, feed_type, status, last_checked_at, created_at, updated_at';

async function list(req, res, next) {
  try {
    const [rows] = await pool.query(`SELECT ${SAFE_DEVICE_COLUMNS} FROM devices ORDER BY name`);
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

/**
 * Registers a device. If an rtsp_url is provided (the normal path now that
 * cameras are on-prem via DVR/NVR, not TrueCloud Plus), this also creates
 * the matching ZoneMinder monitor automatically — Admin never has to open
 * ZM's own UI. If zm_monitor_id is passed directly instead, we assume the
 * monitor already exists in ZM and just link to it.
 */
async function create(req, res, next) {
  try {
    const { name, ip_address, feed_type, zm_monitor_id, rtsp_url, channel_number, dvr_username, dvr_password } = req.body;
    if (!name || !ip_address) {
      return res.status(400).json({ error: 'name and ip_address are required' });
    }
    if (!zm_monitor_id && !rtsp_url) {
      return res.status(400).json({ error: 'Provide either an rtsp_url (to auto-create the ZM monitor) or an existing zm_monitor_id' });
    }

    let resolvedMonitorId = zm_monitor_id || null;
    if (!resolvedMonitorId && rtsp_url) {
      resolvedMonitorId = await zm.createMonitor({
        name,
        rtspUrl: rtsp_url,
        username: dvr_username,
        password: dvr_password,
      });
    }

    const encryptedPassword = dvr_password ? encrypt(dvr_password) : null;

    const [result] = await pool.query(
      `INSERT INTO devices
        (zm_monitor_id, name, ip_address, rtsp_url, channel_number, dvr_username, dvr_password_encrypted, feed_type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        resolvedMonitorId,
        name,
        ip_address,
        rtsp_url || null,
        channel_number || 1,
        dvr_username || null,
        encryptedPassword,
        feed_type || 'visual',
        'offline',
      ]
    );
    await pool.query(
      'INSERT INTO audit_log (user_id, action, target_type, target_id) VALUES (?, ?, ?, ?)',
      [req.user.id, 'device.create', 'device', result.insertId]
    );
    res.status(201).json({ id: result.insertId, zm_monitor_id: resolvedMonitorId });
  } catch (err) {
    if (err.isAxiosError) {
      return res.status(502).json({ error: 'Could not create the monitor in ZoneMinder. Check RTSP URL and credentials.' });
    }
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await pool.query('DELETE FROM devices WHERE id = ?', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

/**
 * Calls the real ZoneMinder API to check whether a monitor is actually
 * reachable, then updates our cached status column accordingly.
 */
async function testConnection(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT * FROM devices WHERE id = ?', [req.params.id]);
    const device = rows[0];
    if (!device) return res.status(404).json({ error: 'Device not found' });
    if (!device.zm_monitor_id) {
      return res.status(422).json({ error: 'Device is not linked to a ZoneMinder monitor yet' });
    }

    const result = await zm.testConnection(device.zm_monitor_id);
    const status = result.online ? 'online' : 'offline';
    await pool.query('UPDATE devices SET status = ?, last_checked_at = NOW() WHERE id = ?', [status, device.id]);

    res.json({ id: device.id, status, ...result });
  } catch (err) {
    // A ZM connection failure isn't a server bug — report it as "offline",
    // don't 500 the request.
    if (err.isAxiosError) {
      await pool.query('UPDATE devices SET status = ?, last_checked_at = NOW() WHERE id = ?', ['offline', req.params.id]);
      return res.json({ id: Number(req.params.id), status: 'offline', error: 'Could not reach ZoneMinder' });
    }
    next(err);
  }
}

module.exports = { list, create, remove, testConnection };
