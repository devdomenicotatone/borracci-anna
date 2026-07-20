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
import { getStripe } from "@/lib/stripe";
import { inviaEmail } from "@/lib/email";
import { noteLegaliEmail } from "@/lib/legale";
import { NEGOZIO } from "@/lib/negozio";
import { formatPrezzo } from "@/lib/format";
import type { StatoOrdine } from "@/lib/types";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Fa scadere la sessione Stripe eventualmente aperta di un ordine (best effort).
 * Dopo un annullamento o un pagamento manuale (in negozio) il cliente non deve
 * poter completare un pagamento Stripe di una sessione ancora aperta: sarebbe un
 * doppio incasso, o un ordine annullato che "risuscita" pagato dal webhook.
 * Se la sessione risulta gia pagata non c'e nulla da fare qui (va gestito a mano
 * con un rimborso): expire e un no-op sulle sessioni gia complete.
 */
async function scadiSessioneOrdine(id: string): Promise<void> {
  if (!process.env.STRIPE_SECRET_KEY) return;
  try {
    const admin = createAdminSupabase();
    const { data } = await admin
      .from("ordini")
      .select("stripe_session_id")
      .eq("id", id)
      .maybeSingle();
    const sid = data?.stripe_session_id;
    if (!sid) return;
    await getStripe().checkout.sessions.expire(sid);
  } catch {
    // Sessione gia scaduta/completata/inesistente: niente da fare.
  }
}

/** Cap di sicurezza per il costo di spedizione inserito dal gestore (100 EUR). */
const MAX_SPEDIZIONE_CENTS = 10_000;

/** Cap di sicurezza sul numero di rimozioni per conferma parziale. */
const MAX_RIMOZIONI = 100;

/** Riga segnata "non disponibile" in fase di conferma parziale. */
export interface RimozioneRiga {
  rigaId: string;
  motivo: string;
}

/**
 * Voce del deficit di giacenza fotografato dalla RPC alla finalizzazione
 * (ordini.stock_mancante, jsonb; NULL = tutto ok). Stesso contratto del
 * webhook Stripe (migration 20260720170000).
 */
export interface VoceStockMancante {
  sku: string | null;
  richiesti: number;
  disponibili: number;
}

export interface EsitoOrdine {
  ok: boolean;
  error?: string;
  /** Operazione riuscita MA con un problema collaterale da segnalare alla
   *  titolare (es. email al cliente non partita): il pannello lo mostra. */
  avviso?: string;
  /** Deficit di giacenza registrato dalla RPC del pagamento manuale: il
   *  pannello lo fonde nello stato locale per mostrare subito il badge. */
  stockMancante?: VoceStockMancante[];
}

/**
 * Errore DB non previsto: il messaggio grezzo di PostgREST arriva in inglese e
 * spesso e criptico per chi non e tecnico. Non deve finire nei toast della
 * titolare: lo logghiamo server-side per la diagnosi e restituiamo un testo
 * generico in italiano.
 */
function messaggioErroreGenerico(
  error: { code?: string; message?: string },
  contesto: string,
): string {
  console.error(`[${contesto}]`, error?.code ?? "", error?.message ?? error);
  return "Operazione non riuscita, riprova. Se succede ancora contatta l'assistenza.";
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
    if (error) return { ok: false, error: messaggioErroreGenerico(error, "aggiornaStato") };
    if (!data) {
      return { ok: false, error: "Operazione non consentita per questo ordine." };
    }

    revalidatePath("/gestore/ordini");
    return { ok: true };
  } catch {
    return { ok: false, error: "Errore di rete. Riprova." };
  }
}

/** Dettagli riga per l'email: "(Colore, Taglia M)" o stringa vuota. */
function dettagliRiga(r: { colore: string | null; taglia: string | null }): string {
  const det = [r.colore, r.taglia ? `Taglia ${r.taglia}` : null].filter(Boolean);
  return det.length ? ` (${det.join(", ")})` : "";
}

/**
 * Conferma la disponibilita: l'ordine passa a "confermato" e diventa pagabile.
 * Solo da "in_attesa" (un ordine gia pagato/annullato non si ri-conferma, cosi
 * non puo tornare pagabile dopo il pagamento).
 *
 * In questo flusso "su richiesta" la spedizione e CONCORDATA: il gestore fissa
 * qui `costoSpedizioneCents` (0 = gratis). Con `rimozioni` la conferma e
 * PARZIALE: le righe indicate vengono segnate non disponibili (rimossa_il +
 * motivo) e restano fuori da totale e pagamento. Il totale viene ricalcolato
 * come merce (somma delle righe attive, fonte di verita) + spedizione, cosi un
 * doppio click o un valore vecchio non si sommano mai.
 *
 * La transizione di stato (update guardato, atomico) avviene PRIMA di toccare
 * le righe: tra conferme concorrenti solo la vincente scrive le rimozioni, le
 * altre escono senza toccare nulla. Le rimozioni vengono prima azzerate e poi
 * riscritte, quindi anche un retry resta idempotente. Notifica il cliente con
 * l'importo finale (best effort).
 */
