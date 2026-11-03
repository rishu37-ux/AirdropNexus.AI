'use strict';

/**
 * AirdropNexus AI — Auth routes.
 * Local auth is optional. OAuth 2.0 for X (Twitter) uses PKCE.
 * No passwords are collected into this app.
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const config = require('../config/env');
const logger = require('../config/logger');
const { getDb, all, get, run, exec } = require('../database/db');
const { encrypt } = require('../config/encryption');

const X_AUTHORIZE_URL = 'https://twitter.com/i/oauth2/authorize';
const X_TOKEN_URL = 'https://api.twitter.com/2/oauth2/token';

function generateCodeVerifier() {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

router.get('/status', (req, res) => {
  res.json({
    authenticated: !!req.session.userId,
    user: req.session.userId ? { id: req.session.userId, email: 'owner@airdropnexus.local', role: 'owner' } : null,
    localAuthEnabled: false,
  });
});

router.post('/demo-login', (req, res, next) => {
  const demoEnabled = process.env.ENABLE_DEMO_LOGIN === 'true' ||
    (config.env !== 'production' && process.env.ENABLE_DEMO_LOGIN !== 'false');
  if (!demoEnabled) {
    return res.status(403).json({ error: 'Demo login is disabled. Configure a real authentication provider.' });
  }
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.userId = 1;
    req.session.role = 'owner';
    req.session.save((saveErr) => {
      if (saveErr) return next(saveErr);
      logger.info('Demo login established', { userId: 1 });
      res.json({ ok: true, user: { id: 1, email: 'owner@airdropnexus.local', role: 'owner' } });
    });
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('an_session', { httpOnly: true, sameSite: 'lax', secure: config.env === 'production' });
    res.json({ ok: true });
  });
});

// ---------- X (Twitter) OAuth 2.0 with PKCE ----------
router.get('/x/connect', (req, res) => {
  if (!config.x.clientId || !config.x.clientSecret || !config.x.callbackUrl) {
    return res.status(400).json({
      error: 'X OAuth not configured. Set X_CLIENT_ID, X_CLIENT_SECRET, X_CALLBACK_URL in .env.',
    });
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = crypto.randomBytes(16).toString('hex');

  req.session.xCodeVerifier = codeVerifier;
  req.session.xOAuthState = state;
  req.session.xOAuthTs = Date.now();

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.x.clientId,
    redirect_uri: config.x.callbackUrl,
    scope: config.x.scopes.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  logger.info('X OAuth connect initiated', { state });
  res.redirect(`${X_AUTHORIZE_URL}?${params.toString()}`);
});

router.get('/x/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    logger.warn('X OAuth callback error', { error });
    return res.send(`<h3>X OAuth cancelled or failed</h3><p>${escapeHtml(error)}</p><a href="/">Return to dashboard</a>`);
  }

  if (!code || !state) {
    return res.status(400).send('<h3>Missing OAuth parameters</h3><a href="/">Return to dashboard</a>');
  }

  if (state !== req.session.xOAuthState) {
    logger.warn('X OAuth state mismatch');
    return res.status(400).send('<h3>Invalid OAuth state</h3><a href="/">Return to dashboard</a>');
  }

  const codeVerifier = req.session.xCodeVerifier;
  if (!codeVerifier) {
    return res.status(400).send('<h3>Missing code verifier</h3><a href="/">Return to dashboard</a>');
  }

  try {
    const basicAuth = Buffer.from(`${config.x.clientId}:${config.x.clientSecret}`).toString('base64');
    const tokenResp = await fetch(X_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.x.callbackUrl,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenResp.ok) {
      const text = await tokenResp.text();
      logger.error('X token exchange failed', { status: tokenResp.status, body: text });
      return res.status(500).send('<h3>Token exchange failed</h3><a href="/">Return to dashboard</a>');
    }

    const tokens = await tokenResp.json();

    const meResp = await fetch('https://api.twitter.com/2/users/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    let userInfo = null;
    if (meResp.ok) {
      userInfo = await meResp.json();
    }

    const now = new Date().toISOString();
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    const existing = get("SELECT id FROM oauth_connections WHERE provider = 'x' LIMIT 1");
    if (existing) {
      run(
        `UPDATE oauth_connections SET access_token_encrypted = ?, refresh_token_encrypted = ?,
         token_expires_at = ?, scope = ?, username = ?, provider_user_id = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [
          encrypt(tokens.access_token),
          encrypt(tokens.refresh_token || ''),
          expiresAt,
          config.x.scopes.join(','),
          userInfo ? (userInfo.data ? userInfo.data.username : null) : null,
          userInfo ? (userInfo.data ? userInfo.data.id : null) : null,
          existing.id,
        ]
      );
    } else {
      run(
        `INSERT INTO oauth_connections (user_id, provider, provider_user_id, username, access_token_encrypted,
         refresh_token_encrypted, token_expires_at, scope)
         VALUES (1, 'x', ?, ?, ?, ?, ?, ?)`,
        [
          userInfo ? (userInfo.data ? userInfo.data.id : null) : null,
          userInfo ? (userInfo.data ? userInfo.data.username : null) : null,
          encrypt(tokens.access_token),
          encrypt(tokens.refresh_token || ''),
          expiresAt,
          config.x.scopes.join(','),
        ]
      );
    }

    req.session.xCodeVerifier = null;
    req.session.xOAuthState = null;
    req.session.xOAuthTs = null;

    logger.info('X OAuth connected', { username: userInfo ? (userInfo.data ? userInfo.data.username : null) : null });
    res.send(`
      <h3>✅ X (Twitter) connected successfully</h3>
      <p>${userInfo ? (userInfo.data ? `Account: @${escapeHtml(userInfo.data.username)}` : 'Connected') : 'Connected'}</p>
      <a href="/" style="display:inline-block;margin-top:1rem;padding:0.5rem 1rem;background:#38bdf8;color:#02141e;border-radius:6px;text-decoration:none">Return to dashboard</a>
    `);
  } catch (e) {
    logger.error('X OAuth callback exception', { message: e.message });
    res.status(500).send(`<h3>OAuth error</h3><p>${escapeHtml(e.message)}</p><a href="/">Return to dashboard</a>`);
  }
});

function escapeHtml(text) {
  const s = String(text ?? '');
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = router;
