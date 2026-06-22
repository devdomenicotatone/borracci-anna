import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createServerSupabase } from "@/lib/supabase/server";
import type { Profilo } from "@/lib/types";

// Data Access Layer (DAL) dell'area gestore.
// verifySession() e la verifica REALE (server-side) di identita + ruolo, ed e
// la barriera da richiamare in OGNI Server Action (i POST sono raggiungibili
// direttamente). Memoizzata per-richiesta con cache().

export interface SessioneGestore {
  userId: string;
  profilo: Profilo;
  /** Client Supabase (anon + sessione) gia pronto, da riusare nelle action. */
  supabase: SupabaseClient;
}

/**
 * Verifica la sessione e il ruolo gestore.
 * Ritorna null se: Supabase non configurato, utente non autenticato, oppure
 * utente autenticato ma SENZA riga in `profili` (cioe non gestore).
 */
export const verifySession = cache(
  async (): Promise<SessioneGestore | null> => {
    const supabase = await createServerSupabase();
    if (!supabase) return null;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profilo } = await supabase
      .from("profili")
      .select("id, ruolo, nome")
      .eq("id", user.id)
      .maybeSingle();

    if (!profilo) return null; // autenticato ma NON gestore

    return { userId: user.id, profilo: profilo as Profilo, supabase };
  },
);

/** Come verifySession ma redirige a /gestore/login se non autorizzato. */
export async function requireGestore(): Promise<SessioneGestore> {
  const sessione = await verifySession();
  if (!sessione) redirect("/gestore/login");
  return sessione;
}
