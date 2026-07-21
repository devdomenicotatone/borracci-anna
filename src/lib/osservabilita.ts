// Segnalazione dei problemi tecnici alla casella del negozio (osservabilità).
//
// Un e-commerce senza presidio tecnico ha guasti SILENZIOSI: il webhook Stripe
// che fallisce (ordini pagati non finalizzati), il sync giacenze che si ferma
// (vetrina che vende pezzi esauriti), l'email di conferma che non parte
// (inadempimento art. 51 co. 7 Cod. Consumo, finding M11). Qui c'è l'unico
// canale di allarme attivo: un'email alla casella del negozio.
//
// Regole:
//   - MAI lanciare: una segnalazione fallita non deve mai aggravare il guasto
//     che sta segnalando (il webhook deve comunque rispondere a Stripe).
//   - Dedup su DB (stessa tabella finestrata del rate limit per-IP, bucket
//     "alert"): i retry di Stripe sullo stesso evento non generano una tempesta
//     di email. Finestra MASSIMA 24h: la pulizia periodica di rate-limit-ip.ts
//     cancella le righe più vecchie di un giorno.
//   - Ogni segnalazione finisce COMUNQUE nei log (console.error): se anche
//     l'SMTP è giù, nei log di Vercel resta traccia cercabile.
//   - Fail-open sul dedup: tabella non migrata o DB irraggiungibile → si prova
//     comunque a inviare (meglio un doppione che il silenzio).

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminSupabase } from "@/lib/supabase/admin";
import { inviaEmail } from "@/lib/email";
import { NEGOZIO } from "@/lib/negozio";

export interface Segnalazione {
  /** Titolo breve, finisce nell'oggetto dell'email. */
  titolo: string;
  /** Corpo della segnalazione: contesto, riferimenti (session id, errore). */
  dettaglio: string;
  /**
   * Chiave di dedup: la stessa chiave non genera più di un'email per finestra
   * (es. "webhook-fin:<session_id>", "sync-giacenze").
   */
  chiave: string;
  /** Finestra di dedup in minuti (default 24h; oltre non è affidabile). */
  finestraMinuti?: number;
}

/** Momento leggibile in fuso Italia, per il corpo delle email. */
function adessoIt(): string {
  return new Date().toLocaleString("it-IT", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Europe/Rome",
  });
}

/**
 * true se per questa chiave è già partita una segnalazione nella finestra.
 * Fail-open: qualsiasi errore → false (si invia comunque).
 */
async function giaSegnalato(chiave: string, finestraMs: number): Promise<boolean> {
  try {
    // `rate_limit_eventi` non e nei types generati (come in rate-limit-ip.ts):
    // client generico non-tipizzato.
    const admin: SupabaseClient = createAdminSupabase();
    const daIso = new Date(Date.now() - finestraMs).toISOString();
    const { count, error } = await admin
      .from("rate_limit_eventi")
      .select("id", { count: "exact", head: true })
      .eq("azione", "alert")
      .eq("chiave", chiave)
      .gte("creato_il", daIso);
    if (error) return false;
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

/** Registra l'invio riuscito, così la finestra di dedup parte. Best effort. */
async function registraSegnalazione(chiave: string): Promise<void> {
  try {
    const admin: SupabaseClient = createAdminSupabase();
    await admin.from("rate_limit_eventi").insert({ azione: "alert", chiave });
  } catch {
    // Solo dedup: al peggio la prossima occorrenza rimanda l'email.
  }
}

/**
 * Segnala un problema tecnico alla casella del negozio. Mai throw; l'esito
 * (inviata, dedup, fallita) resta nei log. La registrazione del dedup avviene
 * SOLO a invio riuscito: se l'SMTP è giù, la prossima occorrenza riprova.
 */
export async function segnalaProblema(s: Segnalazione): Promise<void> {
  try {
    // Traccia SEMPRE nei log di Vercel, anche se l'email poi non parte.
    console.error(`[osservabilita] ${s.titolo} — chiave=${s.chiave}\n${s.dettaglio}`);

    const finestraMs =
      Math.min(Math.max(s.finestraMinuti ?? 24 * 60, 1), 24 * 60) * 60_000;
    if (await giaSegnalato(s.chiave, finestraMs)) return;

    const inviata = await inviaEmail({
      to: NEGOZIO.email,
      subject: `⚠️ Avviso tecnico — ${s.titolo}`,
      text: `Avviso tecnico automatico da Anna Shop (${adessoIt()}).\n\n${s.dettaglio}\n\nQuesta segnalazione non verrà ripetuta per la stessa causa nelle prossime ore. Se il problema persiste, riceverai un nuovo avviso.`,
    });
    if (inviata) {
      await registraSegnalazione(s.chiave);
    } else {
      console.error(
        `[osservabilita] invio email di segnalazione FALLITO — chiave=${s.chiave}`,
      );
    }
  } catch (err) {
    // Ultima rete: la segnalazione non deve mai propagare errori al chiamante.
    console.error("[osservabilita] segnalazione fallita:", err);
  }
}
