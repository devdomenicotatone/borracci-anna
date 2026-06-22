// Client Supabase lato browser (Client Components).
// Legge le env pubbliche NEXT_PUBLIC_* che sono inlined nel bundle a build time.

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Crea un client Supabase per il browser.
 * Le env pubbliche sono sostituite a compile time; se mancano i metodi
 * falliranno a runtime, ma il modulo non lancia in fase di import/build.
 */
export function createBrowserSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  return createBrowserClient(url, anonKey);
}
