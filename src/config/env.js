require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

module.exports = {
  port: process.env.PORT || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',

  db: {
    file: process.env.DB_FILE || './data/safeguardsecurity.db',
  },

  zm: {
    baseUrl: (process.env.ZM_BASE_URL || 'http://localhost:8080/zm').replace(/\/$/, ''),
    apiUser: process.env.ZM_API_USER || '',
    apiPassword: process.env.ZM_API_PASSWORD || '',
    authMode: process.env.ZM_AUTH_MODE || 'token', // 'token' | 'legacy'
  },

  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),

  media: {
    storageDir: process.env.MEDIA_STORAGE_DIR || './media',
    publicBaseUrl: process.env.MEDIA_PUBLIC_BASE_URL || '/media',
  },
  eventSyncIntervalSeconds: Number(process.env.EVENT_SYNC_INTERVAL_SECONDS || 20),
};
