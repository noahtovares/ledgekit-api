import {
  DEFAULT_POSTGREST_TIMEOUT_MS,
  MAX_BODY_BYTES,
} from "./constants.js";

export interface RuntimeConfig {
  supabaseURL: string;
  supabaseSecretKey: string;
  maximumBodyBytes: number;
  postgrestTimeoutMilliseconds: number;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("invalid_numeric_configuration");
  }
  return parsed;
}

export function loadRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env,
): RuntimeConfig {
  const supabaseURL = environment.SUPABASE_URL?.replace(/\/$/, "");
  const supabaseSecretKey = environment.SUPABASE_SECRET_KEY;
  if (!supabaseURL || !supabaseSecretKey) {
    throw new Error("missing_supabase_configuration");
  }

  const maximumBodyBytes = positiveInteger(
    environment.MAX_BODY_BYTES,
    MAX_BODY_BYTES,
  );
  if (maximumBodyBytes !== MAX_BODY_BYTES) {
    throw new Error("MAX_BODY_BYTES_must_equal_4194304");
  }

  return {
    supabaseURL,
    supabaseSecretKey,
    maximumBodyBytes,
    postgrestTimeoutMilliseconds: positiveInteger(
      environment.POSTGREST_TIMEOUT_MS,
      DEFAULT_POSTGREST_TIMEOUT_MS,
    ),
  };
}
