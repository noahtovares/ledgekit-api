export interface RuntimeConfig {
  supabaseURL: string;
  supabaseSecretKey: string;
}

export function loadRuntimeConfig(
  processEnvironment: NodeJS.ProcessEnv = process.env,
): RuntimeConfig {
  const supabaseURL = processEnvironment.SUPABASE_URL?.replace(/\/$/, "");
  const supabaseSecretKey = processEnvironment.SUPABASE_SECRET_KEY;
  if (!supabaseURL || !supabaseSecretKey) {
    throw new Error("missing_supabase_configuration");
  }

  return {
    supabaseURL,
    supabaseSecretKey,
  };
}
