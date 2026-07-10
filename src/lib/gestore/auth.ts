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

    // MFA fail-CLOSED e AUTORITATIVA. Se l'utente ha un authenticator verificato,
    // la sessione DEVE essere aal2 (codice TOTP inserito in questo login);
    // altrimenti e' un login a meta' e si respinge come non autorizzato.
    //
    // NON usiamo getAuthenticatorAssuranceLevel() senza jwt: quello deriva il
    // livello dai fattori nella sessione salvata nei cookie, che su una sessione
    // appena creata da password puo' essere vuota -> nextLevel resta aal1 e il
    // check non scatterebbe (fail-open). Qui invece:
    //   - i fattori arrivano da getUser() (sopra), letti dal server di Auth;
    //   - il livello REALE della sessione dal claim `aal` del JWT via getClaims()
    //     (firma verificata con la JWKS, o fallback getUser()).
    // Se il livello non e' determinabile si NEGA. Il muro definitivo resta la RLS
    // is_gestore() (migration 20260709120000_mfa_gestore), ma le tabelle lette col
    // service role (ordini) la bypassano: qui e' l'unica barriera per quelle.
    const haFattoreVerificato = (user.factors ?? []).some(
      (f) => f.status === "verified",
    );
    if (haFattoreVerificato) {
      const { data: datiClaims } = await supabase.auth.getClaims();
      const aal = (datiClaims?.claims as { aal?: string } | undefined)?.aal;
      if (aal !== "aal2") return null;
    }

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
