import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getServerEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";

/**
 * Encryption at rest for restricted fields (employee bank account numbers, IBANs): AES-256-GCM with a random
 * 96-bit IV per value and the record's identity as additional authenticated data, so a ciphertext copied to
 * another row or field fails to decrypt. Stored as "v1:" + base64url(iv | tag | ciphertext); the version prefix
 * leaves room for key rotation. The key is DATA_ENCRYPTION_KEY (32 bytes, base64). See docs/hr.md.
 */

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function encryptWithKey(plain: string, context: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")}`;
}

export function decryptWithKey(stored: string, context: string, key: Buffer): string {
  const [version, payload] = stored.split(":");
  if (version !== VERSION || !payload) throw new Error("Unknown encrypted value format");
  const bytes = Buffer.from(payload, "base64url");
  if (bytes.byteLength < IV_BYTES + TAG_BYTES) throw new Error("Encrypted value is truncated");
  const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, IV_BYTES));
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(bytes.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return Buffer.concat([decipher.update(bytes.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString(
    "utf8",
  );
}

function configuredKey(): Buffer {
  const key = getServerEnv().DATA_ENCRYPTION_KEY;
  if (!key) {
    throw new AppError(
      "INTERNAL",
      "Bank details can't be stored or read: data encryption isn't configured (DATA_ENCRYPTION_KEY).",
    );
  }
  return Buffer.from(key, "base64");
}

/** Encrypts `plain` bound to `context` (e.g. "<companyId>:<employeeId>:accountNumber"). */
export function encryptField(plain: string, context: string): string {
  return encryptWithKey(plain, context, configuredKey());
}

/** Decrypts a value written by `encryptField` with the same context. Throws if it was tampered with. */
export function decryptField(stored: string, context: string): string {
  return decryptWithKey(stored, context, configuredKey());
}
