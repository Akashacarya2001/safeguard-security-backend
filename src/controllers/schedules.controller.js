const { pool } = require('../config/db');

async function list(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT s.*, d.name AS device_name FROM schedules s
       JOIN devices d ON d.id = s.device_id
       ORDER BY s.start_time`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { device_id, start_time, duration_minutes, repeat_pattern, specific_date } = req.body;
    if (!device_id || !start_time || !duration_minutes || !repeat_pattern) {
      return res.status(400).json({ error: 'device_id, start_time, duration_minutes, and repeat_pattern are required' });
    }
    const [result] = await pool.query(
      `INSERT INTO schedules (device_id, start_time, duration_minutes, repeat_pattern, specific_date, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [device_id, start_time, duration_minutes, repeat_pattern, specific_date || null, req.user.id]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await pool.query('DELETE FROM schedules WHERE id = ?', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, remove };
