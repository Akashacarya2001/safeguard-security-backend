/**
 * Small helper for encrypting DVR passwords at rest in our DB.
 * Requires ENCRYPTION_KEY in env — 32 bytes, base64-encoded
 * (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
 *
 * This is deliberately simple (AES-256-GCM, no KMS). For a real production
 * deployment, prefer a proper secrets manager (Vault, AWS Secrets Manager,
 * etc.) over an application-level key — this is a reasonable baseline, not
 * the ceiling.
 */
const crypto = require('crypto');

function getKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('ENCRYPTION_KEY is not set');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY must decode to exactly 32 bytes');
  return key;
}

function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Store iv + authTag + ciphertext together, base64, so it's one column.
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decrypt(stored) {
  const buf = Buffer.from(stored, 'base64');
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
