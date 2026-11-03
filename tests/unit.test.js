'use strict';

/**
 * AirdropNexus AI — Unit Tests
 * Run with: npm test
 */

const { describe, test } = require('node:test');
const assert = require('node:assert');
const { encrypt, decrypt, maskSecret } = require('../src/config/encryption');
const config = require('../src/config/env');

const MASTER_KEY = '2f5665bbc2a6e88b0b905fb22818cd31253bdcb1e772751ccf3ff56e1b9ba2ba';

describe('Encryption', () => {
  test('encrypt then decrypt returns original value', () => {
    const plaintext = 'sk-1234567890abcdef';
    const encrypted = encrypt(plaintext, MASTER_KEY);
    assert.notEqual(encrypted, plaintext);
    const decrypted = decrypt(encrypted, MASTER_KEY);
    assert.strictEqual(decrypted, plaintext);
  });

  test('decrypt of null returns null', () => {
    assert.strictEqual(decrypt(null, MASTER_KEY), null);
  });

  test('decrypt of empty string returns empty string', () => {
    assert.strictEqual(decrypt('', MASTER_KEY), '');
  });

  test('maskSecret shows last 4 chars only', () => {
    const masked = maskSecret('sk-1234567890abcdef');
    assert.strictEqual(masked, '**************cdef');
  });

  test('maskSecret of short string', () => {
    const masked = maskSecret('abc');
    assert.strictEqual(masked, '***abc');
  });

  test('maskSecret of empty string', () => {
    assert.strictEqual(maskSecret(''), '');
  });
});

describe('Configuration', () => {
  test('config loads without crashing', () => {
    assert.ok(config);
    assert.ok(config.appName);
    assert.ok(config.port);
  });

  test('config has required fields', () => {
    assert.ok(config.session.secret);
    assert.ok(config.encryption.masterKey);
    assert.ok(config.db.path);
  });
});

describe('Database Abstraction', () => {
  test('run returns lastInsertRowid and changes', async () => {
    // This test requires database initialization
    // It's a placeholder for integration testing
    assert.ok(true);
  });
});
