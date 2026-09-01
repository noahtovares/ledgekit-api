import fixture from "./fixtures/ledge-trace-v1.json" with { type: "json" };

import type { RuntimeConfig } from "../src/config.js";

export const ingestToken = `lk_test_abcdefghijkl.${"A".repeat(43)}`;

export const testConfig: RuntimeConfig = {
  supabaseURL: "https://example.supabase.co",
  supabaseSecretKey: "sb_secret_test",
};

export function fixtureEnvelope(): Record<string, unknown> {
  return structuredClone(fixture) as Record<string, unknown>;
}

export function traceRequest(
  body: BodyInit = JSON.stringify(fixtureEnvelope()),
  headers: HeadersInit = {},
): Request {
  const trace = fixture.trace;
  return new Request("https://api.ledgekit.com/v1/traces", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ingestToken}`,
      "Content-Type": "application/json",
      "Idempotency-Key": trace.id,
      "X-Ledge-Schema-Version": "1",
      ...Object.fromEntries(new Headers(headers)),
    },
    body,
  });
}
