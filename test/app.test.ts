import { describe, expect, test, vi } from "vitest";

import { createApp } from "../src/index.js";
import type { IngestTelemetry } from "../src/telemetry.js";
import { traceRequest } from "./helpers.js";

function testApp(
  submit = vi.fn(async () => ({
    outcome: "inserted" as const,
    traceId: "7B14B1B1-AF6B-4D62-BF0F-122A326B29F1",
    appId: "932F1786-B94C-414B-BCEE-F474949F86F9",
    environment: "development" as const,
  })),
) {
  const events: IngestTelemetry[] = [];
  return {
    app: createApp({
      submit,
      telemetry: (event) => events.push(event),
    }),
    events,
    submit,
  };
}

describe("Hono application", () => {
  test("reports process health without touching Supabase", async () => {
    const { app, submit } = testApp();
    const response = await app.request("/health", {
      headers: { "X-Request-ID": "health-test" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.get("x-request-id")).toBe("health-test");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(submit).not.toHaveBeenCalled();
  });

  test("routes a valid trace through the existing ingestion workflow", async () => {
    const { app, events, submit } = testApp();
    const original = traceRequest();
    const response = await app.request(original.url, {
      method: original.method,
      headers: original.headers,
      body: await original.arrayBuffer(),
    });

    expect(response.status).toBe(201);
    expect(submit).toHaveBeenCalledOnce();
    expect(events).toHaveLength(1);
    expect(events[0]?.status).toBe(201);
  });

  test("returns 405 for another method on the ingestion route", async () => {
    const { app } = testApp();
    const response = await app.request("/v1/traces", { method: "GET" });

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(await response.json()).toMatchObject({ error: "method_not_allowed" });
  });

  test("returns a consistent 404 response", async () => {
    const { app } = testApp();
    const response = await app.request("/missing");

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "not_found" });
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });
});
