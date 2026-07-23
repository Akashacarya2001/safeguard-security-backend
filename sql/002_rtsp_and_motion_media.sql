-- ============================================================================
-- Migration 002 — RTSP device onboarding + motion event media capture
--
-- Context: cameras are wired into a local DVR/NVR (not the TrueCloud Plus
-- cloud app — that's a closed consumer app with no public API). We talk to
-- the DVR directly over RTSP/ONVIF on the LAN, with ZoneMinder doing the
-- actual motion detection + recording, same as before.
--
-- This migration:
--   1. Lets Admin register a device by its RTSP URL + DVR credentials once;
--      the backend uses that to auto-create the matching monitor in ZM.
--   2. Adds screenshot_path / clip_path to alerts, so every motion alert can
--      carry the actual snapshot + short clip pulled from ZM.
-- ============================================================================
USE safeguard_security;

ALTER TABLE devices
  ADD COLUMN rtsp_url VARCHAR(500) NULL AFTER ip_address,
  ADD COLUMN channel_number TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER rtsp_url,
  ADD COLUMN dvr_username VARCHAR(100) NULL AFTER channel_number,
  ADD COLUMN dvr_password_encrypted VARCHAR(255) NULL AFTER dvr_username;
  -- dvr_password_encrypted is AES-256-GCM ciphertext (see src/utils/crypto.js),
  -- never plaintext. Only decrypted in-memory, only when calling ZM's API.

ALTER TABLE alerts
  ADD COLUMN screenshot_path VARCHAR(500) NULL AFTER message,
  ADD COLUMN clip_path VARCHAR(500) NULL AFTER screenshot_path,
  ADD COLUMN clip_duration_seconds SMALLINT UNSIGNED NULL AFTER clip_path,
  ADD COLUMN media_synced_at DATETIME NULL AFTER clip_duration_seconds;

-- Tracks sync progress per device so the polling worker never re-processes
-- the same ZM event twice.
CREATE TABLE IF NOT EXISTS event_sync_state (
  device_id         INT UNSIGNED PRIMARY KEY,
  last_zm_event_id  INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
) ENGINE=InnoDB;
