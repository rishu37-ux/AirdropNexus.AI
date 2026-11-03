'use strict';

/**
 * AirdropNexus AI — Structured logger.
 * Redacts authorization headers, tokens, keys, and secrets.
 */

const SENSITIVE_FIELDS = [
  'authorization',
  'x-api-key',
  'apikey',
  'api_key',
  'apikey',
  'token',
  'access_token',
  'refresh_token',
  'secret',
  'password',
  'pass',
  'credential',
];

function isSensitiveKey(key) {
  const k = String(key).toLowerCase();
  return SENSITIVE_FIELDS.some((s) => k.includes(s)) || k.endsWith('_key') || k.endsWith('_secret') || k.endsWith('_token');
}

function redactValue(key, value) {
  if (isSensitiveKey(key)) {
    return '[REDACTED]';
  }
  if (typeof value === 'string' && value.length > 200) {
    return value.slice(0, 200) + '...[truncated]';
  }
  return value;
}

function redactObject(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(redactObject);
  if (typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = redactValue(k, v);
    }
    return out;
  }
  return obj;
}

function log(level, message, meta) {
  const timestamp = new Date().toISOString();
  const safeMeta = meta ? redactObject(meta) : undefined;
  const metaStr = safeMeta ? ` ${JSON.stringify(safeMeta)}` : '';
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`);
}

const logger = {
  info: (message, meta) => log('info', message, meta),
  warn: (message, meta) => log('warn', message, meta),
  error: (message, meta) => log('error', message, meta),
  debug: (message, meta) => {
    if (process.env.NODE_ENV === 'development') {
      log('debug', message, meta);
    }
  },
};

module.exports = logger;
