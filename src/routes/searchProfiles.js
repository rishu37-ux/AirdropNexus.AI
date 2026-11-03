'use strict';

/**
 * AirdropNexus AI — Search Profile routes.
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
  const rows = all('SELECT * FROM search_profiles WHERE user_id = 1 ORDER BY created_at DESC');
  res.json(rows.map((r) => ({
    ...r,
    networks: r.networks ? JSON.parse(r.networks) : [],
    project_names: r.project_names ? JSON.parse(r.project_names) : [],
    token_symbols: r.token_symbols ? JSON.parse(r.token_symbols) : [],
    keywords: r.keywords ? JSON.parse(r.keywords) : [],
    phrases: r.phrases ? JSON.parse(r.phrases) : [],
    negative_keywords: r.negative_keywords ? JSON.parse(r.negative_keywords) : [],
  })));
});

router.get('/:id', [param('id').isInt(), handleValidation], (req, res) => {
  const row = get('SELECT * FROM search_profiles WHERE id = ? AND user_id = 1', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Search profile not found' });
  res.json({
    ...row,
    networks: row.networks ? JSON.parse(row.networks) : [],
    project_names: row.project_names ? JSON.parse(row.project_names) : [],
    token_symbols: row.token_symbols ? JSON.parse(row.token_symbols) : [],
    keywords: row.keywords ? JSON.parse(row.keywords) : [],
    phrases: row.phrases ? JSON.parse(row.phrases) : [],
    negative_keywords: row.negative_keywords ? JSON.parse(row.negative_keywords) : [],
  });
});

router.post('/', [
  body('name').notEmpty().trim().escape(),
  body('enabled').optional().isBoolean(),
  body('networks').optional().isArray(),
  body('project_names').optional().isArray(),
  body('token_symbols').optional().isArray(),
  body('keywords').optional().isArray(),
  body('phrases').optional().isArray(),
  body('negative_keywords').optional().isArray(),
  body('interval_minutes').optional().isInt({ min: 5 }),
  handleValidation,
], (req, res) => {
  const {
    name, enabled = 1, networks = [], project_names = [], token_symbols = [],
    keywords = [], phrases = [], negative_keywords = [], interval_minutes = 60,
  } = req.body;

  const result = run(
    `INSERT INTO search_profiles (user_id, name, enabled, networks, project_names, token_symbols, keywords, phrases, negative_keywords, interval_minutes)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name, enabled ? 1 : 0,
      JSON.stringify(networks), JSON.stringify(project_names), JSON.stringify(token_symbols),
      JSON.stringify(keywords), JSON.stringify(phrases), JSON.stringify(negative_keywords),
      interval_minutes,
    ]
  );

  logger.info('Search profile created', { userId: 1, profileId: result.lastInsertRowid });
  res.status(201).json({ id: result.lastInsertRowid, name, enabled, interval_minutes });
});

router.put('/:id', [
  param('id').isInt(),
  body('name').optional().notEmpty().trim().escape(),
  body('enabled').optional().isBoolean(),
  body('interval_minutes').optional().isInt({ min: 5 }),
  handleValidation,
], (req, res) => {
  const existing = get('SELECT * FROM search_profiles WHERE id = ? AND user_id = 1', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Search profile not found' });

  const updates = [];
  const params = [];
  const fields = ['name', 'enabled', 'networks', 'project_names', 'token_symbols', 'keywords', 'phrases', 'negative_keywords', 'interval_minutes'];
  const jsonFields = ['networks', 'project_names', 'token_symbols', 'keywords', 'phrases', 'negative_keywords'];
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

  run(`UPDATE search_profiles SET ${updates.join(', ')} WHERE id = ?`, params);
  logger.info('Search profile updated', { userId: 1, profileId: req.params.id });
  res.json({ ok: true });
});

router.delete('/:id', [param('id').isInt(), handleValidation], (req, res) => {
  const result = run('DELETE FROM search_profiles WHERE id = ? AND user_id = 1', [req.params.id]);
  if (result.changes === 0) return res.status(404).json({ error: 'Search profile not found' });
  res.json({ ok: true });
});

router.post('/:id/preview', [param('id').isInt(), handleValidation], (req, res) => {
  const row = get('SELECT * FROM search_profiles WHERE id = ? AND user_id = 1', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Search profile not found' });

  const keywords = row.keywords ? JSON.parse(row.keywords) : [];
  const phrases = row.phrases ? JSON.parse(row.phrases) : [];
  const negative = row.negative_keywords ? JSON.parse(row.negative_keywords) : [];

  const queryParts = [...keywords, ...phrases].filter(Boolean);
  const query = queryParts.join(' OR ');
  const exclusions = negative.map((k) => `-${k}`).join(' ');
  const fullQuery = exclusions ? `${query} ${exclusions}` : query;

  res.json({
    profileId: row.id,
    query: fullQuery || '(no terms configured)',
    networks: JSON.parse(row.networks || '[]'),
    note: 'This is a local query preview. Live X search requires X API configuration (see /api/x/status).',
  });
});

module.exports = router;
