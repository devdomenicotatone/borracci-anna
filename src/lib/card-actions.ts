"use server";

// Server Actions a supporto delle card della vetrina (preferiti e quick add).
// Endpoint PUBBLICI richiamati dal client: input sempre validato/cappato, in
// lettura passano dal client anon (RLS: solo catalogo attivo). variantiCard
// degrada a vuoto (il quick add non deve rompere la card); prodottiPerId
// invece distingue l'errore dal "non trovato", perche il client deve poter
// mostrare il Riprova invece del falso stato vuoto.

import { createServerSupabase } from "@/lib/supabase/server";
import { CAMPI_CARD, normalizzaCard, type RigaCard } from "@/lib/vetrina";
import type { Prodotto, Variante } from "@/lib/types";

/** Tetto agli id per richiesta (la pagina preferiti non ne mostra di piu). */
const MAX_ID_PREFERITI = 200;
/** Blocchi dell'IN: centinaia di id gonfiano l'URL PostgREST (pattern vetrina). */
const BLOCCO_IN = 100;

/** Esito di prodottiPerId: ok:false = errore lato server (da ritentare),
 *  ok:true con array vuoto/parziale = id non trovati nel catalogo attivo.
 *  Niente dettagli interni: al client basta la distinzione. */
export type EsitoProdottiPerId =
  | { ok: true; prodotti: Prodotto[] }
  | { ok: false };

/**
 * Prodotti (campi card) per la pagina /preferiti, dagli id salvati sul
 * dispositivo. Ritorna solo i prodotti ATTIVI, nell'ordine degli id richiesti:
 * gli id spariti dal catalogo vengono semplicemente omessi (ok:true).
 * Su errore del server (client Supabase assente, errore PostgREST, eccezione)
 * ritorna ok:false: gli id NON vanno considerati assenti dal catalogo.
 */
export async function prodottiPerId(ids: string[]): Promise<EsitoProdottiPerId> {
  if (!Array.isArray(ids)) return { ok: true, prodotti: [] };
  const puliti = [
    ...new Set(
      ids.filter((x) => typeof x === "string" && x.length > 0 && x.length <= 64),
    ),
  ].slice(0, MAX_ID_PREFERITI);
  if (puliti.length === 0) return { ok: true, prodotti: [] };

  try {
    const supabase = await createServerSupabase();
    if (!supabase) return { ok: false };

    const blocchi: string[][] = [];
    for (let i = 0; i < puliti.length; i += BLOCCO_IN) {
      blocchi.push(puliti.slice(i, i + BLOCCO_IN));
    }
    const esiti = await Promise.all(
      blocchi.map((b) =>
        supabase
          .from("prodotti")
          .select(CAMPI_CARD)
          .eq("attivo", true)
          .in("id", b),
      ),
    );
    // Basta un blocco fallito e l'insieme non e piu attendibile: meglio un
    // Riprova che marcare "spariti" id di un blocco solo errato.
    if (esiti.some((e) => e.error)) return { ok: false };

    // L'IN non conserva l'ordine: si riassembla su quello richiesto (che e
    // l'ordine di salvataggio: piu recente per primo).
    const perId = new Map(
      esiti
        .flatMap((e) => (e.data as unknown as RigaCard[] | null) ?? [])
        .map((p) => [p.id, normalizzaCard(p)]),
    );
    return {
      ok: true,
      prodotti: puliti
        .map((id) => perId.get(id))
        .filter((p): p is Prodotto => p != null),
    };
  } catch {
    return { ok: false };
  }
}

/**
 * Varianti (taglia/colore/stock) di un prodotto, per il pannello quick add
 * delle card. Caricate SOLO alla prima apertura del pannello: le giacenze
 * devono essere fresche, quindi niente cache.
 */
export async function variantiCard(prodottoId: string): Promise<Variante[]> {
  if (typeof prodottoId !== "string" || !prodottoId || prodottoId.length > 64) {
    return [];
  }

  try {
    const supabase = await createServerSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("varianti")
      .select("id, prodotto_id, taglia, colore, sku, stock")
      .eq("prodotto_id", prodottoId);
    if (error || !data) return [];
    return data as unknown as Variante[];
  } catch {
    return [];
  }
}
