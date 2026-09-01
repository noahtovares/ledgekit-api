import { describe, expect, test, vi } from "vitest";

import {
  ingestThroughSupabase,
  SupabaseRpcError,
} from "../src/supabase.js";
import { fixtureEnvelope, testConfig } from "./helpers.js";

const input = {
  keyPrefix: "lk_test_abcdefghijkl",
  secretDigestHex: "a".repeat(64),
  payload: fixtureEnvelope(),
};

describe("Supabase RPC client", () => {
  test("uses the server-only key and narrow RPC endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        outcome: "inserted",
        traceId: "8C41C7D7-0959-4CA2-A73F-A623C50F11C9",
        appId: "00000000-0000-4000-8000-000000000001",
      }),
    );

    await ingestThroughSupabase(testConfig, input, fetchMock);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://example.supabase.co/rest/v1/rpc/ingest_trace",
    );
    expect(init.headers).toMatchObject({ apikey: "sb_secret_test" });
    expect(JSON.parse(String(init.body))).toMatchObject({
      p_key_prefix: input.keyPrefix,
      p_secret_digest_hex: input.secretDigestHex,
    });
  });

  test.each([
    ["PT401", "invalid_key"],
    ["PT400", "invalid_payload"],
    ["PT409", "conflict"],
  ] as const)("maps database code %s", async (code, expectedKind) => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ code }, { status: Number(code.slice(2)) }),
    );

    await expect(
      ingestThroughSupabase(testConfig, input, fetchMock),
    ).rejects.toEqual(new SupabaseRpcError(expectedKind));
  });
});
