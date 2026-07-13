// Rate limit per-IP DB-backed generico (finestre su tabella condivisa tra le
// istanze serverless), sullo stesso approccio di lib/account/rate-limit.ts ma
// senza dipendere da un'email: la chiave e' l'IP client. Usato dagli endpoint
// PUBBLICI e anonimi che innescano lavoro costoso o effetti collaterali:
//   - 'checkout'          -> creazione Stripe Checkout Session (/api/checkout);
//   - 'ricerca_semantica' -> embedding OpenAI + RPC pgvector (fallback vetrina);
//   - 'richiesta_ordine'  -> creazione ordine "in_attesa" + email (inviaRichiesta).
//
// E la PRIMA rete (per-IP); dietro restano i cap per-email/per-risorsa specifici
// e i rate limit di Stripe/OpenAI. FAIL-OPEN su qualsiasi problema (env admin
// mancante, tabella non ancora migrata, DB irraggiungibile): non deve mai essere
// il limiter a rompere un endpoint.

import "server-only";
import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminSupabase } from "@/lib/supabase/admin";

export type AzioneRateLimit =
  | "checkout"
  | "ricerca_semantica"
  | "richiesta_ordine";

/** Finestra (ms) e massimo di richieste per-IP in quella finestra, per azione. */
const CONFIG: Record<AzioneRateLimit, { finestraMs: number; max: number }> = {
  // Un cliente reale non fa piu di qualche checkout al minuto; il tetto ferma il
  // flood di sessioni Stripe da un singolo IP senza intralciare l'uso normale.
  checkout: { finestraMs: 60_000, max: 15 },
  // Il fallback semantico scatta solo sulle ricerche "povere" (<8 risultati): un
  // utente vero non ne innesca 20/min. Oltre, si degrada al solo letterale.
  ricerca_semantica: { finestraMs: 60_000, max: 20 },
  // Le richieste d'ordine reali sono 1-2; 5/min per IP e ampio ma taglia il flood.
  richiesta_ordine: { finestraMs: 60_000, max: 5 },
};

/**
 * IP del client. Preferisce `x-real-ip` (su Vercel = IP reale, non falsificabile
 * dal client) e ripiega sul primo hop di `x-forwarded-for`. null fuori da una
 * richiesta (contesto senza header): il chiamante non blocca.
 */
async function ipRichiesta(): Promise<string | null> {
  try {
    const h = await headers(); // async in Next 16
    const reale = h.get("x-real-ip");
    if (reale && reale.trim()) return reale.trim();
    const xff = h.get("x-forwarded-for");
    return xff ? (xff.split(",")[0]?.trim() ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * true se la richiesta puo procedere; false se la finestra per-IP e satura.
 * Registra l'evento SOLO quando consente (i tentativi bloccati non allungano la
 * finestra all'infinito). Fail-open su qualsiasi errore.
 */
export async function consentiPerIp(azione: AzioneRateLimit): Promise<boolean> {
  const { finestraMs, max } = CONFIG[azione];
  try {
    const ip = await ipRichiesta();
    // Nessun IP (dev/test o header assenti): non blocchiamo, la finestra per-IP
    // non ha senso senza una chiave. Gli altri controlli restano attivi.
    if (!ip) return true;

    // Tipizzato SupabaseClient (schema generico): `rate_limit_eventi` non e
    // ancora nei types generati (rigenerare dopo la migration 20260713140000).
    const admin: SupabaseClient = createAdminSupabase();
    const daIso = new Date(Date.now() - finestraMs).toISOString();

    const { count, error } = await admin
      .from("rate_limit_eventi")
      .select("id", { count: "exact", head: true })
      .eq("azione", azione)
      .eq("chiave", ip)
      .gte("creato_il", daIso);
    // Tabella non ancora migrata / DB giu: fail-open (non registra e consente).
    if (error) return true;
    if ((count ?? 0) >= max) return false;

    await admin.from("rate_limit_eventi").insert({ azione, chiave: ip });

    // Pulizia best effort delle righe scadute (>1 giorno), saltuaria per non
    // scrivere a ogni richiesta. Non awaited, mai propagata: solo manutenzione.
    if (Math.random() < 0.05) {
      const unGiornoFaIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      void (async () => {
        try {
          await admin
            .from("rate_limit_eventi")
            .delete()
            .lt("creato_il", unGiornoFaIso);
        } catch {
          // Solo pulizia: mai propagare.
        }
      })();
    }

    return true;
  } catch {
    // Env admin mancante o errore imprevisto: fail-open, come rate-limit.ts.
    return true;
  }
}
