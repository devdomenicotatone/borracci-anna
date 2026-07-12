"use server";

// Server Actions della pagina "Prezzi" del gestore: caricamento dei prodotti
// per gruppi di categorie e applicazione in blocco di una regola di aumento/
// riduzione. Stesso pattern obbligatorio di lib/gestore/actions.ts:
//   1) verifySession() -> early-return se non gestore;
//   2) mutazione via anon key + sessione + RLS, in try/catch;
//   3) revalidation centralizzata (revalidaProdotto) a fine corsa.

import { verifySession } from "@/lib/gestore/auth";
import { revalidaProdotto } from "@/lib/gestore/revalida";
import { caricaCategorie } from "@/lib/categorie";
import { idConDiscendenti } from "@/lib/categorie-albero";
import { leggiTutteLeRighe } from "@/lib/supabase/scansione";
import {
  calcolaNuovoPrezzoCents,
  validaRegolaPrezzi,
  type RegolaPrezzi,
} from "@/lib/prezzi-regola";

/** Blocchi per le operazioni con .in(): come BLOCCO_BULK di actions.ts. */
const BLOCCO = 200;
function aBlocchi<T>(arr: T[], dim: number): T[][] {
  const blocchi: T[][] = [];
  for (let i = 0; i < arr.length; i += dim) blocchi.push(arr.slice(i, i + dim));
  return blocchi;
}

/** Riga prodotto per la pagina Prezzi: il minimo per anteprima e selezione. */
export interface ProdottoPrezzi {
  id: string;
  nome: string;
  prezzo_cents: number;
  valuta: string;
  immagine_url: string | null;
  attivo: boolean;
  categoria_id: string | null;
}

/**
 * Tutti i prodotti delle categorie indicate (discendenti INCLUSE: scegliere
 * "T-shirt" copre anche Gaming/Calcio/..., stessa semantica dei filtri).
 * Lettura integrale a blocchi: il catalogo supera le 1000 righe e PostgREST
 * tronca in silenzio — una lista parziale qui significherebbe ritocchi di
 * prezzo che saltano prodotti senza dirlo.
 */
export async function prodottiPerCategorieAction(
  categorieIds: string[],
): Promise<{ ok: boolean; prodotti?: ProdottoPrezzi[]; error?: string }> {
  const sessione = await verifySession();
  if (!sessione) return { ok: false, error: "Non autorizzato." };

  const richieste = [...new Set(categorieIds)].filter(Boolean);
  if (richieste.length === 0) {
    return { ok: false, error: "Scegli almeno una categoria." };
  }

  try {
    // Espansione ai discendenti SERVER-side sull'albero appena letto: non ci
    // si fida dell'espansione del client (lista stantia se le categorie sono
    // cambiate in un'altra scheda).
    const categorie = await caricaCategorie(sessione.supabase);
    const espansi = new Set<string>();
    for (const id of richieste) {
      for (const d of idConDiscendenti(categorie, id)) espansi.add(d);
    }

    const prodotti = await leggiTutteLeRighe<ProdottoPrezzi>((conteggio) =>
      sessione.supabase
        .from("prodotti")
        .select(
          "id, nome, prezzo_cents, valuta, immagine_url, attivo, categoria_id",
          conteggio ? { count: "exact" } : undefined,
        )
        .in("categoria_id", [...espansi])
        // Ordine stabile e univoco per la scansione a blocchi (nome si ripete).
        .order("nome", { ascending: true })
        .order("id", { ascending: true }),
    );
    return { ok: true, prodotti };
  } catch {
    return { ok: false, error: "Errore di rete. Riprova." };
  }
}

/**
 * Applica la regola di prezzo ai prodotti indicati. I prezzi si RILEGGONO dal
 * DB qui (mai fidarsi dei valori mostrati al client: potrebbero essere
 * stantii) e si ricalcolano con la stessa formula pura dell'anteprima.
 * UPDATE raggruppati per nuovo prezzo: i listini reali hanno pochi prezzi
 * distinti, quindi decine di UPDATE al massimo, non uno per prodotto.
 * Ritorna quanti prodotti sono stati aggiornati e quanti SALTATI perche il
 * risultato uscirebbe dai limiti (es. sotto i 50 cent minimi di Stripe).
 */
export async function modificaPrezziBulkAction(
  ids: string[],
  regola: RegolaPrezzi,
): Promise<{ ok: boolean; error?: string; aggiornati?: number; saltati?: number }> {
  const sessione = await verifySession();
  if (!sessione) return { ok: false, error: "Non autorizzato." };

  const erroreRegola = validaRegolaPrezzi(regola);
  if (erroreRegola) return { ok: false, error: erroreRegola };

  const unici = [...new Set(ids)].filter(Boolean);
  if (unici.length === 0) {
    return { ok: false, error: "Nessun prodotto selezionato." };
  }

  try {
    // Prezzi attuali dal DB, a blocchi (migliaia di id non stanno in un .in()).
    const attuali: { id: string; prezzo_cents: number }[] = [];
    for (const blocco of aBlocchi(unici, BLOCCO)) {
      const { data, error } = await sessione.supabase
        .from("prodotti")
        .select("id, prezzo_cents")
        .in("id", blocco);
      if (error) {
        console.error("[modificaPrezziBulkAction] lettura:", error.code ?? "", error.message);
        return { ok: false, error: "Lettura dei prezzi non riuscita. Riprova." };
      }
      attuali.push(...((data as { id: string; prezzo_cents: number }[]) ?? []));
    }

    // Nuovo prezzo per prodotto, raggruppato per valore: un UPDATE per prezzo.
    const perNuovoPrezzo = new Map<number, string[]>();
    let saltati = 0;
    for (const p of attuali) {
      const nuovo = calcolaNuovoPrezzoCents(p.prezzo_cents, regola);
      if (nuovo == null) {
        saltati++;
        continue;
      }
      if (nuovo === p.prezzo_cents) continue; // gia a posto: niente UPDATE
      const gruppo = perNuovoPrezzo.get(nuovo);
      if (gruppo) gruppo.push(p.id);
      else perNuovoPrezzo.set(nuovo, [p.id]);
    }

    let aggiornati = 0;
    for (const [nuovoPrezzo, idsGruppo] of perNuovoPrezzo) {
      for (const blocco of aBlocchi(idsGruppo, BLOCCO)) {
        const { data, error } = await sessione.supabase
          .from("prodotti")
          .update({ prezzo_cents: nuovoPrezzo })
          .in("id", blocco)
          .select("id");
        if (error) {
          console.error("[modificaPrezziBulkAction] update:", error.code ?? "", error.message);
          // Aggiornamento parziale: si dice chiaramente cosa e successo, il
          // gestore ricarica e vede i prezzi reali riga per riga.
          return {
            ok: false,
            error: `Aggiornamento interrotto a metà (${aggiornati} prodotti già modificati). Ricarica i prodotti e riprova.`,
          };
        }
        aggiornati += data?.length ?? 0;
      }
    }

    revalidaProdotto();
    return { ok: true, aggiornati, saltati };
  } catch {
    return { ok: false, error: "Errore di rete. Riprova." };
  }
}
