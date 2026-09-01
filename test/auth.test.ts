import { describe, expect, test } from "vitest";

import {
  digestSecret,
  generateIngestToken,
  parseAuthorization,
} from "../src/auth.js";
import { ingestToken } from "./helpers.js";

describe("ingest credentials", () => {
  test("parses the fixed external token format", () => {
    expect(parseAuthorization(`Bearer ${ingestToken}`)).toEqual({
      keyPrefix: "lk_abcdefghijkl",
      secret: "A".repeat(43),
    });
  });

  test.each([
    null,
    "",
    ingestToken,
    "Basic value",
    "Bearer lk_short.secret",
    `Bearer lk_abcdefghijkl.${"+".repeat(43)}`,
  ])("rejects malformed authorization: %s", (value) => {
    expect(parseAuthorization(value)).toBeNull();
  });

  test("generates a parseable token and stores only its digest", () => {
    const generated = generateIngestToken();
    const parsed = parseAuthorization(`Bearer ${generated.token}`);

    expect(parsed?.keyPrefix).toBe(generated.keyPrefix);
    expect(generated.secretDigestHex).toBe(digestSecret(parsed?.secret ?? ""));
    expect(generated.secretDigestHex).toMatch(/^[0-9a-f]{64}$/);
    expect(generated.secretDigestHex).not.toContain(parsed?.secret ?? "missing");
  });
});
