# SAFEGUARD SECURITY backend

API + ZoneMinder integration layer for the SAFEGUARD SECURITY space surveillance console.

## Stack
- **Node.js / Express** — REST API
- **MariaDB** — `safeguard_security` app database (staff, devices, alerts, schedules, config).
  Runs alongside ZoneMinder's own `zm` database — we never touch ZM's tables directly.
- **ZoneMinder** — actual camera/video/motion-detection engine. This backend calls
  ZM's REST API rather than reimplementing any of that.

## Setup

1. **Database**
   ```bash
   mysql -u root -p < sql/schema.sql
   mysql -u root -p < sql/seed.sql   # optional demo data
   ```
   Create a dedicated app user rather than using root:
   ```sql
   CREATE USER 'safeguard_security_app'@'%' IDENTIFIED BY 'a-real-password';
   GRANT ALL PRIVILEGES ON safeguard_security.* TO 'safeguard_security_app'@'%';
   FLUSH PRIVILEGES;
   ```

2. **Environment**
   ```bash
   cp .env.example .env
   ```
   Fill in `DB_*`, `JWT_SECRET` (long random string), and `ZM_*` (your real
   ZoneMinder instance URL + a service account you create in ZM for this).

3. **Install & run**
   ```bash
   npm install
   npm start        # or: npm run dev  (auto-restart on file changes)
   ```
   On boot the server checks the DB connection and exits immediately with a
   clear error if it can't reach MariaDB — it won't silently serve broken
   requests.

## Security model — how "Staff can't see Admin" is actually enforced

The two frontend consoles (staff-console.html / admin-console.html) hiding
each other's screens is a UX nicety, **not** the security boundary. The real
boundary is here, in two layers:

1. `middleware/auth.js` — verifies the JWT on every request, rejecting
   anything without a valid token.
2. `middleware/role.js` — `requireRole('admin')` or `requireRole('staff')` on
   every route file. A Staff-role token hitting `/api/devices` gets a 403,
   full stop — it doesn't matter what frontend they use or whether they
   found the admin HTML file's URL.

Route-level role assignment (see `src/routes/*.routes.js`):
- **Staff only:** `/api/feeds`, `/api/alerts`, `/api/schedules`
- **Admin only:** `/api/staff`, `/api/devices`, `/api/system-config`
- **Either (authenticated):** `/api/auth/me`

## ZoneMinder integration

`src/services/zoneminder.service.js` is the only file that talks to ZM. It's
written against ZM's documented API shape but **has not been tested against
a live ZM instance** — there's no real ZM server or camera hardware reachable
from this environment. Before going live:

1. Point `ZM_BASE_URL` at your real ZoneMinder install.
2. Create a `devices` row per camera with the correct `zm_monitor_id`
   (matching ZM's `Monitors.Id`).
3. Hit `POST /api/devices/:id/test-connection` as an Admin and confirm it
   returns `online: true`.
4. Check your ZM version's API docs — the request/response shape has
   changed slightly across ZM 1.32 / 1.34 / 1.36+, so endpoint paths in
   `zoneminder.service.js` may need small adjustments.

## What's still needed for a real deployment

- A scheduler (e.g. `node-cron`, already in `package.json`) that reads the
  `schedules` table and calls `zm.setRecording()` at the right times — the
  table exists but nothing currently triggers on it automatically.
- A webhook or polling job that syncs ZM `Events` into our `alerts` table
  (or has ZM call a small endpoint here directly when motion fires).
- TLS termination (nginx/Caddy in front of this) — this app itself serves
  plain HTTP.
- Real password reset flow — `staff.controller.js` currently returns a
  temporary password in the API response for simplicity; a production
  build should email a reset link instead.
