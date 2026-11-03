'use strict';

/**
 * AirdropNexus AI — Health & integration status routes.
 */

const express = require('express');
const router = express.Router();
const config = require('../config/env');
const logger = require('../config/logger');
const { getDb, all, get, run } = require('../database/db');

router.get('/', (req, res) => {
  try {
    const lastRun = get(
      `SELECT completed_at, status FROM job_runs ORDER BY started_at DESC LIMIT 1`
    );

    const nextRun = get(
      `SELECT a.name, a.next_run_at FROM agents a WHERE a.enabled = 1 AND a.next_run_at IS NOT NULL ORDER BY a.next_run_at ASC LIMIT 1`
    );

    const xConn = get("SELECT COUNT(*) AS cnt FROM oauth_connections WHERE provider = 'x'");
    const aiProviders = get("SELECT COUNT(*) AS cnt FROM provider_configs WHERE api_key_encrypted IS NOT NULL");

    res.json({
      status: 'ok',
      service: config.appName,
      env: config.env,
      workerMode: config.worker.mode,
      workerEnabled: config.worker.enabled,
      workerIntervalMinutes: config.worker.intervalMinutes,
      lastHeartbeat: lastRun ? lastRun.completed_at : null,
      lastRunStatus: lastRun ? lastRun.status : null,
      nextScheduledRun: nextRun ? nextRun.next_run_at : null,
      nextAgent: nextRun ? nextRun.name : null,
      integrations: {
        x: {
          connected: (xConn && xConn.cnt > 0),
          scopes: config.x.scopes,
        },
        ai: {
          providersConfigured: (aiProviders && aiProviders.cnt > 0),
          ollama: { baseUrl: config.ai.ollamaBaseUrl, model: config.ai.ollamaModel },
        },
        smtp: {
          configured: Boolean(config.smtp.host && config.smtp.user && config.smtp.pass),
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('Health check failed', { message: err.message });
    res.status(500).json({ error: 'Health check failed' });
  }
});

module.exports = router;
