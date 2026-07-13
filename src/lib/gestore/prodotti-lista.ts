import "server-only";

// Data layer della lista prodotti del GESTORE: ricerca, filtri, ordinamento,
// paginazione e conteggi, tutti calcolati a Postgres (RPC). Sostituisce il
// vecchio "carica tutto e filtra nel browser". Gemello server-side di
// lib/vetrina.ts (catalogo pubblico), ma per il pannello.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Categoria } from "@/lib/types";
import type { ConteggiCategorie, FiltriGestore } from "@/lib/filtri-gestore";
import { idConDiscendenti } from "@/lib/categorie-albero";
import { BLOCCO_SCANSIONE, scansionaBlocchi } from "@/lib/supabase/scansione";
import type { ProdottoLista } from "@/components/gestore/ListaProdotti";

/** Prodotti per "pagina" della lista (il "Mostra altri" ne aggiunge altrettanti). */
export const PRODOTTI_PER_PAGINA_GESTORE = 50;

export interface EsitoListaGestore {
  prodotti: ProdottoLista[];
  /** Totale dei prodotti che rispettano i filtri (oltre la pagina corrente). */
  totale: number;
  /** true se la RPC ha fallito: distingue un errore transitorio (Supabase giu)
   *  dal catalogo davvero vuoto, cosi la UI non mostra "Crea il primo prodotto". */
  errore?: boolean;
}

/** Riga grezza ritornata da cerca_prodotti_gestore. */
interface RigaRpc {
  id: string;
  slug: string;
  nome: string;
  prezzo_cents: number;
  valuta: string;
  immagine_url: string | null;
  attivo: boolean;
  disponibilita_su_richiesta: boolean;
  categoria_id: string | null;
  num_varianti: number;
  stock_totale: number;
  totale: number;
}

/**
 * Traduce i filtri UI negli argomenti categoria della RPC. Il filtro per una
 * macro deve includere le sue discendenti (stessa semantica della vetrina):
 * l'espansione avviene qui, riusando idConDiscendenti sull'albero gia caricato.
 */
function argomentiCategoria(
  filtri: FiltriGestore,
  categorie: Categoria[],
): { p_categorie: string[] | null; p_senza_categoria: boolean } {
  if (filtri.categoria === "none") {
    return { p_categorie: null, p_senza_categoria: true };
  }
  if (filtri.categoria) {
    return {
      p_categorie: idConDiscendenti(categorie, filtri.categoria),
      p_senza_categoria: false,
    };
  }
  return { p_categorie: null, p_senza_categoria: false };
}

/**
 * Una pagina di prodotti del gestore che rispettano i filtri, con gli aggregati
 * (num varianti, stock totale) e il totale dei match. Su errore RPC ritorna
 * lista vuota ma con `errore: true`, cosi la UI lo distingue dal catalogo vuoto.
 * Il client Supabase e quello di sessione (RLS: il gestore vede anche i
 * nascosti).
 *
 * `soloPagina`: ritorna SOLO le righe della pagina `pagina` (il DELTA per
 * l'append client dello scroll infinito, vedi lib/gestore/prodotti-lista-actions),
 * invece del cumulato 1..pagina che serve al percorso URL ?pagina=N. Stessi
 * filtri e stesso ordinamento (tie-break su id nella RPC): le righe coincidono
 * con quelle che il cumulato metterebbe in quella posizione. Una pagina e al
 * massimo PRODOTTI_PER_PAGINA_GESTORE righe, ben sotto il max-rows di PostgREST:
 * basta una chiamata sola con p_offset, senza la scansione a blocchi.
 */
