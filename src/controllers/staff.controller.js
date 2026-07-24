const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { pool } = require('../config/db');

async function list(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.active,
              p.live_view, p.playback, p.recording, p.schedule
       FROM users u LEFT JOIN permissions p ON p.user_id = u.id
       ORDER BY u.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  const conn = await pool.getConnection();
  try {
    const { name, email, role } = req.body;
    if (!name || !email || !['staff', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'name, email, and a valid role are required' });
    }

    // Generate a one-time temporary password — real deployments should email
    // this as a reset link rather than returning it in the response.
    const tempPassword = crypto.randomBytes(9).toString('base64url');
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    await conn.beginTransaction();
    const [result] = await conn.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, email, passwordHash, role]
    );
    const defaultPerms = role === 'admin'
      ? { live_view: 1, playback: 1, recording: 1, schedule: 1 }
      : { live_view: 1, playback: 0, recording: 0, schedule: 0 };
    await conn.query(
      'INSERT INTO permissions (user_id, live_view, playback, recording, schedule) VALUES (?, ?, ?, ?, ?)',
      [result.insertId, defaultPerms.live_view, defaultPerms.playback, defaultPerms.recording, defaultPerms.schedule]
    );
    await conn.query(
      'INSERT INTO audit_log (user_id, action, target_type, target_id) VALUES (?, ?, ?, ?)',
      [req.user.id, 'staff.create', 'user', result.insertId]
    );
    await conn.commit();

    res.status(201).json({ id: result.insertId, name, email, role, tempPassword });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY' || /UNIQUE constraint failed/.test(err.message || '')) {
      return res.status(409).json({ error: 'A user with that email already exists' });
    }
    next(err);
  } finally {
    conn.release();
  }
}

async function updatePermissions(req, res, next) {
  try {
    const { id } = req.params;
    const { live_view, playback, recording, schedule } = req.body;
    await pool.query(
      `UPDATE permissions SET live_view = ?, playback = ?, recording = ?, schedule = ? WHERE user_id = ?`,
     [live_view ? 1 : 0, playback ? 1 : 0, recording ? 1 : 0, schedule ? 1 : 0, id]
    );
    await pool.query(
      'INSERT INTO audit_log (user_id, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, 'staff.permissions.update', 'user', id, JSON.stringify(req.body)]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function setActive(req, res, next) {
  try {
    const { id } = req.params;
    const { active } = req.body;
  await pool.query('UPDATE users SET active = ? WHERE id = ?', [active ? 1 : 0, id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM users WHERE id = ?', [id]);
    await pool.query(
      'INSERT INTO audit_log (user_id, action, target_type, target_id) VALUES (?, ?, ?, ?)',
      [req.user.id, 'staff.delete', 'user', id]
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, updatePermissions, setActive, remove };
