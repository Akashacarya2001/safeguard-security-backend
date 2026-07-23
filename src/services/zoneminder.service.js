/**
 * ZoneMinder integration layer.
 *
 * This wraps ZM's own REST/CGI API so the rest of our backend never talks to
 * ZM directly. That gives us one place to handle auth, retries, and version
 * differences between ZM releases.
 *
 * IMPORTANT — this is written against ZoneMinder's DOCUMENTED API shape
 * (confirmed against ZM 1.34+ token auth and the legacy CGI streaming
 * endpoints). It has not been run against a live ZM instance from this
 * environment, since no real ZM server or camera hardware is reachable here.
 * Before deploying: point ZM_BASE_URL at your real ZM install, run
 * `testConnection()` (wired to Admin's "Test" button), and adjust the
 * endpoint paths below if your ZM version's API differs — the ZM API has
 * changed shape a few times across major versions.
 *
 * Docs reference: https://zoneminder.readthedocs.io/en/stable/api.html
 */

const axios = require('axios');
const env = require('../config/env');

const zmHttp = axios.create({
  baseURL: env.zm.baseUrl,
  timeout: 8000,
});

let tokenCache = { accessToken: null, expiresAt: 0 };

/**
 * Authenticates against ZM and caches the token until it's close to expiry.
 * Supports both the modern token flow and the legacy session-cookie login,
 * selected via ZM_AUTH_MODE.
 */
async function getAuthToken() {
  if (env.zm.authMode === 'legacy') {
    // Legacy ZM: POST username/password, ZM returns a PHP session cookie
    // rather than a bearer token. Callers using this mode should attach
    // the returned cookie header instead of an Authorization header.
    const res = await zmHttp.post('/api/host/login.json', {
      user: env.zm.apiUser,
      pass: env.zm.apiPassword,
    });
    return { cookie: res.headers['set-cookie'], accessToken: null };
  }

  const now = Date.now();
  if (tokenCache.accessToken && tokenCache.expiresAt > now + 30_000) {
    return { accessToken: tokenCache.accessToken, cookie: null };
  }

  const res = await zmHttp.post('/api/host/login.json', {
    user: env.zm.apiUser,
    pass: env.zm.apiPassword,
  });

  tokenCache = {
    accessToken: res.data.access_token,
    expiresAt: now + (res.data.access_token_expires || 3600) * 1000,
  };
  return { accessToken: tokenCache.accessToken, cookie: null };
}

async function authedRequest(method, path, opts = {}) {
  const auth = await getAuthToken();
  const headers = { ...(opts.headers || {}) };
  const params = { ...(opts.params || {}) };

  if (auth.accessToken) {
    params.token = auth.accessToken; // ZM accepts the token as a query param too
  }
  if (auth.cookie) {
    headers.Cookie = auth.cookie;
  }

  return zmHttp.request({ method, url: path, params, headers, data: opts.data });
}

/**
 * Pings a single monitor's status. Used by Admin's "Test connection" button.
 */
async function testConnection(zmMonitorId) {
  const res = await authedRequest('get', `/api/monitors/${zmMonitorId}.json`);
  const monitor = res.data?.monitor?.Monitor;
  if (!monitor) return { online: false, detail: 'Monitor not found in ZoneMinder' };
  return {
    online: monitor.Enabled === '1',
    function: monitor.Function, // Monitor | Modect | Record | Mocord | Nodect
    width: monitor.Width,
    height: monitor.Height,
  };
}

/**
 * Returns the live MJPEG stream URL for a monitor, to embed in a <img> or
 * <video>-via-MSE element on the frontend. Token is appended so the stream
 * URL is directly usable without a separate auth handshake in the browser.
 */
async function getLiveStreamUrl(zmMonitorId) {
  const auth = await getAuthToken();
  const tokenParam = auth.accessToken ? `&token=${auth.accessToken}` : '';
  return `${env.zm.baseUrl}/cgi-bin/nph-zms?mode=jpeg&monitor=${zmMonitorId}&scale=100${tokenParam}`;
}

/**
 * Lists recorded events for a monitor within a time range — backs the
 * Playback view's timeline markers and clip list.
 */
function mapEvent(e) {
  return {
    id: Number(e.Event.Id),
    startTime: e.Event.StartTime,
    endTime: e.Event.EndTime,
    length: e.Event.Length,
    cause: e.Event.Cause,
    maxScore: e.Event.MaxScore != null ? Number(e.Event.MaxScore) : null,
    videoUrl: `${env.zm.baseUrl}/index.php?view=view_video&eid=${e.Event.Id}`,
  };
}

async function listEvents(zmMonitorId, { startTime, endTime } = {}) {
  const res = await authedRequest('get', '/api/events.json', {
    params: {
      MonitorId: zmMonitorId,
      'StartTime >=': startTime,
      'EndTime <=': endTime,
      sort: 'StartTime',
      direction: 'asc',
    },
  });
  const events = res.data?.events || [];
  return events.map(mapEvent);
}

