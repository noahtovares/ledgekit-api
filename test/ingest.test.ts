import { describe, expect, test, vi } from "vitest";

import { MAX_BODY_BYTES } from "../src/constants.js";
import { handleTraceRequest } from "../src/ingest.js";
import { SupabaseRpcError } from "../src/supabase.js";
import type { IngestTelemetry } from "../src/telemetry.js";
import { fixtureEnvelope, testConfig, traceRequest } from "./helpers.js";

function dependencies(
  submit = vi.fn().mockResolvedValue({
    outcome: "inserted",
    traceId: "8C41C7D7-0959-4CA2-A73F-A623C50F11C9",
    appId: "00000000-0000-4000-8000-000000000001",
  }),
) {
  const events: IngestTelemetry[] = [];
  return {
    submit,
    events,
    value: {
      config: testConfig,
      submit,
      telemetry: (event: IngestTelemetry) => events.push(event),
      now: () => 100,
      requestID: () => "request-test",
    },
  };
}

describe("POST /v1/traces", () => {
  test("returns 201 only after Supabase inserts the trace", async () => {
    const context = dependencies();
    const response = await handleTraceRequest(traceRequest(), context.value);

    expect(response.status).toBe(201);
    expect(await response.text()).toBe("");
    expect(context.submit).toHaveBeenCalledOnce();
    expect(context.submit.mock.calls[0]?.[0]).toMatchObject({
      keyPrefix: "lk_abcdefghijkl",
      payload: fixtureEnvelope(),
    });
    expect(context.submit.mock.calls[0]?.[0].secretDigestHex).toMatch(
      /^[0-9a-f]{64}$/,
    );
    expect(context.events).toEqual([
      expect.objectContaining({
        requestId: "request-test",
        status: 201,
        traceName: "sample.generate_summary",
      }),
    ]);
  });

  test("returns 200 for an idempotent duplicate", async () => {
    const context = dependencies(
      vi.fn().mockResolvedValue({
        outcome: "duplicate",
        traceId: "8C41C7D7-0959-4CA2-A73F-A623C50F11C9",
        appId: "00000000-0000-4000-8000-000000000001",
      }),
    );
    expect(
      (await handleTraceRequest(traceRequest(), context.value)).status,
    ).toBe(200);
  });

  test("accepts a request whose body is exactly 4 MiB", async () => {
    const compact = JSON.stringify(fixtureEnvelope());
    const padding = " ".repeat(MAX_BODY_BYTES - Buffer.byteLength(compact));
    const body = compact + padding;
    expect(Buffer.byteLength(body)).toBe(MAX_BODY_BYTES);
    const context = dependencies();

    const response = await handleTraceRequest(traceRequest(body), context.value);

    expect(response.status).toBe(201);
    expect(context.submit).toHaveBeenCalledOnce();
  });

  test("rejects an oversized declared body without reading or calling Supabase", async () => {
    const context = dependencies();
    const response = await handleTraceRequest(
      traceRequest("{}", { "Content-Length": String(MAX_BODY_BYTES + 1) }),
      context.value,
    );

    expect(response.status).toBe(413);
    expect(context.submit).not.toHaveBeenCalled();
  });

  test("rejects an oversized actual body without calling Supabase", async () => {
    const context = dependencies();
    const response = await handleTraceRequest(
      traceRequest(new Uint8Array(MAX_BODY_BYTES + 1)),
      context.value,
    );

    expect(response.status).toBe(413);
    expect(context.submit).not.toHaveBeenCalled();
  });

  test.each([
    ["invalid_key", 401],
    ["invalid_payload", 400],
    ["conflict", 409],
    ["temporary", 503],
  ] as const)("maps Supabase %s failures to %i", async (kind, status) => {
    const context = dependencies(
      vi.fn().mockRejectedValue(new SupabaseRpcError(kind)),
    );
    const response = await handleTraceRequest(traceRequest(), context.value);
    expect(response.status).toBe(status);
  });

  test("telemetry never contains trace content or the token secret", async () => {
    const context = dependencies();
    await handleTraceRequest(traceRequest(), context.value);
    const serialized = JSON.stringify(context.events);

    expect(serialized).not.toContain("sanitized fixture prompt");
    expect(serialized).not.toContain("sanitized fixture response");
    expect(serialized).not.toContain("A".repeat(43));
  });
});
