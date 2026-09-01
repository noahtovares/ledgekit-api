import { describe, expect, test } from "vitest";

import { validateEnvelope } from "../src/envelope.js";
import { fixtureEnvelope } from "./helpers.js";

const traceID = "8C41C7D7-0959-4CA2-A73F-A623C50F11C9";

describe("v1 envelope validation", () => {
  test("accepts the sanitized SDK fixture", () => {
    expect(validateEnvelope(fixtureEnvelope(), traceID, "1")).toMatchObject({
      traceID,
      traceName: "sample.generate_summary",
      traceVersion: 1,
      serviceName: "sample-app",
    });
  });

  test("requires the idempotency key to match the trace", () => {
    expect(
      validateEnvelope(
        fixtureEnvelope(),
        "00000000-0000-4000-8000-000000000000",
        "1",
      ),
    ).toBeNull();
  });

  test("requires trace and definition names to match", () => {
    const envelope = fixtureEnvelope();
    (envelope.trace as Record<string, unknown>).name = "different.name";
    expect(validateEnvelope(envelope, traceID, "1")).toBeNull();
  });

  test("rejects active traces", () => {
    const envelope = fixtureEnvelope();
    (envelope.trace as Record<string, unknown>).status = "running";
    expect(validateEnvelope(envelope, traceID, "1")).toBeNull();
  });
});