export async function caricaProdottiGestore(
  supabase: SupabaseClient,
  opzioni: {
    filtri: FiltriGestore;
    pagina: number;
    categorie: Categoria[];
    /** true = solo le righe della pagina richiesta (delta), non il cumulato. */
    soloPagina?: boolean;
  },
): Promise<EsitoListaGestore> {
  const { filtri, pagina, categorie, soloPagina = false } = opzioni;
  const cat = argomentiCategoria(filtri, categorie);
  const argomenti = {
    p_q: filtri.q,
    p_stato: filtri.stato,
    p_ordina: filtri.ordina,
    ...cat,
  };

  const righe: RigaRpc[] = [];
  if (soloPagina) {
    // Delta: l'offset lo applica la RPC, la risposta resta sotto max-rows.
    const { data, error } = await supabase.rpc("cerca_prodotti_gestore", {
      ...argomenti,
      p_offset: (pagina - 1) * PRODOTTI_PER_PAGINA_GESTORE,
      p_limit: PRODOTTI_PER_PAGINA_GESTORE,
    });
    if (error) return { prodotti: [], totale: 0, errore: true };
    righe.push(...((data as RigaRpc[] | null) ?? []));
  } else {
    // Cumulato (?pagina=N): la RPC applica offset/limit e restituisce il totale
    // (window count) su ogni riga, ma PostgREST tronca comunque la RISPOSTA a
    // max-rows (1000): oltre la pagina 20 il "Mostra altri" resterebbe fermo e
    // lo scroll infinito continuerebbe a chiedere righe che non arrivano mai.
    // Leggiamo l'output della RPC a blocchi (l'ordinamento della funzione ha il
    // tie-break su id, stabile).
    const limite = pagina * PRODOTTI_PER_PAGINA_GESTORE;
    for (let da = 0; da < limite; da += BLOCCO_SCANSIONE) {
      const a = Math.min(da + BLOCCO_SCANSIONE, limite) - 1;
      const { data, error } = await supabase
        .rpc("cerca_prodotti_gestore", { ...argomenti, p_offset: 0, p_limit: limite })
        .range(da, a);
      if (error) return { prodotti: [], totale: 0, errore: true };
      const blocco = (data as RigaRpc[] | null) ?? [];
      righe.push(...blocco);
      if (blocco.length < a - da + 1) break; // blocco corto = match esauriti
    }
  }

  const prodotti: ProdottoLista[] = righe.map((p) => ({
    id: p.id,
    slug: p.slug,
    nome: p.nome,
    prezzo_cents: p.prezzo_cents,
    valuta: p.valuta,
    immagine_url: p.immagine_url,
    attivo: p.attivo,
    suRichiesta: p.disponibilita_su_richiesta,
    categoriaId: p.categoria_id,
    numVarianti: p.num_varianti,
    stockTotale: p.stock_totale,
  }));

  // Il totale viaggia su ogni riga (window count): 0 righe = 0 match. NB: nel
  // delta una pagina oltre la fine torna 0 righe e quindi totale 0 — il client
  // la tratta come fine lista, senza fidarsi di quel totale.
  const totale = righe.length > 0 ? Number(righe[0].totale) : 0;
  return { prodotti, totale };
}

/**
 * Conteggi prodotti per categoria (intero catalogo del gestore), per i numeri
 * del menu a tendina. Indipendenti dai filtri correnti: restano stabili mentre
 * l'utente compone la selezione. Degrada a conteggi vuoti su errore.
 */
export async function caricaConteggiCategorieGestore(
  supabase: SupabaseClient,
): Promise<ConteggiCategorie> {
  const { data, error } = await supabase.rpc("conteggi_categorie_gestore");
  const perCategoria: Record<string, number> = {};
  let senza = 0;
  if (!error && data) {
    for (const r of data as { categoria_id: string | null; n: number }[]) {
      if (r.categoria_id) perCategoria[r.categoria_id] = Number(r.n);
      else senza = Number(r.n);
    }
  }
  return { perCategoria, senza };
}

/**
 * SOLO gli id dei prodotti che rispettano i filtri (senza paginazione), per il
 * "Seleziona tutti i N" quando i match superano la pagina caricata. Degrada a []
 * su errore.
 */
export async function idsProdottiGestore(
  supabase: SupabaseClient,
  opzioni: { filtri: FiltriGestore; categorie: Categoria[] },
): Promise<string[]> {
  const { filtri, categorie } = opzioni;
  const cat = argomentiCategoria(filtri, categorie);

  // Scansione a blocchi dell'output della RPC: anche una funzione che ritorna un
  // SET subisce il max-rows di PostgREST, quindi con ~1840 prodotti "Seleziona
  // tutti i N" riceverebbe solo i primi 1000 id e le azioni in blocco (elimina,
  // assegna categoria) lascerebbero fuori il resto in silenzio. Ordine per id
  // (stabile) e count del primo blocco come guida.
  try {
    const { righe } = await scansionaBlocchi<{ id: string }>((conteggio) =>
      supabase
        .rpc(
          "ids_prodotti_gestore",
          { p_q: filtri.q, p_stato: filtri.stato, ...cat },
          conteggio ? { count: "exact" } : undefined,
        )
        .order("id", { ascending: true }),
    );
    return righe.map((r) => r.id);
  } catch {
    return [];
  }
}
