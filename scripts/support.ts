import postgres from "postgres";

import type { IngestKeyMode } from "../src/types.js";

export function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export function requiredArgument(name: string): string {
  const value = argument(name);
  if (!value) throw new Error(`missing_--${name}`);
  return value;
}

export function requiredKeyMode(): IngestKeyMode {
  const mode = requiredArgument("mode");
  if (mode !== "live" && mode !== "test") {
    throw new Error("invalid_mode");
  }
  return mode;
}

export function operatorDatabase() {
  const databaseURL = process.env.DATABASE_URL;
  if (!databaseURL) throw new Error("missing_DATABASE_URL");
  return postgres(databaseURL, { max: 1, prepare: false });
}
