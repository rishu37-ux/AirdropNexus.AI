'use strict';

/**
 * AirdropNexus AI — Campaign / Opportunity Explorer routes.
 */

const express = require('express');
const { query, validationResult } = require('express-validator');
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

router.get('/', [
  query('status').optional().isIn(['New', 'Relevant', 'Ignored', 'Watchlist', 'Completed', 'Scam/Suspicious']),
  query('chain').optional().trim(),
  query('confidence').optional().isFloat({ min: 0, max: 1 }),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 200 }),
  handleValidation,
], (req, res) => {
  const { status, chain, confidence, page = 1, limit = 50, search } = req.query;
  const pageNum = Math.max(parseInt(page, 10), 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10), 1), 200);
  const offset = (pageNum - 1) * limitNum;

  let where = 'WHERE c.user_id = 1';
  const params = [];

  if (status) {
    where += ' AND c.status = ?';
    params.push(status);
  }
  if (chain) {
    where += ' AND c.chains LIKE ?';
    params.push(`%${chain}%`);
  }
  if (confidence !== undefined) {
    where += ' AND c.confidence >= ?';
    params.push(parseFloat(confidence));
  }
  if (search) {
    where += ' AND (c.text_snippet LIKE ? OR c.author_handle LIKE ? OR c.candidate_wallet LIKE ?)';
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const rows = all(
    `SELECT c.*, sp.name AS profile_name FROM campaigns c LEFT JOIN search_profiles sp ON c.matching_profile_id = sp.id ${where} ORDER BY c.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limitNum, offset]
  );

  res.json({
    campaigns: rows.map((r) => ({
      ...r,
      chains: r.chains ? JSON.parse(r.chains) : [],
      tickers: r.tickers ? JSON.parse(r.tickers) : [],
      risk_indicators: r.risk_indicators ? JSON.parse(r.risk_indicators) : [],
      tags: r.tags ? JSON.parse(r.tags) : [],
      shortWallet: r.candidate_wallet ? `${r.candidate_wallet.slice(0, 6)}…${r.candidate_wallet.slice(-4)}` : '',
    })),
    page: pageNum,
    limit: limitNum,
  });
});

router.get('/:id', (req, res) => {
  const row = get('SELECT * FROM campaigns WHERE id = ? AND user_id = 1', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Campaign not found' });
  res.json({
    ...row,
    chains: row.chains ? JSON.parse(row.chains) : [],
    tickers: row.tickers ? JSON.parse(row.tickers) : [],
    risk_indicators: row.risk_indicators ? JSON.parse(row.risk_indicators) : [],
    tags: row.tags ? JSON.parse(row.tags) : [],
  });
});

router.put('/:id', (req, res) => {
  const existing = get('SELECT * FROM campaigns WHERE id = ? AND user_id = 1', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Campaign not found' });

  const updates = [];
  const params = [];
  const fields = ['status', 'tags', 'ai_summary', 'confidence_explanation', 'candidate_wallet'];
  const jsonFields = ['tags'];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      let val = req.body[f];
      if (jsonFields.includes(f)) val = JSON.stringify(val);
      updates.push(`${f} = ?`);
      params.push(val);
    }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  updates.push('updated_at = datetime(\'now\')');
  params.push(req.params.id);

  run(`UPDATE campaigns SET ${updates.join(', ')} WHERE id = ?`, params);
  logger.info('Campaign updated', { userId: 1, campaignId: req.params.id });
  res.json({ ok: true });
});

router.get('/export/csv', (req, res) => {
  const rows = all(
    `SELECT id, source, author_handle, text_snippet, post_url, chains, tickers, candidate_wallet, confidence, status, created_at FROM campaigns WHERE user_id = 1 ORDER BY created_at DESC`
  );
  const header = 'id,source,author_handle,text_snippet,post_url,chains,tickers,candidate_wallet,confidence,status,created_at\n';
  const csv = [header, ...rows.map((r) => {
    const esc = (v) => String(v ?? '').replace(/"/g, '""');
    return `"${esc(r.id)}","${esc(r.source)}","${esc(r.author_handle)}","${esc(r.text_snippet)}","${esc(r.post_url)}","${esc(r.chains)}","${esc(r.tickers)}","${esc(r.candidate_wallet)}","${esc(r.confidence)}","${esc(r.status)}","${esc(r.created_at)}"`;
  })].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=campaigns.csv');
  res.send(csv);
});

module.exports = router;
