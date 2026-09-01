export interface RuntimeConfig {
  supabaseURL: string;
  supabaseSecretKey: string;
}

export function loadRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env,
): RuntimeConfig {
  const supabaseURL = environment.SUPABASE_URL?.replace(/\/$/, "");
  const supabaseSecretKey = environment.SUPABASE_SECRET_KEY;
  if (!supabaseURL || !supabaseSecretKey) {
    throw new Error("missing_supabase_configuration");
  }

  return {
    supabaseURL,
    supabaseSecretKey,
  };
}
