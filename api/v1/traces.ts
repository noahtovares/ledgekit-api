import { loadRuntimeConfig } from "../../src/config.js";
import { handleTraceRequest } from "../../src/ingest.js";
import { errorResponse } from "../../src/responses.js";
import { ingestThroughSupabase } from "../../src/supabase.js";
import { consoleTelemetry } from "../../src/telemetry.js";

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      const config = loadRuntimeConfig();
      return await handleTraceRequest(request, {
        config,
        submit: (input) => ingestThroughSupabase(config, input),
        telemetry: consoleTelemetry,
      });
    } catch {
      const requestID = crypto.randomUUID();
      consoleTelemetry({
        requestId: requestID,
        status: 500,
        durationMilliseconds: 0,
        responseBytes: 0,
        errorCode: "configuration_error",
      });
      return errorResponse(500, "configuration_error", requestID);
    }
  },
};
