import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export class SecretsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretsConfigError";
  }
}

/** Separate keys per purpose, derived from the one master key. */
function subkey(master: Buffer, purpose: string) {
  return Buffer.from(hkdfSync("sha256", master, Buffer.alloc(0), `jarvis/${purpose}`, 32));
}

/**
 * AES-256-GCM sealing for broker credentials. The sealed string carries a
 * version, IV and auth tag, so tampering or a wrong key fails loudly.
 */
export class SecretBox {
  private readonly key: Buffer;

  constructor(master: Buffer) {
    if (master.length !== 32) throw new SecretsConfigError("JARVIS_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)");
    this.key = subkey(master, "credentials");
  }

  seal(value: unknown): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
  }

  open<T = unknown>(sealed: string): T {
    const [version, iv, tag, data] = sealed.split(":");
    if (version !== "v1" || !iv || !tag || !data) throw new Error("Unrecognised sealed value");
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    const plain = Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]);
    return JSON.parse(plain.toString("utf8")) as T;
  }
}

/**
 * The master key: JARVIS_ENCRYPTION_KEY, required in production. In
 * development a random key is created once in the local data directory.
 */
export function masterKeyFromEnv(env: Record<string, string | undefined> = process.env, opts: { devKeyDir?: string } = {}): Buffer {
  const raw = env.JARVIS_ENCRYPTION_KEY?.trim();
  if (raw) {
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) throw new SecretsConfigError("JARVIS_ENCRYPTION_KEY must decode to 32 bytes (openssl rand -base64 32)");
    return key;
  }
  if (env.NODE_ENV === "production" && !env.JARVIS_ALLOW_DEV_KEY) {
    throw new SecretsConfigError("Set JARVIS_ENCRYPTION_KEY to store broker credentials and sign approvals in production.");
  }
  const dir = opts.devKeyDir ?? path.resolve(process.cwd(), ".jarvis-data");
  const file = path.join(dir, "dev-encryption.key");
  if (!existsSync(file)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, randomBytes(32).toString("base64"), { mode: 0o600 });
  }
  return Buffer.from(readFileSync(file, "utf8").trim(), "base64");
}

export function hmac(master: Buffer, purpose: string, message: string) {
  return createHmac("sha256", subkey(master, purpose)).update(message).digest("base64url");
}

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