/**
 * Polls for events newer than a given ZM event ID — what the motion-sync
 * worker uses instead of a time window, so nothing gets double-counted or
 * skipped across poll cycles.
 */
async function listNewEvents(zmMonitorId, sinceEventId, limit = 20) {
  const res = await authedRequest('get', '/api/events.json', {
    params: {
      MonitorId: zmMonitorId,
      'Id >': sinceEventId,
      sort: 'Id',
      direction: 'asc',
      limit,
    },
  });
  const events = res.data?.events || [];
  return events.map(mapEvent);
}

/**
 * Starts or stops recording on a monitor by changing its Function state.
 * ZM functions: 'Monitor' (view only, no recording) vs 'Record' / 'Mocord'
 * (continuous / motion-triggered recording).
 */
async function setRecording(zmMonitorId, shouldRecord) {
  const targetFunction = shouldRecord ? 'Mocord' : 'Monitor';
  await authedRequest('put', `/api/monitors/${zmMonitorId}.json`, {
    data: { Monitor: { Function: targetFunction } },
  });
  return { zmMonitorId, function: targetFunction };
}

/**
 * Creates a new ZM Monitor from an RTSP URL + DVR credentials, so Admin can
 * onboard a camera from our own "Add device" form without touching ZM's UI.
 * Returns the new zm_monitor_id.
 *
 * NOTE: ZM's Monitor object has many fields; this covers the ones needed for
 * a standard RTSP source with motion-triggered recording (Function:
 * 'Modect'). Field names/shape can differ slightly by ZM version — verify
 * against a real instance before relying on this in production.
 */
async function createMonitor({ name, rtspUrl, username, password, width = 1920, height = 1080 }) {
  // Most DVR RTSP URLs already embed a channel path (e.g. .../cam/realmonitor?channel=1&subtype=0).
  // We pass credentials separately rather than embedding them in the URL string
  // where possible, so they don't end up logged in plaintext by accident.
  const res = await authedRequest('post', '/api/monitors.json', {
    data: {
      Monitor: {
        Name: name,
        Function: 'Modect', // motion-triggered detection + recording
        Enabled: '1',
        Protocol: 'rtsp',
        Method: 'rtpRtsp',
        Host: '', // left blank when full Path is a complete rtsp:// URL
        Path: rtspUrl,
        User: username || '',
        Pass: password || '',
        Width: width,
        Height: height,
        Colours: '4',
      },
    },
  });
  const monitorId = res.data?.monitor?.Id;
  if (!monitorId) {
    throw Object.assign(new Error('ZoneMinder did not return a monitor ID'), { status: 502 });
  }
  return monitorId;
}

/**
 * Returns a direct URL to a single event's alarm frame (the frame that
 * triggered motion detection) — this is what we download as the alert's
 * "screenshot".
 */
async function getEventSnapshotUrl(zmEventId) {
  const auth = await getAuthToken();
  const tokenParam = auth.accessToken ? `&token=${auth.accessToken}` : '';
  // fid=alarm asks ZM for the specific alarm (motion-triggering) frame,
  // not just frame 1 — more useful for review than an arbitrary frame.
  return `${env.zm.baseUrl}/index.php?view=image&eid=${zmEventId}&fid=alarm${tokenParam}`;
}

/**
 * Returns a direct URL to an event's video clip (the short recording ZM
 * made around the motion event).
 */
async function getEventClipUrl(zmEventId) {
  const auth = await getAuthToken();
  const tokenParam = auth.accessToken ? `&token=${auth.accessToken}` : '';
  return `${env.zm.baseUrl}/index.php?view=view_video&eid=${zmEventId}${tokenParam}`;
}

/**
 * Downloads both the snapshot and clip for an event to local disk, returning
 * the paths our DB should store. Used by the event-sync worker right after
 * a new motion event is detected.
 */
async function downloadEventMedia(zmEventId, destDir) {
  const fs = require('fs');
  const path = require('path');
  const stream = require('stream');
  const { promisify } = require('util');
  const pipeline = promisify(stream.pipeline);

  fs.mkdirSync(destDir, { recursive: true });

  const snapshotUrl = await getEventSnapshotUrl(zmEventId);
  const clipUrl = await getEventClipUrl(zmEventId);

  const snapshotPath = path.join(destDir, `event-${zmEventId}-snapshot.jpg`);
  const clipPath = path.join(destDir, `event-${zmEventId}-clip.mp4`);

  const snapshotRes = await zmHttp.get(snapshotUrl.replace(env.zm.baseUrl, ''), { responseType: 'stream' });
  await pipeline(snapshotRes.data, fs.createWriteStream(snapshotPath));

  const clipRes = await zmHttp.get(clipUrl.replace(env.zm.baseUrl, ''), { responseType: 'stream' });
  await pipeline(clipRes.data, fs.createWriteStream(clipPath));

  return { snapshotPath, clipPath };
}

module.exports = {
  testConnection,
  getLiveStreamUrl,
  listEvents,
  listNewEvents,
  setRecording,
  createMonitor,
  getEventSnapshotUrl,
  getEventClipUrl,
  downloadEventMedia,
};
