-- ============================================================================
-- SAFEGUARD SECURITY — seed data
-- Passwords below are the bcrypt hash of "ChangeMe123!" — log in once, then
-- change every password immediately. Never ship this seed file to production
-- with real accounts.
-- ============================================================================
USE safeguard_security;

INSERT INTO users (name, email, password_hash, role, active) VALUES
  ('Ariana Fell',  'ariana.fell@groundstation.io',  '$2b$10$8k1e0kM9V0h5N2y8u1KcTeQx0nq3l0m2ZQeYV1r1w6cGx1zC1WYUe', 'staff', 1),
  ('Devan Okafor', 'devan.okafor@groundstation.io', '$2b$10$8k1e0kM9V0h5N2y8u1KcTeQx0nq3l0m2ZQeYV1r1w6cGx1zC1WYUe', 'admin', 1),
  ('Priya Shenoy', 'priya.shenoy@groundstation.io', '$2b$10$8k1e0kM9V0h5N2y8u1KcTeQx0nq3l0m2ZQeYV1r1w6cGx1zC1WYUe', 'staff', 0);

INSERT INTO permissions (user_id, live_view, playback, recording, schedule) VALUES
  (1, 1, 1, 1, 0),
  (2, 1, 1, 1, 1),
  (3, 1, 0, 0, 0);

INSERT INTO devices (zm_monitor_id, name, ip_address, feed_type, status) VALUES
  (1, 'Dish array — north pad',    '10.0.4.21', 'visual_audio', 'online'),
  (2, 'Tracking antenna — bay 2',  '10.0.4.22', 'visual',       'online'),
  (3, 'Payload integration bay',   '10.0.4.23', 'visual',       'online'),
  (4, 'Perimeter — east fence',    '10.0.4.24', 'thermal',      'offline'),
  (5, 'Launch pad approach',       '10.0.4.25', 'visual_audio', 'online'),
  (6, 'Mission control roof',      '10.0.4.26', 'visual',       'online');

INSERT INTO alerts (device_id, severity, message, occurred_at, acknowledged) VALUES
  (1, 'high',   'Motion detected — unscheduled personnel near dish array', NOW() - INTERVAL 12 MINUTE, 0),
  (5, 'medium', 'Motion detected — vehicle entering approach corridor',    NOW() - INTERVAL 40 MINUTE, 0),
  (2, 'low',    'Motion detected — routine antenna repositioning',        NOW() - INTERVAL 65 MINUTE, 1);

INSERT INTO schedules (device_id, start_time, duration_minutes, repeat_pattern, created_by) VALUES
  (1, '22:00:00', 120, 'daily',    2),
  (5, '06:00:00', 45,  'weekdays', 2);

INSERT INTO system_config (id, retention_days, auto_delete, power_outage_behavior, internet_disruption_behavior, email_alerts, sms_alerts)
VALUES (1, 30, 1, 'continue_on_backup', 'buffer_locally', 1, 0)
ON DUPLICATE KEY UPDATE retention_days = VALUES(retention_days);
