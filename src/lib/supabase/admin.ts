// Client Supabase con service role: bypassa le RLS. SOLO lato server.
// Usato dal webhook Stripe per scrivere ordini in modo affidabile.
// Inizializzazione LAZY: nessun accesso a process.env a livello di modulo.

// Barriera di build: se questo modulo (e la service role key) finisse per errore
// in un bundle client, la build fallisce invece di esporre la chiave a runtime.
import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

// NB: questo modulo deve essere importato SOLO da codice server (route handler,
// server action). La service role key non deve mai finire nel bundle client.

/**
 * Crea un client Supabase con la service role key (privilegi pieni).
 * NON usare mai lato client: la chiave bypassa tutte le policy RLS.
 *
 * Lancia solo se chiamato senza le env necessarie (mai durante import/build).
 */
export function createAdminSupabase(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase admin non configurato: imposta NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
