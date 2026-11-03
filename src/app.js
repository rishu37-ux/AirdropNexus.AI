'use strict';

/**
 * AirdropNexus AI — Main application entry point.
 * Sets up Express, security middleware, static files, API routes, and the worker.
 */

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const config = require('./config/env');
const logger = require('./config/logger');
const { initDb, closeDb } = require('./database/db');
const { runMigrations } = require('./database/migrate');

const app = express();

// Trust proxy (for correct IP/secure cookie behind reverse proxy)
app.set('trust proxy', 1);

// ---------- Security headers ----------
app.use(
  helmet({
    contentSecurityPolicy: false, // we serve inline CSP via our own HTML if needed
    crossOriginEmbedderPolicy: false,
  })
);

// ---------- CORS (explicit allowlist) ----------
const allowedOrigins = new Set([config.appUrl].filter(Boolean));
if (config.env !== 'production') {
  allowedOrigins.add('http://localhost:3000');
  allowedOrigins.add('http://127.0.0.1:3000');
}
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed by CORS'));
  },
  credentials: true,
}));

// ---------- Body parsing ----------
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ---------- Session ----------
app.use(
  session({
    name: 'an_session',
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: config.env === 'production',
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
    rolling: true,
  })
);

// ---------- Request logging (redacted) ----------
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// ---------- Rate limiting ----------
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per window
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many auth attempts, please try again later.' },
});
app.use('/api/auth/', authLimiter);

// ---------- Static frontend ----------
app.use(express.static(path.resolve(__dirname, '../public')));

// ---------- Health check ----------
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: config.appName,
    env: config.env,
    workerMode: config.worker.mode,
    workerEnabled: config.worker.enabled,
    timestamp: new Date().toISOString(),
  });
});

// ---------- API authentication + CSRF origin guard ----------
const publicApiPaths = new Set([
  '/api/auth/status',
  '/api/auth/demo-login',
  '/api/auth/x/callback',
  '/api/health',
]);
app.use('/api', (req, res, next) => {
  if (publicApiPaths.has(req.path)) return next();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.get('origin');
    if (origin && !allowedOrigins.has(origin)) {
      return res.status(403).json({ error: 'Request origin is not allowed' });
    }
  }
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
});

// ---------- API routes ----------
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/wallets', require('./routes/wallets'));
app.use('/api/search-profiles', require('./routes/searchProfiles'));
app.use('/api/agents', require('./routes/agents'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/campaigns', require('./routes/campaigns'));
app.use('/api/x', require('./routes/x'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/health', require('./routes/health'));

// ---------- Catch-all: serve frontend SPA for unknown routes ----------
app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../public/index.html'));
});

// ---------- Error handler (no secrets leaked) ----------
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(config.env === 'development' ? { stack: err.stack } : {}),
  });
});

// ---------- Start server ----------
async function start() {
  await initDb();
  runMigrations();

  const server = app.listen(config.port, () => {
    logger.info(`${config.appName} listening on port ${config.port} (${config.env})`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
      closeDb();
      logger.info('Server closed.');
    });
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received. Shutting down gracefully...');
    server.close(() => {
      closeDb();
      logger.info('Server closed.');
    });
  });
}

start().catch((err) => {
  logger.error('Failed to start server', { message: err.message });
  process.exit(1);
});

module.exports = app;
