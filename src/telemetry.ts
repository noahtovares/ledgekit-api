export interface IngestTelemetry {
  requestId: string;
  status: number;
  durationMilliseconds: number;
  responseBytes: number;
  errorCode?: string;
  keyPrefix?: string;
  appId?: string;
  traceId?: string;
  traceName?: string;
  traceVersion?: number;
}

export type TelemetryLogger = (event: IngestTelemetry) => void;

export const consoleTelemetry: TelemetryLogger = (event) => {
  console.info(JSON.stringify({ event: "trace_ingest", ...event }));
};
