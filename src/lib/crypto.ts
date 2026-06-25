import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

// AES-256-GCM encryption for secrets at rest (Gmail app password, Google Drive
// service-account JSON). The key is derived from APP_ENCRYPTION_KEY, which must
// live only in the systemd EnvironmentFile — never committed.
//
// Stored format (single string): base64(salt).base64(iv).base64(authTag).base64(ciphertext)

const ALGORITHM = "aes-256-gcm";
const KEY_LEN = 32;
const IV_LEN = 12;
const SALT_LEN = 16;

// Fixed key used ONLY in local dev when APP_ENCRYPTION_KEY isn't set, so a fresh
// clone runs without configuring secrets. Never used in production.
const DEV_FALLBACK_KEY = "dev-only-insecure-key-do-not-use-in-prod-0000000";

function getMasterKey(): string {
  const key = process.env.APP_ENCRYPTION_KEY;
  if (!key || key.length < 32) {
    if (process.env.NODE_ENV !== "production") return DEV_FALLBACK_KEY;
    throw new Error(
      "APP_ENCRYPTION_KEY must be set and at least 32 characters long",
    );
  }
  return key;
}

function deriveKey(salt: Buffer): Buffer {
  return scryptSync(getMasterKey(), salt, KEY_LEN);
}

export function encryptSecret(plaintext: string): string {
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = deriveKey(salt);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [salt, iv, authTag, ciphertext]
    .map((b) => b.toString("base64"))
    .join(".");
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(".");
  if (parts.length !== 4) {
    throw new Error("Malformed encrypted secret");
  }
  const [salt, iv, authTag, ciphertext] = parts.map((p) =>
    Buffer.from(p, "base64"),
  );
  const key = deriveKey(salt);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

// Convenience helpers for JSON secrets (e.g. the SMTP config object and the
// service-account JSON).
export function encryptJson(value: unknown): string {
  return encryptSecret(JSON.stringify(value));
}

export function decryptJson<T = unknown>(payload: string): T {
  return JSON.parse(decryptSecret(payload)) as T;
}
