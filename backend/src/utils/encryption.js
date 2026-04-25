const crypto = require('crypto');
const env = require('../config/env');
const logger = require('./logger');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Derives the 32-byte encryption key from the hex string in env config.
 * AES-256 requires exactly 32 bytes.
 */
function getKey() {
  const keyHex = env.encryption.key;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error(
      'ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypts plaintext using AES-256-GCM.
 * Returns a single base64 string containing IV + auth tag + ciphertext.
 *
 * Layout: [IV (16 bytes)] [Auth Tag (16 bytes)] [Ciphertext (variable)]
 *
 * @param {string} text - The plaintext to encrypt
 * @returns {string} Base64-encoded encrypted payload
 */
function encrypt(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('encrypt() requires a non-empty string');
  }

  try {
    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([
      cipher.update(text, 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    // Pack IV + authTag + ciphertext into a single buffer
    const packed = Buffer.concat([iv, authTag, encrypted]);

    return packed.toString('base64');
  } catch (err) {
    logger.error('Encryption failed', { error: err.message });
    throw new Error('Encryption failed');
  }
}

/**
 * Decrypts a base64 string previously produced by encrypt().
 * Extracts the IV, auth tag, and ciphertext, then decrypts with AES-256-GCM.
 *
 * @param {string} encryptedText - Base64-encoded encrypted payload
 * @returns {string} The original plaintext
 */
function decrypt(encryptedText) {
  if (!encryptedText || typeof encryptedText !== 'string') {
    throw new Error('decrypt() requires a non-empty string');
  }

  try {
    const key = getKey();
    const packed = Buffer.from(encryptedText, 'base64');

    if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
      throw new Error('Encrypted payload is too short to be valid');
    }

    const iv = packed.subarray(0, IV_LENGTH);
    const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch (err) {
    logger.error('Decryption failed', { error: err.message });
    throw new Error('Decryption failed');
  }
}

module.exports = { encrypt, decrypt };
