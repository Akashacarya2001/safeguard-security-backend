-- ============================================================================
-- SAFEGUARD SECURITY — SQLite schema (local development / no-install setup)
--
-- This is a like-for-like translation of sql/schema.sql + 002_rtsp_and_motion_media.sql
-- for SQLite instead of MariaDB — same tables, same columns, same purpose.
-- When you're ready to move to MariaDB for production, use sql/schema.sql
-- instead; the application code (query interface) doesn't change either way.
-- ============================================================================
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('staff','admin')),
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TRIGGER IF NOT EXISTS trg_users_updated_at AFTER UPDATE ON users BEGIN
  UPDATE users SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS permissions (
  user_id   INTEGER PRIMARY KEY,
  live_view INTEGER NOT NULL DEFAULT 1,
  playback  INTEGER NOT NULL DEFAULT 0,
  recording INTEGER NOT NULL DEFAULT 0,
  schedule  INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS devices (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  zm_monitor_id          INTEGER,
  name                   TEXT NOT NULL,
  ip_address             TEXT NOT NULL,
  rtsp_url               TEXT,
  channel_number         INTEGER NOT NULL DEFAULT 1,
  dvr_username           TEXT,
  dvr_password_encrypted TEXT,
  feed_type              TEXT NOT NULL DEFAULT 'visual' CHECK (feed_type IN ('visual','visual_audio','thermal')),
  status                 TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online','offline')),
  last_checked_at        TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TRIGGER IF NOT EXISTS trg_devices_updated_at AFTER UPDATE ON devices BEGIN
  UPDATE devices SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS alerts (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id             INTEGER NOT NULL,
  zm_event_id           INTEGER,
  severity              TEXT NOT NULL DEFAULT 'low' CHECK (severity IN ('low','medium','high')),
  message               TEXT NOT NULL,
  screenshot_path       TEXT,
  clip_path             TEXT,
  clip_duration_seconds INTEGER,
  media_synced_at       TEXT,
  occurred_at           TEXT NOT NULL,
  acknowledged          INTEGER NOT NULL DEFAULT 0,
  acknowledged_by       INTEGER,
  acknowledged_at       TEXT,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
  FOREIGN KEY (acknowledged_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_alerts_device_time ON alerts(device_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_alerts_unacked ON alerts(acknowledged, occurred_at);

CREATE TABLE IF NOT EXISTS schedules (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id        INTEGER NOT NULL,
  start_time       TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  repeat_pattern   TEXT NOT NULL DEFAULT 'daily' CHECK (repeat_pattern IN ('daily','weekdays','weekends','once')),
  specific_date    TEXT,
  active           INTEGER NOT NULL DEFAULT 1,
  created_by       INTEGER,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS recording_sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id  INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  stopped_at TEXT,
  started_by INTEGER,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
  FOREIGN KEY (started_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS system_config (
  id                           INTEGER PRIMARY KEY CHECK (id = 1),
  retention_days               INTEGER NOT NULL DEFAULT 30,
  auto_delete                  INTEGER NOT NULL DEFAULT 1,
  power_outage_behavior        TEXT NOT NULL DEFAULT 'continue_on_backup' CHECK (power_outage_behavior IN ('continue_on_backup','pause_and_alert')),
  internet_disruption_behavior TEXT NOT NULL DEFAULT 'buffer_locally' CHECK (internet_disruption_behavior IN ('buffer_locally','alert_only')),
  email_alerts                 INTEGER NOT NULL DEFAULT 1,
  sms_alerts                   INTEGER NOT NULL DEFAULT 0,
  updated_at                   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TRIGGER IF NOT EXISTS trg_system_config_updated_at AFTER UPDATE ON system_config BEGIN
  UPDATE system_config SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   INTEGER,
  detail      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS event_sync_state (
  device_id        INTEGER PRIMARY KEY,
  last_zm_event_id INTEGER NOT NULL DEFAULT 0,
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);
