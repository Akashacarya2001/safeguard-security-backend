const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const env = require('./config/env');
const { verifyConnection } = require('./config/db');
const { errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const staffRoutes = require('./routes/staff.routes');
const devicesRoutes = require('./routes/devices.routes');
const systemRoutes = require('./routes/system.routes');
const feedsRoutes = require('./routes/feeds.routes');
const alertsRoutes = require('./routes/alerts.routes');
const schedulesRoutes = require('./routes/schedules.routes');

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.corsOrigins.length ? env.corsOrigins : true,
    credentials: true,
  })
);
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));

// --- Auth (open) ---
app.use('/api/auth', authRoutes);

// --- Staff-only surface: live feeds, alerts, playback, recording, schedule ---
app.use('/api/feeds', feedsRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/schedules', schedulesRoutes);

// --- Admin (GSA)-only surface: staff mgmt, devices, system config ---
app.use('/api/staff', staffRoutes);
app.use('/api/devices', devicesRoutes);
app.use('/api/system-config', systemRoutes);

// --- Proxy for Warner SDK to bypass browser CORS ---
app.all('/api/vendor/warner/seekDomain', async (req, res) => {
  try {
    const response = await fetch('https://app-api.warner.co.in/UserApi/seekDomain', {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
      },
      // Only attach a body if it's not a GET/HEAD request
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body)
    });
    
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Warner API Proxy Error:', error);
    res.status(500).json({ error: 'Failed to fetch from vendor API' });
  }
});
// ---------------------------------------------------

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

async function start() {
  try {
    await verifyConnection();
    console.log('Connected to the database.');
  } catch (err) {
    console.error('Could not connect to the database. Check DB_* env vars.', err.message);
    process.exit(1);
  }

  app.listen(env.port, () => {
    console.log(`SAFEGUARD SECURITY API listening on port ${env.port} (${env.nodeEnv})`);
  });
}

start();
