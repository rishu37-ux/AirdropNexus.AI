'use strict';

/**
 * AirdropNexus AI — Agent routes.
 */

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const router = express.Router();
const logger = require('../config/logger');
const { getDb, all, get, run } = require('../database/db');

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }
  next();
};

router.get('/', (req, res) => {
  const rows = all(
    `SELECT a.*, pc.provider AS provider_name, pc.model AS provider_model
     FROM agents a LEFT JOIN provider_configs pc ON a.provider_config_id = pc.id
     WHERE a.user_id = 1 ORDER BY a.created_at DESC`
  );
  res.json(rows.map((r) => ({
    ...r,
    keywords: r.keywords ? JSON.parse(r.keywords) : [],
    networks: r.networks ? JSON.parse(r.networks) : [],
  })));
});

router.get('/:id', [param('id').isInt(), handleValidation], (req, res) => {
  const row = get('SELECT * FROM agents WHERE id = ? AND user_id = 1', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Agent not found' });
  res.json({
    ...row,
    keywords: row.keywords ? JSON.parse(row.keywords) : [],
    networks: row.networks ? JSON.parse(row.networks) : [],
  });
});

router.post('/', [
  body('name').notEmpty().trim().escape(),
  body('description').optional().trim().escape(),
  body('role').optional().trim().escape(),
  body('enabled').optional().isBoolean(),
  body('schedule_type').optional().isIn(['manual', 'hourly', 'every_n_minutes', 'daily']),
  body('schedule_value').optional().isInt({ min: 1 }),
  body('keywords').optional().isArray(),
  body('networks').optional().isArray(),
  body('rate_limit').optional().isInt({ min: 1 }),
  body('volume_limit').optional().isInt({ min: 1 }),
  body('retry_count').optional().isInt({ min: 0 }),
  handleValidation,
], (req, res) => {
  const {
    name, description, role, enabled = 1, schedule_type = 'manual',
    schedule_value = 60, keywords = [], networks = [], rate_limit = 60,
    volume_limit = 100, retry_count = 3,
  } = req.body;

  const result = run(
    `INSERT INTO agents (user_id, name, description, role, enabled, schedule_type, schedule_value,
       keywords, networks, rate_limit, volume_limit, retry_count, status)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'idle')`,
    [
      name, description || null, role || null, enabled ? 1 : 0, schedule_type, schedule_value,
      JSON.stringify(keywords), JSON.stringify(networks), rate_limit, volume_limit, retry_count,
    ]
  );

  logger.info('Agent created', { userId: 1, agentId: result.lastInsertRowid, name });
  res.status(201).json({
    id: result.lastInsertRowid, name, enabled, schedule_type, status: 'idle',
  });
});

router.put('/:id', [
  param('id').isInt(),
  body('name').optional().notEmpty().trim().escape(),
  body('enabled').optional().isBoolean(),
  body('schedule_type').optional().isIn(['manual', 'hourly', 'every_n_minutes', 'daily']),
  body('schedule_value').optional().isInt({ min: 1 }),
  handleValidation,
], (req, res) => {
  const existing = get('SELECT * FROM agents WHERE id = ? AND user_id = 1', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Agent not found' });

  const updates = [];
  const params = [];
  const fields = ['name', 'description', 'role', 'enabled', 'schedule_type', 'schedule_value', 'keywords', 'networks', 'rate_limit', 'volume_limit', 'retry_count'];
  const jsonFields = ['keywords', 'networks'];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      let val = req.body[f];
      if (jsonFields.includes(f)) val = JSON.stringify(val);
      if (f === 'enabled') val = val ? 1 : 0;
      updates.push(`${f} = ?`);
      params.push(val);
    }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  updates.push('updated_at = datetime(\'now\')');
  params.push(req.params.id);

  run(`UPDATE agents SET ${updates.join(', ')} WHERE id = ?`, params);
  logger.info('Agent updated', { userId: 1, agentId: req.params.id });
  res.json({ ok: true });
});

router.delete('/:id', [param('id').isInt(), handleValidation], (req, res) => {
  const result = run('DELETE FROM agents WHERE id = ? AND user_id = 1', [req.params.id]);
  if (result.changes === 0) return res.status(404).json({ error: 'Agent not found' });
  res.json({ ok: true });
});

router.post('/:id/toggle', [param('id').isInt(), handleValidation], (req, res) => {
  const row = get('SELECT enabled FROM agents WHERE id = ? AND user_id = 1', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Agent not found' });

  const nextEnabled = row.enabled === 1 ? 0 : 1;
  run('UPDATE agents SET enabled = ?, updated_at = datetime(\'now\') WHERE id = ?', [nextEnabled, req.params.id]);
  logger.info('Agent toggled', { userId: 1, agentId: req.params.id, enabled: nextEnabled });
  res.json({ ok: true, enabled: nextEnabled });
});

router.post('/:id/run', [param('id').isInt(), handleValidation], (req, res) => {
  const row = get('SELECT * FROM agents WHERE id = ? AND user_id = 1', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Agent not found' });

  const jobResult = run(
    `INSERT INTO job_queue (agent_id, job_type, status, scheduled_at, created_at)
     VALUES (?, 'manual', 'queued', datetime('now'), datetime('now'))`,
    [row.id]
  );

  logger.info('Agent manual run triggered', { userId: 1, agentId: row.id, jobId: jobResult.lastInsertRowid });
  res.json({ ok: true, jobId: jobResult.lastInsertRowid, status: 'queued' });
});

module.exports = router;
