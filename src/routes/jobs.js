'use strict';

/**
 * AirdropNexus AI — Job Queue routes.
 */

const express = require('express');
const { param, validationResult } = require('express-validator');
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
  const { status, agent_id, page = 1, limit = 50 } = req.query;
  const pageNum = Math.max(parseInt(page, 10), 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10), 1), 200);
  const offset = (pageNum - 1) * limitNum;

  let where = 'WHERE j.agent_id IN (SELECT id FROM agents WHERE user_id = 1)';
  const params = [];

  if (status) {
    where += ' AND j.status = ?';
    params.push(status);
  }
  if (agent_id) {
    where += ' AND j.agent_id = ?';
    params.push(agent_id);
  }

  const rows = all(
    `SELECT j.*, a.name AS agent_name FROM job_queue j LEFT JOIN agents a ON j.agent_id = a.id ${where} ORDER BY j.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limitNum, offset]
  );

  res.json({ jobs: rows, page: pageNum, limit: limitNum });
});

router.get('/:id', [param('id').isInt(), handleValidation], (req, res) => {
  const row = get('SELECT * FROM job_queue WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Job not found' });
  res.json(row);
});

router.get('/:id/runs', [param('id').isInt(), handleValidation], (req, res) => {
  const runs = all(
    `SELECT * FROM job_runs WHERE job_id = ? ORDER BY created_at DESC`,
    [req.params.id]
  );
  res.json({ runs });
});

router.post('/:id/cancel', [param('id').isInt(), handleValidation], (req, res) => {
  const row = get('SELECT status FROM job_queue WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Job not found' });
  if (!['queued', 'running'].includes(row.status)) {
    return res.status(400).json({ error: 'Only queued or running jobs can be canceled' });
  }
  run('UPDATE job_queue SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', ['canceled', req.params.id]);
  res.json({ ok: true, status: 'canceled' });
});

module.exports = router;
