"use server";

// Server Actions del pannello ordini (area gestore).
// Auth: verifySession() (solo gestore). Dati: admin client (service role), perche
// `ordini` non ha policy anon/auth — la barriera e l'auth-gate qui sopra.
//
// Transizioni di stato: ogni cambio e GUARDATO sullo stato di partenza ammesso
// (UPDATE condizionato che, se non tocca righe, e trattato come transizione
// negata). Cosi un ordine "pagato" non puo regredire (perdita pagamento) ne un
// "annullato" essere segnato pagato. Il pagamento manuale passa da una RPC
// atomica che allinea lo stock al percorso Stripe.

import { revalidatePath } from "next/cache";

import { verifySession } from "@/lib/gestore/auth";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { inviaEmail } from "@/lib/email";
import { NEGOZIO } from "@/lib/negozio";
import type { StatoOrdine } from "@/lib/types";
import type { Database } from "@/lib/supabase/database.types";

export interface EsitoOrdine {
  ok: boolean;
  error?: string;
}

type OrdiniUpdate = Database["public"]["Tables"]["ordini"]["Update"];

/**
 * Applica un patch all'ordine solo se lo stato corrente e tra quelli ammessi.
 * 0 righe aggiornate => transizione non consentita (o ordine inesistente).
 */
async function aggiornaStato(
  id: string,
  patch: OrdiniUpdate,
  statiAmmessi: StatoOrdine[],
): Promise<EsitoOrdine> {
  const sessione = await verifySession();
  if (!sessione) return { ok: false, error: "Non autorizzato." };

  try {
    const admin = createAdminSupabase();
    const { data, error } = await admin
      .from("ordini")
      .update(patch)
      .eq("id", id)
      .in("stato", statiAmmessi)
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) {
      return { ok: false, error: "Operazione non consentita per questo ordine." };
    }

    revalidatePath("/gestore/ordini");
    return { ok: true };
  } catch {
    return { ok: false, error: "Errore di rete. Riprova." };
  }
}

/**
 * Conferma la disponibilita: l'ordine passa a "confermato" e diventa pagabile.
 * Solo da "in_attesa" (un ordine gia pagato/annullato non si ri-conferma, cosi
 * non puo tornare pagabile dopo il pagamento). Notifica il cliente (best effort).
 */
export async function confermaOrdineAction(id: string): Promise<EsitoOrdine> {
  const sessione = await verifySession();
  if (!sessione) return { ok: false, error: "Non autorizzato." };

  try {
    const admin = createAdminSupabase();
    const { data: ordine, error } = await admin
      .from("ordini")
      .update({ stato: "confermato", confermato_il: new Date().toISOString() })
      .eq("id", id)
      .eq("stato", "in_attesa")
      .select("email, nome, token")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!ordine) {
      return {
        ok: false,
        error: "Solo una richiesta in attesa puo essere confermata.",
      };
    }

    revalidatePath("/gestore/ordini");

    if (ordine.email && ordine.token) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
      await inviaEmail({
        to: ordine.email,
        subject: "La tua richiesta è disponibile — completa l'ordine · Anna Shop",
        text: `Ciao ${ordine.nome ?? ""},\n\nbuone notizie: gli articoli della tua richiesta sono disponibili! Completa il pagamento in sicurezza da questa pagina:\n\n${siteUrl}/ordine/${ordine.token}\n\nA presto,\nAnna Shop di Borracci Anna — ${NEGOZIO.indirizzoCompleto}`,
      });
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Errore di rete. Riprova." };
  }
}

/** Rifiuta/annulla l'ordine. Non si annulla un ordine gia pagato. */
export async function annullaOrdineAction(id: string): Promise<EsitoOrdine> {
  return aggiornaStato(id, { stato: "annullato" }, ["in_attesa", "confermato"]);
}

/**
 * Segna pagato manualmente (es. pagamento in negozio). Passa dalla RPC atomica
 * che, come il webhook Stripe, scala lo stock UNA sola volta e blocca le
 * transizioni illegali (solo da in_attesa/confermato).
 */
export async function segnaPagatoOrdineAction(id: string): Promise<EsitoOrdine> {
  const sessione = await verifySession();
  if (!sessione) return { ok: false, error: "Non autorizzato." };

  try {
    const admin = createAdminSupabase();
    const { error } = await admin.rpc("segna_ordine_pagato_manuale", {
      p_ordine_id: id,
    });
    if (error) {
      // La RPC solleva un'eccezione sulle transizioni non consentite.
      return { ok: false, error: "Operazione non consentita per questo ordine." };
    }

    revalidatePath("/gestore/ordini");
    return { ok: true };
  } catch {
    return { ok: false, error: "Errore di rete. Riprova." };
  }
}
