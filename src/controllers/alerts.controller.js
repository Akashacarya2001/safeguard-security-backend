const { pool } = require('../config/db');

async function list(req, res, next) {
  try {
    const { deviceId, unacknowledgedOnly } = req.query;
    const clauses = [];
    const params = [];
    if (deviceId) {
      clauses.push('a.device_id = ?');
      params.push(deviceId);
    }
    if (unacknowledgedOnly === 'true') {
      clauses.push('a.acknowledged = 0');
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT a.*, d.name AS device_name FROM alerts a
       JOIN devices d ON d.id = a.device_id
       ${where}
       ORDER BY a.acknowledged ASC, a.occurred_at DESC
       LIMIT 100`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function acknowledge(req, res, next) {
  try {
    await pool.query(
      'UPDATE alerts SET acknowledged = 1, acknowledged_by = ?, acknowledged_at = NOW() WHERE id = ?',
      [req.user.id, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function acknowledgeAll(req, res, next) {
  try {
    await pool.query(
      'UPDATE alerts SET acknowledged = 1, acknowledged_by = ?, acknowledged_at = NOW() WHERE acknowledged = 0',
      [req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, acknowledge, acknowledgeAll };
