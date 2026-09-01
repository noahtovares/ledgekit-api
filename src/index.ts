import { Hono } from "hono";
import { requestId, type RequestIdVariables } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";

import { loadRuntimeConfig } from "./config.js";
import { handleTraceRequest } from "./ingest.js";
import { errorResponse } from "./responses.js";
import { ingestThroughSupabase } from "./supabase.js";
import {
  consoleTelemetry,
  type TelemetryLogger,
} from "./telemetry.js";
import type { JsonObject, RpcResult } from "./types.js";

export interface AppDependencies {
  submit: (input: {
    keyPrefix: string;
    secretDigestHex: string;
    payload: JsonObject;
  }) => Promise<RpcResult>;
  telemetry: TelemetryLogger;
}

type AppEnvironment = {
  Variables: RequestIdVariables;
};

export function createApp(dependencies: AppDependencies): Hono<AppEnvironment> {
  const app = new Hono<AppEnvironment>();

  app.use("*", requestId());
  app.use("*", secureHeaders());

  app.get("/health", (context) =>
    context.json(
      { status: "ok" },
      200,
      { "Cache-Control": "no-store" },
    ),
  );

  app.post("/v1/traces", (context) =>
    handleTraceRequest(context.req.raw, {
      submit: dependencies.submit,
      telemetry: dependencies.telemetry,
      requestID: () => context.get("requestId"),
    }),
  );

  app.all("/v1/traces", (context) =>
    errorResponse(405, "method_not_allowed", context.get("requestId"), {
      Allow: "POST",
    }),
  );

  app.notFound((context) =>
    errorResponse(404, "not_found", context.get("requestId")),
  );

  app.onError((_error, context) => {
    const currentRequestID = context.get("requestId");
    dependencies.telemetry({
      requestId: currentRequestID,
      status: 500,
      durationMilliseconds: 0,
      responseBytes: 0,
      errorCode: "internal_error",
    });
    return errorResponse(500, "internal_error", currentRequestID);
  });

  return app;
}

const app = createApp({
  submit: (input) => ingestThroughSupabase(loadRuntimeConfig(), input),
  telemetry: consoleTelemetry,
});

export default app;
