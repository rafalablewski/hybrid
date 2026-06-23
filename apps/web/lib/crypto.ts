import { createCipheriv, createDecipheriv, randomBytes, createHash, timingSafeEqual } from "node:crypto";

/**
 * Verify an `Authorization: Bearer <secret>` header against a configured secret
 * in constant time. Fails closed: returns false when the secret is unset (so a
 * literal "Bearer undefined" can never authenticate a misconfigured deployment).
 */
export function verifyBearerSecret(authHeader: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  const prefix = "Bearer ";
  if (!authHeader || !authHeader.startsWith(prefix)) return false;
  // Compare SHA-256 digests (always 32 bytes) rather than the raw strings: this
  // keeps the comparison constant-time AND avoids leaking the secret's length via
  // the early length check timingSafeEqual would otherwise require.
  const provided = createHash("sha256").update(authHeader.slice(prefix.length)).digest();
  const expected = createHash("sha256").update(secret).digest();
  return timingSafeEqual(provided, expected);
}

// App-layer encryption for secrets at rest (wearable OAuth tokens). AES-256-GCM
// with a random per-record IV and an authentication tag, so a DB leak alone
// doesn't expose tokens. The key comes from TOKEN_ENCRYPTION_KEY (a long random
// string / base64 32-byte key). When no key is set we pass values through
// unchanged so the app keeps working pre-key — and the /security tab shows the
// control as "action required" until the key is configured.

const PREFIX = "v1:"; // ciphertext format marker

function key(): Buffer | null {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) return null;
  // Accept a base64 32-byte key directly, else derive 32 bytes via SHA-256 so
  // any sufficiently-long passphrase works.
  const b64 = Buffer.from(raw, "base64");
  if (b64.length === 32) return b64;
  return createHash("sha256").update(raw).digest();
}

export function isEncryptionConfigured(): boolean {
  return key() !== null;
}

/** Encrypt a secret for storage. Returns "v1:<iv>:<tag>:<ct>" (base64 parts). */
export function encryptSecret(plain: string): string {
  const k = key();
  if (!k) return plain; // no key configured → store as-is (backward-compatible)
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

/** Decrypt a value produced by encryptSecret. Plaintext (non-prefixed) values
 *  pass through unchanged, so records written before a key existed still work. */
export function decryptSecret(enc: string): string {
  if (!enc.startsWith(PREFIX)) return enc;
  const k = key();
  if (!k) throw new Error("TOKEN_ENCRYPTION_KEY required to decrypt a sealed value");
  const [, ivB64, tagB64, ctB64] = enc.split(":");
  if (!ivB64 || !tagB64 || !ctB64) throw new Error("malformed ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", k, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}

/** Encrypt a nullable token field for a Prisma write. */
export const protectToken = (v: string | null | undefined): string | null => (v ? encryptSecret(v) : null);

/** Decrypt a nullable token field read from the DB. */
export const revealToken = (v: string | null | undefined): string | null => (v ? decryptSecret(v) : null);
