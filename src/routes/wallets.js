'use strict';

/**
 * AirdropNexus AI — Wallet Manager routes.
 * Public wallet addresses only. No private keys, seed phrases, or secrets.
 */

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
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

function validateAddress(network, address) {
  const warnings = [];
  let valid = true;
  const trimmed = (address || '').trim();
  if (!trimmed) {
    valid = false;
    warnings.push('Address is required.');
    return { valid, warnings };
  }
  switch ((network || '').toLowerCase()) {
    case 'ethereum':
    case 'base':
    case 'arbitrum':
    case 'optimism':
    case 'bnb chain':
      if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
        valid = false;
        warnings.push(`EVM address format expected (0x + 40 hex chars). Got: ${trimmed}`);
      }
      break;
    case 'solana':
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) {
        valid = false;
        warnings.push('Solana address format looks invalid (base58, 32-44 chars).');
      }
      break;
    case 'bitcoin':
      if (!/^(bc1|[13])[a-km-zA-HJ-NP-Z1-9]{25,39}$/.test(trimmed)) {
        valid = false;
        warnings.push('Bitcoin address format looks invalid.');
      }
      break;
    case 'ton':
      if (!/^[A-Za-z0-9_-]{48}$/.test(trimmed)) {
        warnings.push('TON address format looks invalid (raw/base64url, 48 chars).');
      }
      break;
    case 'monad':
      if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
        warnings.push('Monad is EVM-compatible; expected 0x + 40 hex chars.');
      }
      break;
    case 'polygon':
      if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
        warnings.push('Polygon is EVM-compatible; expected 0x + 40 hex chars.');
      }
      break;
    default:
      if (trimmed.length < 5) {
        valid = false;
        warnings.push('Address seems too short for a custom network.');
      }
  }
  return { valid, warnings };
}

router.get('/', (req, res) => {
  const { network, enabled, search, page = 1, limit = 50 } = req.query;
  const pageNum = Math.max(parseInt(page, 10), 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10), 1), 500);
  const offset = (pageNum - 1) * limitNum;

  let where = 'WHERE user_id = 1';
  const params = [];

  if (network) {
    where += ' AND network = ?';
    params.push(network);
  }
  if (enabled !== undefined) {
    where += ' AND enabled = ?';
    params.push(enabled === 'true' ? 1 : 0);
  }
  if (search) {
    where += ' AND (label LIKE ? OR public_address LIKE ? OR notes LIKE ?)';
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const rows = all(
    `SELECT id, label, network, ticker, public_address, address_format, notes, enabled, created_at, updated_at FROM wallets ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limitNum, offset]
  );

  const totalResult = get(
    `SELECT COUNT(*) AS c FROM wallets ${where}`,
    params
  );

  res.json({
    wallets: rows.map((r) => ({
      ...r,
      shortAddress: r.public_address ? `${r.public_address.slice(0, 6)}…${r.public_address.slice(-4)}` : '',
    })),
    total: totalResult ? totalResult.c : 0,
    page: pageNum,
    limit: limitNum,
  });
});

router.get('/:id', [param('id').isInt(), handleValidation], (req, res) => {
  const row = get('SELECT * FROM wallets WHERE id = ? AND user_id = 1', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Wallet not found' });
  res.json(row);
});

router.post('/', [
  body('label').notEmpty().trim().escape(),
  body('network').notEmpty().trim().escape(),
  body('ticker').optional().trim().escape(),
  body('public_address').notEmpty().trim(),
  body('address_format').optional().trim().escape(),
  body('notes').optional().trim().escape(),
  body('enabled').optional().isBoolean(),
  handleValidation,
], (req, res) => {
  const { label, network, ticker, public_address, address_format, notes, enabled } = req.body;
  const validation = validateAddress(network, public_address);

  const result = run(
    `INSERT INTO wallets (user_id, label, network, ticker, public_address, address_format, notes, enabled)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
    [label, network, ticker || null, public_address, address_format || null, notes || null, enabled !== false ? 1 : 0]
  );

  logger.info('Wallet created', { userId: 1, walletId: result.lastInsertRowid, network });
  res.status(201).json({
    id: result.lastInsertRowid,
    label,
    network,
    ticker,
    public_address,
    address_format,
    notes,
    enabled: enabled !== false ? 1 : 0,
    validation,
  });
});

router.put('/:id', [
  param('id').isInt(),
  body('label').optional().notEmpty().trim().escape(),
  body('network').optional().notEmpty().trim().escape(),
  body('ticker').optional().trim().escape(),
  body('public_address').optional().notEmpty().trim(),
  body('address_format').optional().trim().escape(),
  body('notes').optional().trim().escape(),
  body('enabled').optional().isBoolean(),
  handleValidation,
], (req, res) => {
  const existing = get('SELECT * FROM wallets WHERE id = ? AND user_id = 1', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Wallet not found' });

  const updates = [];
  const params = [];
  const fields = ['label', 'network', 'ticker', 'public_address', 'address_format', 'notes', 'enabled'];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = ?`);
      params.push(req.body[f]);
    }
  }
  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }
  updates.push('updated_at = datetime(\'now\')');
  params.push(req.params.id);

  let networkForValidation = existing.network;
  let addressForValidation = existing.public_address;
  if (req.body.network) networkForValidation = req.body.network;
  if (req.body.public_address) addressForValidation = req.body.public_address;

  const validation = validateAddress(networkForValidation, addressForValidation);

  run(`UPDATE wallets SET ${updates.join(', ')} WHERE id = ?`, params);

  logger.info('Wallet updated', { userId: 1, walletId: req.params.id });
  res.json({ ok: true, validation });
});

router.delete('/:id', [param('id').isInt(), handleValidation], (req, res) => {
  const result = run('DELETE FROM wallets WHERE id = ? AND user_id = 1', [req.params.id]);
  if (result.changes === 0) return res.status(404).json({ error: 'Wallet not found' });
  logger.info('Wallet deleted', { userId: 1, walletId: req.params.id });
  res.json({ ok: true });
});

router.post('/import', (req, res) => {
  const { wallets } = req.body || {};
  if (!Array.isArray(wallets)) {
    return res.status(400).json({ error: 'Expected a wallets array' });
  }
  let imported = 0;
  const errors = [];
  for (const w of wallets) {
    try {
      const validation = validateAddress(w.network, w.public_address);
      run(
        `INSERT INTO wallets (user_id, label, network, ticker, public_address, address_format, notes, enabled)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
        [w.label, w.network, w.ticker || null, w.public_address, w.address_format || null, w.notes || null, w.enabled !== false ? 1 : 0]
      );
      imported++;
    } catch (e) {
      errors.push({ label: w.label, error: e.message });
    }
  }
  logger.info('Wallet import', { userId: 1, imported, errors: errors.length });
  res.json({ imported, errors });
});

router.get('/export/csv', (req, res) => {
  const rows = all('SELECT label, network, ticker, public_address, address_format, notes, enabled, created_at FROM wallets WHERE user_id = 1');
  const header = 'label,network,ticker,public_address,address_format,notes,enabled,created_at\n';
  const csv = [header, ...rows.map((r) => {
    const esc = (v) => String(v ?? '').replace(/"/g, '""');
    return `"${esc(r.label)}","${esc(r.network)}","${esc(r.ticker)}","${esc(r.public_address)}","${esc(r.address_format)}","${esc(r.notes)}","${esc(r.enabled)}","${esc(r.created_at)}"`;
  })].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=wallets.csv');
  res.send(csv);
});

module.exports = router;