export async function confermaOrdineAction(
  id: string,
  costoSpedizioneCents: number,
  rimozioni: RimozioneRiga[] = [],
): Promise<EsitoOrdine> {
  const sessione = await verifySession();
  if (!sessione) return { ok: false, error: "Non autorizzato." };

  // Input dal pannello gestore: validare comunque server-side.
  if (
    !Number.isInteger(costoSpedizioneCents) ||
    costoSpedizioneCents < 0 ||
    costoSpedizioneCents > MAX_SPEDIZIONE_CENTS
  ) {
    return { ok: false, error: "Costo di spedizione non valido (0–100 €)." };
  }
  if (!Array.isArray(rimozioni) || rimozioni.length > MAX_RIMOZIONI) {
    return { ok: false, error: "Righe non valide." };
  }
  // Motivi normalizzati (trim + cap) con fallback: mai stringa vuota a DB.
  // La Map deduplica eventuali rigaId ripetuti (vince l'ultimo motivo).
  const motivoPerRiga = new Map<string, string>();
  for (const r of rimozioni) {
    const rigaId = String(r?.rigaId ?? "");
    const motivo =
      String(r?.motivo ?? "").trim().slice(0, 200) || "Non disponibile";
    if (!rigaId) return { ok: false, error: "Righe non valide." };
    motivoPerRiga.set(rigaId, motivo);
  }

  try {
    const admin = createAdminSupabase();

    // Guardia anticipata (best effort): evita lavoro inutile su un ordine gia
    // confermato/pagato/annullato. La barriera vera resta l'update condizionato.
    // I valori pre-conferma servono al ripristino se le rimozioni falliscono.
    const { data: corrente, error: errStato } = await admin
      .from("ordini")
      .select("stato, costo_spedizione_cents, totale_cents")
      .eq("id", id)
      .maybeSingle();
    if (errStato) {
      return { ok: false, error: messaggioErroreGenerico(errStato, "confermaOrdineAction") };
    }
    if (!corrente || corrente.stato !== "in_attesa") {
      return {
        ok: false,
        error: "Solo una richiesta in attesa puo essere confermata.",
      };
    }

    // Righe dell'ordine (snapshot): servono per validare le rimozioni e per
    // ricalcolare la merce. Il totale non dipende dal valore gia presente su
    // `ordini`, quindi e ricalcolabile in modo idempotente.
    const { data: righe, error: errRighe } = await admin
      .from("ordine_righe")
      .select("id, nome_prodotto, taglia, colore, prezzo_cents, quantita")
      .eq("ordine_id", id);
    if (errRighe) {
      return { ok: false, error: messaggioErroreGenerico(errRighe, "confermaOrdineAction") };
    }
    const tutte = righe ?? [];

    // Ogni rigaId deve appartenere all'ordine: id estranei = richiesta corrotta.
    const idRighe = new Set(tutte.map((r) => r.id));
    for (const rigaId of motivoPerRiga.keys()) {
      if (!idRighe.has(rigaId)) return { ok: false, error: "Righe non valide." };
    }
    // Nessuna riga superstite: non e una conferma, e un rifiuto.
    if (tutte.length > 0 && motivoPerRiga.size === tutte.length) {
      return { ok: false, error: "Nessun articolo disponibile: usa Rifiuta." };
    }

    // Merce = somma delle sole righe attive: le rimosse escono dal totale.
    const attive = tutte.filter((r) => !motivoPerRiga.has(r.id));
    const rimosse = tutte.filter((r) => motivoPerRiga.has(r.id));
    const merceCents = attive.reduce(
      (acc, r) => acc + r.prezzo_cents * r.quantita,
      0,
    );
    const totaleCents = merceCents + costoSpedizioneCents;

    // Transizione PRIMA di toccare le righe: l'update guardato e atomico, per
    // cui tra conferme concorrenti solo una passa di qui e scrive le rimozioni;
    // le altre escono subito. (Con l'ordine inverso una seconda conferma poteva
    // azzerare le marcature della prima DOPO che questa aveva gia fissato stato
    // e totale parziale: il cliente avrebbe pagato anche la riga rimossa.)
    const { data: ordine, error } = await admin
      .from("ordini")
      .update({
        stato: "confermato",
        confermato_il: new Date().toISOString(),
        costo_spedizione_cents: costoSpedizioneCents,
        totale_cents: totaleCents,
      })
      .eq("id", id)
      .eq("stato", "in_attesa")
      .select("email, nome, token")
      .maybeSingle();
    if (error) {
      return { ok: false, error: messaggioErroreGenerico(error, "confermaOrdineAction") };
    }
    if (!ordine) {
      return {
        ok: false,
        error: "Solo una richiesta in attesa puo essere confermata.",
      };
    }

    // Applica le rimozioni: prima azzera tutte le righe dell'ordine (un retry
    // con un set diverso non lascia residui), poi setta quelle indicate.
    // Nessuna conferma concorrente puo interferire: l'ordine e gia confermato.
    const applicaRimozioni = async (): Promise<string | null> => {
      if (tutte.length > 0) {
        const { error: errAzzera } = await admin
          .from("ordine_righe")
          .update({ rimossa_il: null, rimossa_motivo: null })
          .eq("ordine_id", id);
        if (errAzzera) return errAzzera.message;
      }
      const rimossaIl = new Date().toISOString();
      for (const [rigaId, motivo] of motivoPerRiga) {
        const { error: errRim } = await admin
          .from("ordine_righe")
          .update({ rimossa_il: rimossaIl, rimossa_motivo: motivo })
          .eq("ordine_id", id)
          .eq("id", rigaId);
        if (errRim) return errRim.message;
      }
      return null;
    };
    const erroreRighe = await applicaRimozioni();
    if (erroreRighe) {
      // Fallite a meta: ripristino best effort. Prima azzera le marcature
      // (finche lo stato e "confermato" nessun'altra conferma puo scriverne),
      // poi riporta l'ordine in attesa coi valori pre-conferma. Il revert e
      // guardato su "confermato": mai regredire un ordine nel frattempo pagato.
      // L'email non e ancora partita, quindi il gestore puo solo riprovare.
      const { error: errRipristinoRighe } = await admin
        .from("ordine_righe")
        .update({ rimossa_il: null, rimossa_motivo: null })
        .eq("ordine_id", id);
      const { error: errRipristinoOrdine } = await admin
        .from("ordini")
        .update({
          stato: "in_attesa",
          confermato_il: null,
          costo_spedizione_cents: corrente.costo_spedizione_cents,
          totale_cents: corrente.totale_cents,
        })
        .eq("id", id)
        .eq("stato", "confermato");
      // Se il ripristino non riesce l'ordine puo restare "confermato" (pagabile)
      // con righe in stato misto: lo segnaliamo perche va verificato a mano.
      if (errRipristinoRighe || errRipristinoOrdine) {
        console.error(
          `[confermaOrdineAction] ripristino NON riuscito per ordine ${id}, stato da verificare a mano:`,
          errRipristinoRighe?.message ?? errRipristinoOrdine?.message,
        );
      }
      return {
        ok: false,
        error: messaggioErroreGenerico({ message: erroreRighe }, "confermaOrdineAction"),
      };
    }

    revalidatePath("/gestore/ordini");

    if (ordine.email && ordine.token) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
      const rigaSped =
        costoSpedizioneCents > 0
          ? `Spedizione: ${formatPrezzo(costoSpedizioneCents)}`
          : "Spedizione: gratuita";
      const intro =
        rimosse.length > 0
          ? "buone notizie: quasi tutti gli articoli della tua richiesta sono disponibili!"
          : "buone notizie: gli articoli della tua richiesta sono disponibili!";
      const elencoDisponibili = attive
        .map(
          (r) =>
            `• ${r.quantita}× ${r.nome_prodotto}${dettagliRiga(r)} — ${formatPrezzo(r.prezzo_cents * r.quantita)}`,
        )
        .join("\n");
      const sezioneRimosse =
        rimosse.length > 0
          ? `\n\nNon disponibili (rimossi dal totale):\n${rimosse
              .map(
                (r) =>
                  `✗ ${r.quantita}× ${r.nome_prodotto}${dettagliRiga(r)} — ${motivoPerRiga.get(r.id)}`,
              )
              .join("\n")}`
          : "";
      // Quell'email e l'UNICO canale con cui il cliente scopre che l'ordine e
      // pagabile: se non parte (inviaEmail non lancia, ritorna false) la
      // titolare deve saperlo, altrimenti aspetta un pagamento che non arrivera.
      // Il blocco noteLegaliEmail (recesso, garanzia, condizioni, identita del
      // venditore) accompagna la proposta pagabile: nel flusso su richiesta il
      // cliente conclude il contratto proprio a partire da questa email, il
      // corredo informativo deve viaggiare con lei (artt. 49 e 51 Cod. Consumo).
      const inviata = await inviaEmail({
        to: ordine.email,
        subject: "La tua richiesta è disponibile — completa l'ordine · Anna Shop",
        text: `Ciao ${ordine.nome ?? ""},\n\n${intro}\n\nArticoli:\n${elencoDisponibili}${sezioneRimosse}\n\n${rigaSped}\nTotale: ${formatPrezzo(totaleCents)} (IVA inclusa)\n\nCompleta il pagamento in sicurezza da questa pagina:\n\n${siteUrl}/ordine/${ordine.token}\n\n${noteLegaliEmail(siteUrl)}\n\nA presto,\nAnna Shop di Borracci Anna — ${NEGOZIO.indirizzoCompleto}`,
      });
      if (!inviata) {
        return {
          ok: true,
          avviso:
            "Ordine confermato, ma l'email al cliente NON è partita: contattalo direttamente con il link di pagamento (Copia link).",
        };
      }
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Errore di rete. Riprova." };
  }
}

