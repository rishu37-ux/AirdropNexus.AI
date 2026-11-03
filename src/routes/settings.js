'use strict';

/**
 * AirdropNexus AI — Settings route.
 */

const express = require('express');
const router = express.Router();
const logger = require('../config/logger');
const { getDb, all, get, run } = require('../database/db');

router.get('/', (req, res) => {
  const row = get('SELECT * FROM user_settings WHERE user_id = ?', [1]);
  res.json(row || {
    theme: 'system',
    timezone: 'Asia/Kolkata',
    daily_report_enabled: 0,
    daily_report_time: '09:00',
    daily_report_recipient: '',
    data_retention_days: 90,
    log_retention_days: 30,
    worker_mode: 'local',
  });
});

router.put('/', (req, res) => {
  const {
    theme, timezone, daily_report_enabled, daily_report_time,
    daily_report_recipient, data_retention_days, log_retention_days, worker_mode,
  } = req.body || {};

  const existing = get('SELECT id FROM user_settings WHERE user_id = ?', [1]);
  if (existing) {
    run(
      `UPDATE user_settings SET theme = ?, timezone = ?, daily_report_enabled = ?, daily_report_time = ?,
       daily_report_recipient = ?, data_retention_days = ?, log_retention_days = ?, worker_mode = ?,
       updated_at = datetime('now') WHERE user_id = 1`,
      [theme, timezone, daily_report_enabled ? 1 : 0, daily_report_time,
       daily_report_recipient, data_retention_days, log_retention_days, worker_mode]
    );
  } else {
    run(
      `INSERT INTO user_settings (user_id, theme, timezone, daily_report_enabled, daily_report_time,
       daily_report_recipient, data_retention_days, log_retention_days, worker_mode)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [theme, timezone, daily_report_enabled ? 1 : 0, daily_report_time,
       daily_report_recipient, data_retention_days, log_retention_days, worker_mode]
    );
  }

  logger.info('Settings updated', { userId: 1 });
  res.json({ ok: true });
});

router.post('/export', (req, res) => {
  const tables = ['users', 'sessions', 'oauth_connections', 'provider_configs', 'agents', 'agent_assignments',
    'search_profiles', 'wallets', 'campaigns', 'x_posts', 'detected_matches', 'engagement_drafts',
    'job_queue', 'job_runs', 'activity_logs', 'daily_reports', 'user_settings', 'schema_migrations'];
  const exportData = {};
  for (const table of tables) {
    try {
      exportData[table] = all(`SELECT * FROM ${table}`);
    } catch (e) {
      exportData[table] = { error: e.message };
    }
  }
  res.json({ exportedAt: new Date().toISOString(), data: exportData });
});

module.exports = router;
