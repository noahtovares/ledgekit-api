import type { RuntimeConfig } from "./config.js";
import { POSTGREST_TIMEOUT_MS } from "./constants.js";
import type { JsonObject, RpcResult } from "./types.js";

export type SupabaseFailureKind =
  | "invalid_key"
  | "invalid_payload"
  | "conflict"
  | "temporary";

export class SupabaseRpcError extends Error {
  constructor(public readonly kind: SupabaseFailureKind) {
    super(kind);
    this.name = "SupabaseRpcError";
  }
}

interface PostgrestError {
  code?: unknown;
}

function failureKind(status: number, body: PostgrestError): SupabaseFailureKind {
  if (body.code === "PT401") return "invalid_key";
  if (body.code === "PT400") return "invalid_payload";
  if (body.code === "PT409") return "conflict";
  if (status >= 500 || status === 429) return "temporary";
  return "temporary";
}

export async function ingestThroughSupabase(
  config: RuntimeConfig,
  input: {
    keyPrefix: string;
    secretDigestHex: string;
    payload: JsonObject;
  },
  fetchImplementation: typeof fetch = fetch,
): Promise<RpcResult> {
  let response: Response;
  try {
    response = await fetchImplementation(
      `${config.supabaseURL}/rest/v1/rpc/ingest_trace`,
      {
        method: "POST",
        headers: {
          apikey: config.supabaseSecretKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_key_prefix: input.keyPrefix,
          p_secret_digest_hex: input.secretDigestHex,
          p_payload: input.payload,
        }),
        signal: AbortSignal.timeout(POSTGREST_TIMEOUT_MS),
      },
    );
  } catch {
    throw new SupabaseRpcError("temporary");
  }

  if (!response.ok) {
    let body: PostgrestError = {};
    try {
      body = (await response.json()) as PostgrestError;
    } catch {
      // Error content is intentionally discarded.
    }
    throw new SupabaseRpcError(failureKind(response.status, body));
  }

  const result = (await response.json()) as Partial<RpcResult>;
  if (
    (result.outcome !== "inserted" && result.outcome !== "duplicate") ||
    typeof result.traceId !== "string" ||
    typeof result.appId !== "string" ||
    (result.environment !== "development" &&
      result.environment !== "staging" &&
      result.environment !== "production")
  ) {
    throw new SupabaseRpcError("temporary");
  }
  return result as RpcResult;
}
