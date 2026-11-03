'use strict';

/**
 * AirdropNexus AI — X (Twitter) integration routes.
 */

const express = require('express');
const router = express.Router();
const config = require('../config/env');
const logger = require('../config/logger');
const { getDb, all, get, run } = require('../database/db');

router.get('/status', (req, res) => {
  const configured = Boolean(config.x.clientId && config.x.clientSecret);
  const conn = get("SELECT * FROM oauth_connections WHERE provider = 'x' ORDER BY updated_at DESC LIMIT 1");

  res.json({
    configured,
    connected: Boolean(conn),
    scopes: config.x.scopes,
    callbackUrl: config.x.callbackUrl || '(not set)',
    account: conn ? { username: conn.username, providerUserId: conn.provider_user_id, scope: conn.scope, expiresAt: conn.token_expires_at } : null,
    note: configured ? 'X OAuth credentials are configured. Use /auth/x/connect to link your account.' : 'X OAuth not configured. Set X_CLIENT_ID, X_CLIENT_SECRET, X_CALLBACK_URL in .env.',
  });
});

router.get('/disconnect', (req, res) => {
  run("DELETE FROM oauth_connections WHERE provider = 'x'");
  logger.info('X connection removed');
  res.json({ ok: true, connected: false });
});

module.exports = router;
