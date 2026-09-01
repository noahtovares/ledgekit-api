import { createHash, randomBytes } from "node:crypto";

import type { IngestCredential } from "./types.js";

const TOKEN_PATTERN = /^(lk_[A-Za-z0-9_-]{12,16})\.([A-Za-z0-9_-]{43})$/;

export function parseAuthorization(
  authorization: string | null,
): IngestCredential | null {
  if (!authorization?.startsWith("Bearer ")) return null;
  const match = TOKEN_PATTERN.exec(authorization.slice("Bearer ".length));
  if (!match?.[1] || !match[2]) return null;
  return { keyPrefix: match[1], secret: match[2] };
}

export function digestSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function generateIngestToken(): {
  token: string;
  keyPrefix: string;
  secretDigestHex: string;
} {
  const publicPart = randomBytes(9).toString("base64url");
  const keyPrefix = `lk_${publicPart}`;
  const secret = randomBytes(32).toString("base64url");
  return {
    token: `${keyPrefix}.${secret}`,
    keyPrefix,
    secretDigestHex: digestSecret(secret),
  };
}
