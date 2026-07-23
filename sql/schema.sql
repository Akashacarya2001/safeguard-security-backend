-- ============================================================================
-- SAFEGUARD SECURITY — application schema
-- ============================================================================
-- This creates a SEPARATE database ("safeguard_security") from ZoneMinder's own "zm"
-- database. We do not touch or recreate ZM's tables (Monitors, Events, Frames,
-- Users, etc.) — those stay exactly as ZoneMinder manages them.
--
-- Our "devices" table mirrors the ZM monitors we care about and stores a
-- pointer (zm_monitor_id) back to ZM's Monitors.Id. Camera video itself never
-- lives here — it stays in ZM's own storage. We only store our own
-- staff/permissions/alerts/schedules/config data.
--
-- Engine: InnoDB (foreign keys, transactions). Charset: utf8mb4 throughout.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS safeguard_security
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE safeguard_security;

-- ----------------------------------------------------------------------------
-- users — both Staff and Admin (GSA) accounts live in one table, split by role
-- ----------------------------------------------------------------------------
CREATE TABLE users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120)  NOT NULL,
  email         VARCHAR(190)  NOT NULL UNIQUE,
  password_hash VARCHAR(255)  NOT NULL,          -- bcrypt hash, never plaintext
  role          ENUM('staff','admin') NOT NULL DEFAULT 'staff',
  active        TINYINT(1)    NOT NULL DEFAULT 1,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- permissions — one row per user, fine-grained feature access
-- (this is what the Admin "Staff management" screen edits)
-- ----------------------------------------------------------------------------
CREATE TABLE permissions (
  user_id       INT UNSIGNED PRIMARY KEY,
  live_view     TINYINT(1) NOT NULL DEFAULT 1,
  playback      TINYINT(1) NOT NULL DEFAULT 0,
  recording     TINYINT(1) NOT NULL DEFAULT 0,
  schedule      TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- devices — our record of each camera, pointing at the matching ZM monitor
-- ----------------------------------------------------------------------------
CREATE TABLE devices (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  zm_monitor_id   INT UNSIGNED NULL,              -- FK-by-value into zm.Monitors.Id (cross-db, not enforced)
  name            VARCHAR(150) NOT NULL,           -- e.g. "Dish array — north pad"
  ip_address      VARCHAR(45)  NOT NULL,
  feed_type       ENUM('visual','visual_audio','thermal') NOT NULL DEFAULT 'visual',
  status          ENUM('online','offline') NOT NULL DEFAULT 'offline',
  last_checked_at DATETIME NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_zm_monitor (zm_monitor_id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- alerts — motion detection notifications
-- populated either by our own polling of ZM's Events table, or pushed here
-- directly by a ZM event trigger/webhook (see zoneminder.service.js)
-- ----------------------------------------------------------------------------
CREATE TABLE alerts (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_id        INT UNSIGNED NOT NULL,
  zm_event_id      INT UNSIGNED NULL,              -- FK-by-value into zm.Events.Id
  severity         ENUM('low','medium','high') NOT NULL DEFAULT 'low',
  message          VARCHAR(255) NOT NULL,
  occurred_at      DATETIME NOT NULL,
  acknowledged     TINYINT(1) NOT NULL DEFAULT 0,
  acknowledged_by  INT UNSIGNED NULL,
  acknowledged_at  DATETIME NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
  FOREIGN KEY (acknowledged_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_device_time (device_id, occurred_at),
  INDEX idx_unacked (acknowledged, occurred_at)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- schedules — planned future recordings, pushed to ZM as monitor Function
-- changes at the scheduled time (via a cron/worker, see services layer)
-- ----------------------------------------------------------------------------
CREATE TABLE schedules (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_id        INT UNSIGNED NOT NULL,
  start_time       TIME NOT NULL,
  duration_minutes SMALLINT UNSIGNED NOT NULL,
  repeat_pattern   ENUM('daily','weekdays','weekends','once') NOT NULL DEFAULT 'daily',
  specific_date    DATE NULL,                      -- only used when repeat_pattern = 'once'
  active           TINYINT(1) NOT NULL DEFAULT 1,
  created_by       INT UNSIGNED NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- recording_sessions — audit trail of manual start/stop actions (not the
-- video itself — that lives in ZM's own storage/event tables)
-- ----------------------------------------------------------------------------
CREATE TABLE recording_sessions (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_id   INT UNSIGNED NOT NULL,
  started_at  DATETIME NOT NULL,
  stopped_at  DATETIME NULL,
  started_by  INT UNSIGNED NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
  FOREIGN KEY (started_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- system_config — single-row table, Admin-only
-- ----------------------------------------------------------------------------
CREATE TABLE system_config (
  id                       TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
  retention_days           SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  auto_delete              TINYINT(1) NOT NULL DEFAULT 1,
  power_outage_behavior    ENUM('continue_on_backup','pause_and_alert') NOT NULL DEFAULT 'continue_on_backup',
  internet_disruption_behavior ENUM('buffer_locally','alert_only') NOT NULL DEFAULT 'buffer_locally',
  email_alerts             TINYINT(1) NOT NULL DEFAULT 1,
  sms_alerts               TINYINT(1) NOT NULL DEFAULT 0,
  updated_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT single_row CHECK (id = 1)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- audit_log — who changed what, for accountability on an admin console
-- ----------------------------------------------------------------------------
CREATE TABLE audit_log (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NULL,
  action      VARCHAR(80)  NOT NULL,     -- e.g. 'device.create', 'staff.permissions.update'
  target_type VARCHAR(40)  NULL,
  target_id   INT UNSIGNED NULL,
  detail      JSON NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