/** Rifiuta/annulla l'ordine. Non si annulla un ordine gia pagato. */
export async function annullaOrdineAction(id: string): Promise<EsitoOrdine> {
  const esito = await aggiornaStato(id, { stato: "annullato" }, [
    "in_attesa",
    "confermato",
  ]);
  if (!esito.ok) return esito;
  // Ordine annullato: se c'era una sessione di pagamento aperta, falla scadere
  // cosi il cliente non puo piu pagarla (e il webhook non lo resuscita a pagato).
  await scadiSessioneOrdine(id);

  // Cortesia (best effort): la conferma di ricezione promette al cliente una
  // risposta — senza questa email resterebbe in attesa per sempre. Solo se
  // abbiamo un'email (i checkout diretti abbandonati non ne hanno).
  try {
    const admin = createAdminSupabase();
    const { data } = await admin
      .from("ordini")
      .select("email, nome")
      .eq("id", id)
      .maybeSingle();
    if (data?.email) {
      const inviata = await inviaEmail({
        to: data.email,
        subject: "La tua richiesta — Anna Shop",
        text: `Ciao ${data.nome ?? ""},\n\ngrazie per la tua richiesta. Purtroppo questa volta non possiamo darle seguito: gli articoli richiesti non sono disponibili.\n\nSe vuoi, rispondi a questa email o passa a trovarci in negozio: troviamo un'alternativa insieme.\n\nA presto,\nAnna Shop di Borracci Anna — ${NEGOZIO.indirizzoCompleto}`,
      });
      if (!inviata) {
        return {
          ok: true,
          avviso:
            "Richiesta rifiutata, ma l'email di cortesia al cliente NON è partita: se serve, avvisalo direttamente.",
        };
      }
    }
  } catch {
    // Best effort: il rifiuto e comunque andato a buon fine.
  }
  return esito;
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

    // Pagato in negozio: fai scadere l'eventuale sessione Stripe aperta, cosi il
    // cliente non completa anche il pagamento online (doppio incasso).
    await scadiSessioneOrdine(id);

    // Deficit fotografato dalla RPC nella stessa transazione del decremento:
    // a differenza del percorso Stripe qui NESSUNA email di avviso parte
    // (l'email oversell vive solo nel webhook), quindi il pannello e' l'unico
    // posto dove la titolare puo' accorgersene. Rilettura best effort: se
    // fallisce il pagato resta valido, solo senza avviso immediato.
    let stockMancante: VoceStockMancante[] | undefined;
    try {
      const { data } = await admin
        .from("ordini")
        .select("stock_mancante")
        .eq("id", id)
        .maybeSingle();
      const grezzo = data?.stock_mancante;
      if (Array.isArray(grezzo) && grezzo.length > 0) {
        stockMancante = grezzo as unknown as VoceStockMancante[];
      }
    } catch {
      // Best effort: il badge comparira' comunque alla prossima apertura.
    }

    revalidatePath("/gestore/ordini");
    if (stockMancante) {
      return {
        ok: true,
        stockMancante,
        avviso:
          "Segnato pagato, ma la giacenza non copre l'ordine: vedi il dettaglio in rosso sulla card e verifica in negozio.",
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Errore di rete. Riprova." };
  }
}
