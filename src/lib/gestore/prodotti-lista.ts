import "server-only";

// Data layer della lista prodotti del GESTORE: ricerca, filtri, ordinamento,
// paginazione e conteggi, tutti calcolati a Postgres (RPC). Sostituisce il
// vecchio "carica tutto e filtra nel browser". Gemello server-side di
// lib/vetrina.ts (catalogo pubblico), ma per il pannello.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Categoria } from "@/lib/types";
import type { ConteggiCategorie, FiltriGestore } from "@/lib/filtri-gestore";
import { idConDiscendenti } from "@/lib/categorie-albero";
import type { ProdottoLista } from "@/components/gestore/ListaProdotti";

/** Prodotti per "pagina" della lista (il "Mostra altri" ne aggiunge altrettanti). */
export const PRODOTTI_PER_PAGINA_GESTORE = 50;

export interface EsitoListaGestore {
  prodotti: ProdottoLista[];
  /** Totale dei prodotti che rispettano i filtri (oltre la pagina corrente). */
  totale: number;
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
 * (num varianti, stock totale) e il totale dei match. Modello "Mostra altri"
 * cumulativo: offset 0, limit crescente (come la vetrina). Degrada a vuoto su
 * errore. Il client Supabase e quello di sessione (RLS: il gestore vede anche i
 * nascosti).
 */
export async function caricaProdottiGestore(
  supabase: SupabaseClient,
  opzioni: { filtri: FiltriGestore; pagina: number; categorie: Categoria[] },
): Promise<EsitoListaGestore> {
  const { filtri, pagina, categorie } = opzioni;
  const cat = argomentiCategoria(filtri, categorie);

  const { data, error } = await supabase.rpc("cerca_prodotti_gestore", {
    p_q: filtri.q,
    p_stato: filtri.stato,
    p_ordina: filtri.ordina,
    p_offset: 0,
    p_limit: pagina * PRODOTTI_PER_PAGINA_GESTORE,
    ...cat,
  });

  if (error || !data) return { prodotti: [], totale: 0 };
  const righe = data as RigaRpc[];

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

  // Il totale viaggia su ogni riga (window count): 0 righe = 0 match.
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

  const { data, error } = await supabase.rpc("ids_prodotti_gestore", {
    p_q: filtri.q,
    p_stato: filtri.stato,
    ...cat,
  });

  if (error || !data) return [];
  return (data as { id: string }[]).map((r) => r.id);
}
