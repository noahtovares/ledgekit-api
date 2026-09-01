export type JsonObject = Record<string, unknown>;
export type IngestKeyMode = "live" | "test";

export interface ValidatedEnvelope {
  payload: JsonObject;
  traceID: string;
  traceName: string;
  traceVersion: number;
  serviceName: string;
}

export interface IngestCredential {
  keyPrefix: string;
  secret: string;
}

export interface RpcResult {
  outcome: "inserted" | "duplicate";
  traceId: string;
  appId: string;
}
