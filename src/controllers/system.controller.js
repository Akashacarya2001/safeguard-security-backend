const { pool } = require('../config/db');

async function get(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT * FROM system_config WHERE id = 1');
    res.json(rows[0] || {});
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const {
      retention_days,
      auto_delete,
      power_outage_behavior,
      internet_disruption_behavior,
      email_alerts,
      sms_alerts,
    } = req.body;

    await pool.query(
      `UPDATE system_config SET
        retention_days = ?,
        auto_delete = ?,
        power_outage_behavior = ?,
        internet_disruption_behavior = ?,
        email_alerts = ?,
        sms_alerts = ?
       WHERE id = 1`,
      [
        retention_days,
        !!auto_delete,
        power_outage_behavior,
        internet_disruption_behavior,
        !!email_alerts,
        !!sms_alerts,
      ]
    );
    await pool.query(
      'INSERT INTO audit_log (user_id, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, 'system_config.update', 'system_config', 1, JSON.stringify(req.body)]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { get, update };
