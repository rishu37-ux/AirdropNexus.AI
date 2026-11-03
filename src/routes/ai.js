'use strict';

/**
 * AirdropNexus AI — AI Model Manager routes.
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const { encrypt, decrypt, maskSecret } = require('../config/encryption');
const config = require('../config/env');
const logger = require('../config/logger');
const { getDb, all, get, run } = require('../database/db');

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }
  next();
};

const PROVIDER_CATALOG = [
  { id: 'google-ai', name: 'Google AI Studio (Gemini)', keyEnv: 'GOOGLE_AI_API_KEY', freeTier: 'Check Google AI Studio pricing; free tier may apply', notes: 'Structured text output supported' },
  { id: 'openai', name: 'OpenAI', keyEnv: 'OPENAI_API_KEY', freeTier: 'Check OpenAI pricing; free trial credits may apply', notes: 'Structured output (JSON mode) supported' },
  { id: 'anthropic', name: 'Anthropic Claude', keyEnv: 'ANTHROPIC_API_KEY', freeTier: 'Check Anthropic pricing', notes: 'Large context window' },
  { id: 'xai', name: 'xAI Grok', keyEnv: 'XAI_API_KEY', freeTier: 'Check xAI pricing', notes: 'Text generation' },
  { id: 'groq', name: 'Groq', keyEnv: 'GROQ_API_KEY', freeTier: 'Check Groq pricing; free tier may apply', notes: 'Fast inference' },
  { id: 'openrouter', name: 'OpenRouter', keyEnv: 'OPENROUTER_API_KEY', freeTier: 'Free models may be offered; verify at setup', notes: 'Access to many models via one endpoint' },
  { id: 'mistral', name: 'Mistral', keyEnv: 'MISTRAL_API_KEY', freeTier: 'Check Mistral pricing', notes: 'Text generation' },
  { id: 'ollama', name: 'Ollama (local)', keyEnv: null, freeTier: 'Free; runs on your hardware', notes: 'Local only; requires Ollama running' },
  { id: 'custom-openai-compatible', name: 'Custom OpenAI-Compatible Endpoint', keyEnv: 'CUSTOM_AI_API_KEY', freeTier: 'Depends on your endpoint', notes: 'Base URL configurable' },
];

router.get('/catalog', (req, res) => {
  res.json(PROVIDER_CATALOG.map((p) => ({
    id: p.id,
    name: p.name,
    keyEnv: p.keyEnv,
    freeTier: p.freeTier,
    notes: p.notes,
    configured: p.keyEnv ? Boolean(process.env[p.keyEnv]) : true,
  })));
});

router.get('/configs', (req, res) => {
  const rows = all('SELECT id, provider, model, base_url, is_default, created_at, updated_at FROM provider_configs WHERE user_id = 1 ORDER BY is_default DESC, created_at DESC');
  res.json(rows.map((r) => ({
    ...r,
    apiKeySet: true,
    maskedKey: '****-****-****',
  })));
});

router.post('/configs', [
  body('provider').notEmpty().trim(),
  body('model').optional().trim(),
  body('baseUrl').optional().trim(),
  body('apiKey').notEmpty(),
  body('isDefault').optional().isBoolean(),
  handleValidation,
], (req, res) => {
  const { provider, model, baseUrl, apiKey, isDefault } = req.body;
  const encrypted = encrypt(apiKey, config.encryption.masterKey);

  if (isDefault) {
    run('UPDATE provider_configs SET is_default = 0 WHERE user_id = 1');
  }

  const result = run(
    `INSERT INTO provider_configs (user_id, provider, model, base_url, api_key_encrypted, is_default)
     VALUES (1, ?, ?, ?, ?, ?)`,
    [provider, model || null, baseUrl || null, encrypted, isDefault ? 1 : 0]
  );

  logger.info('AI provider config saved', { userId: 1, provider, configId: result.lastInsertRowid });
  res.status(201).json({
    id: result.lastInsertRowid,
    provider,
    model,
    baseUrl,
    isDefault: isDefault ? 1 : 0,
    apiKeySet: true,
    maskedKey: maskSecret(apiKey),
    note: 'API key stored server-side, encrypted at rest. It is never returned to the frontend.',
  });
});

router.post('/configs/test', [
  body('provider').notEmpty(),
  body('apiKey').notEmpty(),
  body('baseUrl').optional().trim(),
  handleValidation,
], async (req, res) => {
  const { provider, apiKey, baseUrl } = req.body;

  let ok = false;
  let message = '';
  try {
    switch (provider) {
      case 'openai': {
        const fetch = (await import('node-fetch')).default || globalThis.fetch;
        const url = (baseUrl || 'https://api.openai.com') + '/v1/models';
        const resp = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
        ok = resp.ok;
        message = ok ? 'Connection successful' : `HTTP ${resp.status}`;
        break;
      }
      case 'google-ai': {
        ok = Boolean(apiKey && apiKey.length > 10);
        message = ok ? 'API key format looks valid (live call not made to avoid quota usage)' : 'Invalid API key format';
        break;
      }
      case 'ollama': {
        const target = baseUrl || config.ai.ollamaBaseUrl;
        const fetch = (await import('node-fetch')).default || globalThis.fetch;
        const resp = await fetch(`${target}/api/tags`);
        ok = resp.ok;
        message = ok ? 'Ollama reachable' : `Ollama not reachable at ${target}`;
        break;
      }
      default: {
        ok = Boolean(apiKey && apiKey.length > 5);
        message = ok ? 'API key format looks valid' : 'Invalid API key format';
      }
    }
  } catch (e) {
    ok = false;
    message = `Connection test failed: ${e.message}`;
    logger.error('AI test connection error', { provider, message: e.message });
  }

  res.json({ ok, message, provider, testedAt: new Date().toISOString() });
});

router.delete('/configs/:id', (req, res) => {
  const result = run('DELETE FROM provider_configs WHERE id = ? AND user_id = 1', [req.params.id]);
  if (result.changes === 0) return res.status(404).json({ error: 'Provider config not found' });
  logger.info('AI provider config deleted', { userId: 1, configId: req.params.id });
  res.json({ ok: true });
});

router.get('/status', (req, res) => {
  const configured = get("SELECT COUNT(*) AS c FROM provider_configs WHERE api_key_encrypted IS NOT NULL");
  const ollamaConfigured = Boolean(config.ai.ollamaBaseUrl);

  res.json({
    providersConfigured: (configured && configured.c > 0),
    ollama: { baseUrl: config.ai.ollamaBaseUrl, model: config.ai.ollamaModel, configured: ollamaConfigured },
    note: 'If no AI provider is configured, the app still works with deterministic rule-based discovery and labels AI analysis as unavailable.',
  });
});

module.exports = router;
