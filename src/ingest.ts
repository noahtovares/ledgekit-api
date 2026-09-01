import { randomUUID } from "node:crypto";

import { digestSecret, parseAuthorization } from "./auth.js";
import type { RuntimeConfig } from "./config.js";
import { validateEnvelope } from "./envelope.js";
import { emptyResponse, errorResponse } from "./responses.js";
import { SupabaseRpcError } from "./supabase.js";
import type { TelemetryLogger } from "./telemetry.js";
import type { JsonObject, RpcResult } from "./types.js";

export interface IngestDependencies {
  config: RuntimeConfig;
  submit: (input: {
    keyPrefix: string;
    secretDigestHex: string;
    payload: JsonObject;
  }) => Promise<RpcResult>;
  telemetry: TelemetryLogger;
  now?: () => number;
  requestID?: () => string;
}

function contentTypeIsJSON(value: string | null): boolean {
  return value?.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
}

function parseDeclaredLength(value: string | null): number | null {
  if (value === null) return null;
  if (!/^\d+$/.test(value)) return Number.NaN;
  return Number(value);
}

export async function handleTraceRequest(
  request: Request,
  dependencies: IngestDependencies,
): Promise<Response> {
  const startedAt = (dependencies.now ?? Date.now)();
  const requestID = (dependencies.requestID ?? randomUUID)();
  let status = 500;
  let errorCode: string | undefined;
  let keyPrefix: string | undefined;
  let traceID: string | undefined;
  let traceName: string | undefined;
  let traceVersion: number | undefined;
  let appID: string | undefined;
  let responseBytes = 0;

  const finish = (response: Response, code?: string): Response => {
    status = response.status;
    errorCode = code;
    responseBytes = Number(response.headers.get("content-length") ?? 0);
    return response;
  };

  try {
    if (request.method !== "POST") {
      return finish(
        errorResponse(405, "method_not_allowed", requestID, { Allow: "POST" }),
        "method_not_allowed",
      );
    }
    if (!contentTypeIsJSON(request.headers.get("content-type"))) {
      return finish(
        errorResponse(415, "unsupported_media_type", requestID),
        "unsupported_media_type",
      );
    }

    const declaredLength = parseDeclaredLength(
      request.headers.get("content-length"),
    );
    if (Number.isNaN(declaredLength)) {
      return finish(
        errorResponse(400, "invalid_content_length", requestID),
        "invalid_content_length",
      );
    }
    if (
      declaredLength !== null &&
      declaredLength > dependencies.config.maximumBodyBytes
    ) {
      return finish(
        errorResponse(413, "payload_too_large", requestID),
        "payload_too_large",
      );
    }

    const credential = parseAuthorization(request.headers.get("authorization"));
    if (!credential) {
      return finish(
        errorResponse(401, "invalid_ingest_key", requestID),
        "invalid_ingest_key",
      );
    }
    keyPrefix = credential.keyPrefix;

    const body = new Uint8Array(await request.arrayBuffer());
    if (body.byteLength > dependencies.config.maximumBodyBytes) {
      return finish(
        errorResponse(413, "payload_too_large", requestID),
        "payload_too_large",
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
    } catch {
      return finish(
        errorResponse(400, "invalid_json", requestID),
        "invalid_json",
      );
    }

    const envelope = validateEnvelope(
      payload,
      request.headers.get("idempotency-key"),
      request.headers.get("x-ledge-schema-version"),
    );
    if (!envelope) {
      return finish(
        errorResponse(400, "invalid_envelope", requestID),
        "invalid_envelope",
      );
    }
    traceID = envelope.traceID;
    traceName = envelope.traceName;
    traceVersion = envelope.traceVersion;

    try {
      const result = await dependencies.submit({
        keyPrefix: credential.keyPrefix,
        secretDigestHex: digestSecret(credential.secret),
        payload: envelope.payload,
      });
      appID = result.appId;
      return finish(
        emptyResponse(result.outcome === "inserted" ? 201 : 200, requestID),
      );
    } catch (error) {
      if (error instanceof SupabaseRpcError) {
        const mapping = {
          invalid_key: [401, "invalid_ingest_key"],
          invalid_payload: [400, "invalid_envelope"],
          conflict: [409, "trace_conflict"],
          temporary: [503, "ingest_unavailable"],
        } as const;
        const [mappedStatus, mappedCode] = mapping[error.kind];
        return finish(
          errorResponse(mappedStatus, mappedCode, requestID),
          mappedCode,
        );
      }
      return finish(
        errorResponse(500, "internal_error", requestID),
        "internal_error",
      );
    }
  } finally {
    const event = {
      requestId: requestID,
      status,
      durationMilliseconds: Math.max(
        0,
        (dependencies.now ?? Date.now)() - startedAt,
      ),
      responseBytes,
      ...(errorCode === undefined ? {} : { errorCode }),
      ...(keyPrefix === undefined ? {} : { keyPrefix }),
      ...(appID === undefined ? {} : { appId: appID }),
      ...(traceID === undefined ? {} : { traceId: traceID }),
      ...(traceName === undefined ? {} : { traceName }),
      ...(traceVersion === undefined ? {} : { traceVersion }),
    };
    dependencies.telemetry(event);
  }
}
