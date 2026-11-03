'use strict';

/**
 * AirdropNexus AI — Encryption at rest for provider secrets.
 * Uses AES-256-GCM with the ENCRYPTION_MASTER_KEY from env.
 * The master key must be 32 bytes (64 hex chars).
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 16;

function validateMasterKey(masterKeyHex) {
  if (!masterKeyHex || masterKeyHex.length !== 64) {
    throw new Error(
      'ENCRYPTION_MASTER_KEY must be a 64-character hex string (32 bytes). ' +
      'Generate one: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  // Validate hex
  if (!/^[0-9a-fA-F]{64}$/.test(masterKeyHex)) {
    throw new Error('ENCRYPTION_MASTER_KEY contains invalid hex characters.');
  }
}

function deriveKey(masterKeyHex) {
  validateMasterKey(masterKeyHex);
  return Buffer.from(masterKeyHex, 'hex');
}

/**
 * Encrypt a plaintext string. Returns base64(iv:salt? :ciphertext:tag)
 * We prepend IV so decryption can recover it. GCM tag is appended by createDecipheriv via getAuthTag.
 */
function encrypt(plaintext, masterKeyHex) {
  const key = deriveKey(masterKeyHex);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  cipher.setAutoPadding(true);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, tag]).toString('base64');
}

/**
 * Decrypt a value produced by encrypt(). Returns plaintext string or null if input is empty.
 */
function decrypt(ciphertextBase64, masterKeyHex) {
  if (!ciphertextBase64) return null;
  const key = deriveKey(masterKeyHex);
  const data = Buffer.from(ciphertextBase64, 'base64');
  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(data.length - 16);
  const encrypted = data.subarray(IV_LENGTH, data.length - 16);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

/**
 * Mask a secret for safe display (show last 4 chars only).
 */
function maskSecret(secret) {
  if (!secret) return '';
  const visible = secret.slice(-4);
  return '*'.repeat(Math.max(0, secret.length - 4)) + visible;
}

module.exports = { encrypt, decrypt, maskSecret, validateMasterKey };
