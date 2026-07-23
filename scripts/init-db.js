/**
 * Run with: npm run db:init
 *
 * Creates the SQLite database file, applies the schema, and inserts demo
 * data — the same three staff/six device/etc rows from the prototype — so
 * you have something to look at immediately. Safe to re-run; it wipes and
 * recreates the file each time (this is dev seed data, not production data).
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
require('dotenv').config();

const env = require('../src/config/env');

const dbFile = path.resolve(env.db.file);
fs.mkdirSync(path.dirname(dbFile), { recursive: true });
if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
// better-sqlite3 also creates -wal/-shm files alongside the db file; clear those too.
['-wal', '-shm'].forEach((suffix) => {
  const p = dbFile + suffix;
  if (fs.existsSync(p)) fs.unlinkSync(p);
});

const Database = require('better-sqlite3');
const db = new Database(dbFile);
db.pragma('foreign_keys = ON');

const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sqlite.sql'), 'utf8');
db.exec(schemaSql);
console.log('Schema applied.');

const TEMP_PASSWORD = 'ChangeMe123!';
const passwordHash = bcrypt.hashSync(TEMP_PASSWORD, 10);

const insertUser = db.prepare(
  'INSERT INTO users (name, email, password_hash, role, active) VALUES (?, ?, ?, ?, ?)'
);
const insertPerms = db.prepare(
  'INSERT INTO permissions (user_id, live_view, playback, recording, schedule) VALUES (?, ?, ?, ?, ?)'
);
const insertDevice = db.prepare(
  'INSERT INTO devices (zm_monitor_id, name, ip_address, feed_type, status) VALUES (?, ?, ?, ?, ?)'
);
const insertAlert = db.prepare(
  `INSERT INTO alerts (device_id, severity, message, occurred_at, acknowledged)
   VALUES (?, ?, ?, datetime('now', ?), ?)`
);
const insertSchedule = db.prepare(
  'INSERT INTO schedules (device_id, start_time, duration_minutes, repeat_pattern, created_by) VALUES (?, ?, ?, ?, ?)'
);

const seed = db.transaction(() => {
  const u1 = insertUser.run('Ariana Fell', 'ariana.fell@groundstation.io', passwordHash, 'staff', 1).lastInsertRowid;
  const u2 = insertUser.run('Devan Okafor', 'devan.okafor@groundstation.io', passwordHash, 'admin', 1).lastInsertRowid;
  const u3 = insertUser.run('Priya Shenoy', 'priya.shenoy@groundstation.io', passwordHash, 'staff', 0).lastInsertRowid;

  insertPerms.run(u1, 1, 1, 1, 0);
  insertPerms.run(u2, 1, 1, 1, 1);
  insertPerms.run(u3, 1, 0, 0, 0);

  const d1 = insertDevice.run(1, 'Dish array — north pad', '10.0.4.21', 'visual_audio', 'online').lastInsertRowid;
  const d2 = insertDevice.run(2, 'Tracking antenna — bay 2', '10.0.4.22', 'visual', 'online').lastInsertRowid;
  insertDevice.run(3, 'Payload integration bay', '10.0.4.23', 'visual', 'online');
  insertDevice.run(4, 'Perimeter — east fence', '10.0.4.24', 'thermal', 'offline');
  const d5 = insertDevice.run(5, 'Launch pad approach', '10.0.4.25', 'visual_audio', 'online').lastInsertRowid;
  insertDevice.run(6, 'Mission control roof', '10.0.4.26', 'visual', 'online');

  insertAlert.run(d1, 'high', 'Motion detected — unscheduled personnel near dish array', '-12 minutes', 0);
  insertAlert.run(d5, 'medium', 'Motion detected — vehicle entering approach corridor', '-40 minutes', 0);
  insertAlert.run(d2, 'low', 'Motion detected — routine antenna repositioning', '-65 minutes', 1);

  insertSchedule.run(d1, '22:00', 120, 'daily', u2);
  insertSchedule.run(d5, '06:00', 45, 'weekdays', u2);

  db.prepare(
    `INSERT INTO system_config (id, retention_days, auto_delete, power_outage_behavior, internet_disruption_behavior, email_alerts, sms_alerts)
     VALUES (1, 30, 1, 'continue_on_backup', 'buffer_locally', 1, 0)`
  ).run();
});
seed();

console.log('Seed data inserted.');
console.log('');
console.log('Demo login (all seeded accounts use this password — change it after first login):');
console.log(`  password: ${TEMP_PASSWORD}`);
console.log('  staff  -> ariana.fell@groundstation.io');
console.log('  admin  -> devan.okafor@groundstation.io  (Priya is inactive on purpose, to demo that state)');
console.log('');
console.log(`Database ready at ${dbFile}`);

db.close();
