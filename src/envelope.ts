import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import traceSchema from "../schema/ledge-trace-v1.schema.json" with {
  type: "json",
};
import { LEDGE_SCHEMA_VERSION } from "./constants.js";
import type { JsonObject, ValidatedEnvelope } from "./types.js";

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateSchema = ajv.compile(traceSchema);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function object(value: unknown): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

export function validateEnvelope(
  value: unknown,
  idempotencyKey: string | null,
  schemaVersionHeader: string | null,
): ValidatedEnvelope | null {
  if (schemaVersionHeader !== String(LEDGE_SCHEMA_VERSION)) return null;
  if (!idempotencyKey || !UUID_PATTERN.test(idempotencyKey)) return null;
  if (!validateSchema(value)) return null;

  const payload = object(value);
  const producer = object(payload?.producer);
  const definition = object(payload?.traceDefinition);
  const trace = object(payload?.trace);
  if (!payload || !producer || !definition || !trace) return null;

  const traceID = trace.id;
  const traceName = trace.name;
  const definitionName = definition.name;
  const traceVersion = definition.version;
  const serviceName = producer.serviceName;
  const status = trace.status;

  if (
    typeof traceID !== "string" ||
    traceID.toLowerCase() !== idempotencyKey.toLowerCase() ||
    typeof traceName !== "string" ||
    traceName.length === 0 ||
    definitionName !== traceName ||
    typeof traceVersion !== "number" ||
    !Number.isInteger(traceVersion) ||
    traceVersion < 1 ||
    typeof serviceName !== "string" ||
    serviceName.length === 0 ||
    status === "running" ||
    typeof trace.endedAt !== "string"
  ) {
    return null;
  }

  return {
    payload,
    traceID,
    traceName,
    traceVersion,
    serviceName,
  };
}
