import "server-only";

// Query del catalogo pubblico (vetrina): prodotti filtrati/ordinati e facette
// (taglie/colori/range prezzo disponibili) per la toolbar filtri.
// Condiviso da home e pagine categoria. Filtri e ordinamento si applicano
// lato DB cosi la vetrina regge anche con molti prodotti.

import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  FACETTE_VUOTE,
  type FacetteCatalogo,
  type FiltriCatalogo,
} from "@/lib/filtri-catalogo";
import type { Prodotto } from "@/lib/types";
import { COLORI, ordinaTaglie } from "@/lib/catalogo";
import {
  VERSIONE_FRANCHISE,
  contaFranchise,
  paroleFranchise,
} from "@/lib/franchise";

type Supabase = SupabaseClient<Database>;

/** Prodotti per "pagina" della griglia (il bottone Mostra altri ne carica altrettanti). */
export const PRODOTTI_PER_PAGINA = 24;

/** Campi letti per le card della vetrina (condivisi con la home a fasce). */
export const CAMPI_CARD =
  "id, slug, nome, descrizione, prezzo_cents, valuta, immagine_url, attivo, solo_online, categoria_id";

/**
 * Prodotti di esempio usati SOLO quando Supabase non e configurato
 * (build/anteprima senza env): la vetrina rende comunque. Con DB connesso non
 * si mostrano mai prodotti finti. (Spostati qui dalla home: servono anche alle
 * pagine categoria.)
 */
export const PRODOTTI_ESEMPIO: Prodotto[] = [
  {
    id: "esempio-1",
    slug: "t-shirt-essenziale-bianca",
    nome: "T-shirt essenziale bianca",
    descrizione: "Cotone pettinato, vestibilita regolare.",
    prezzo_cents: 2900,
    valuta: "EUR",
    immagine_url: null,
    attivo: true,
  },
  {
    id: "esempio-2",
    slug: "felpa-girocollo-sabbia",
    nome: "Felpa girocollo sabbia",
    descrizione: "Spugna pesante, taglio rilassato.",
    prezzo_cents: 7900,
    valuta: "EUR",
    immagine_url: null,
    attivo: true,
  },
  {
    id: "esempio-3",
    slug: "pantalone-cargo-nero",
    nome: "Pantalone cargo nero",
    descrizione: "Tela di cotone, tasche laterali.",
    prezzo_cents: 9900,
    valuta: "EUR",
    immagine_url: null,
    attivo: true,
  },
  {
    id: "esempio-4",
    slug: "camicia-overshirt-verde",
    nome: "Overshirt verde militare",
    descrizione: "Doppio uso camicia-giacca.",
    prezzo_cents: 11900,
    valuta: "EUR",
    immagine_url: null,
    attivo: true,
  },
];

export interface EsitoCatalogo {
  prodotti: Prodotto[];
  /** Totale dei prodotti che rispettano i filtri (oltre la pagina corrente). */
  totale: number;
}

/**
 * Ricerca testuale: il pattern finisce dentro un'espressione `or=(...)` di
 * PostgREST, dove virgole/parentesi sono sintassi e %/_ sono jolly ilike.
 * Si neutralizza tutto: la ricerca resta letterale e prevedibile.
 */
function patternRicerca(q: string): string {
  return q.replace(/[,()%_\\]/g, " ").trim();
}

/**
 * Carica i prodotti attivi che rispettano filtri e (opzionale) categoria,
 * ordinati e paginati. `categoriaIds` va gia espanso ai discendenti (vedi
 * idConDiscendenti). Con Supabase non configurato ritorna i dati di esempio;
 * su errore degrada a vuoto (mai prodotti finti con DB connesso).
 */
export async function caricaProdottiVetrina(
  supabase: Supabase | null,
  opzioni: {
    filtri: FiltriCatalogo;
    categoriaIds?: string[];
    pagina?: number;
  },
): Promise<EsitoCatalogo> {
  if (!supabase) {
    return { prodotti: PRODOTTI_ESEMPIO, totale: PRODOTTI_ESEMPIO.length };
  }

  const { filtri, categoriaIds, pagina = 1 } = opzioni;

  try {
    // Il join sulle varianti serve solo quando si filtra per taglia/colore:
    // `!inner` esclude i prodotti senza una variante che soddisfi ENTRAMBI i
    // vincoli (es. "esiste una variante Blu in M"). PostgREST embedda le
    // varianti come array: nessuna duplicazione delle righe prodotto.
    const filtraVarianti = filtri.taglie.length > 0 || filtri.colori.length > 0;
    const campi = filtraVarianti
      ? `${CAMPI_CARD}, varianti!inner(taglia, colore)`
      : CAMPI_CARD;

    let query = supabase
      .from("prodotti")
      .select(campi, { count: "exact" })
      .eq("attivo", true);

    if (categoriaIds && categoriaIds.length > 0) {
      query = query.in("categoria_id", categoriaIds);
    }
    if (filtri.taglie.length > 0) {
      query = query.in("varianti.taglia", filtri.taglie);
    }
    if (filtri.colori.length > 0) {
      query = query.in("varianti.colore", filtri.colori);
    }
    if (filtri.prezzoMin != null) {
      query = query.gte("prezzo_cents", filtri.prezzoMin * 100);
    }
    if (filtri.prezzoMax != null) {
      query = query.lte("prezzo_cents", filtri.prezzoMax * 100);
    }
    if (filtri.q) {
      // Multi-parola: ogni token deve comparire (AND tra i token, chiamate .or()
      // consecutive = AND) nel nome OPPURE nella descrizione. Cosi "squid game
      // logo" trova i prodotti con tutte le parole in qualsiasi ordine, non la
      // stringa esatta. Cap a 6 token: oltre e rumore e allunga la query.
      const token = patternRicerca(filtri.q)
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 6);
      for (const t of token) {
        query = query.or(`nome.ilike.%${t}%,descrizione.ilike.%${t}%`);
      }
    }

    // Filtro per FRANCHISE: le parole-chiave del franchise diventano un OR ilike
    // sul nome (le stesse usate per contarli, cosi il numero del chip torna).
    if (filtri.franchise) {
      const parole = (paroleFranchise(filtri.franchise) ?? [])
        .map((p) => patternRicerca(p))
        .filter(Boolean);
      if (parole.length > 0) {
        query = query.or(parole.map((p) => `nome.ilike.%${p}%`).join(","));
      }
    }

    switch (filtri.ordina) {
      case "prezzo-asc":
        query = query.order("prezzo_cents", { ascending: true });
        break;
      case "prezzo-desc":
        query = query.order("prezzo_cents", { ascending: false });
        break;
      case "nome":
        query = query.order("nome", { ascending: true });
        break;
      default:
        query = query.order("creato_il", { ascending: false });
    }
    // Tie-break stabile (prezzi/nomi uguali) per una paginazione coerente.
    query = query.order("id", { ascending: true });

    const { data, error, count } = await query.range(
      0,
      pagina * PRODOTTI_PER_PAGINA - 1,
    );

    if (error) return { prodotti: [], totale: 0 };
    return {
      prodotti: (data as unknown as Prodotto[] | null) ?? [],
      totale: count ?? 0,
    };
  } catch {
    return { prodotti: [], totale: 0 };
  }
}

/** Posizione di un colore nella palette (gli ignoti in coda, alfabetici). */
const ORDINE_COLORE = new Map(COLORI.map((c, i) => [c.nome, i]));

function ordinaColori(colori: Iterable<string>): string[] {
  return [...new Set(colori)].sort((a, b) => {
    const ia = ORDINE_COLORE.get(a) ?? Number.MAX_SAFE_INTEGER;
    const ib = ORDINE_COLORE.get(b) ?? Number.MAX_SAFE_INTEGER;
    return ia - ib || a.localeCompare(b, "it");
  });
}

/** Tag per invalidare a mano la cache delle facette (revalidateTag). */
export const TAG_FACETTE_VETRINA = "facette-vetrina";

/** Durata cache facette: cambiano di rado (nuovi prodotti/varianti). */
const FACETTE_REVALIDATE_S = 300;

/**
 * Aggregazione facette vera e propria. Isolata perche gira DENTRO unstable_cache:
 * non puo ricevere il client Supabase (non serializzabile) ne leggere i cookie,
 * quindi si crea qui un client COOKIELESS (service role, cookieless). Legge solo
 * dati pubblici del catalogo attivo (prezzo + varianti), coerenti con l'anon.
 */
async function aggregaFacette(
  categoriaIds: string[],
): Promise<FacetteCatalogo> {
  // Senza service role key non possiamo creare il client cookieless: degrada
  // a facette vuote invece di lanciare (come il resto della vetrina).
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return FACETTE_VUOTE;

  try {
    const supabase = createAdminSupabase();
    let query = supabase
      .from("prodotti")
      .select("nome, prezzo_cents, varianti(taglia, colore)")
      .eq("attivo", true);
    if (categoriaIds.length > 0) {
      query = query.in("categoria_id", categoriaIds);
    }

    const { data, error } = await query;
    if (error || !data) return FACETTE_VUOTE;

    const taglie = new Set<string>();
    const colori = new Set<string>();
    const nomi: string[] = [];
    let min: number | null = null;
    let max: number | null = null;

    for (const riga of data as unknown as Array<{
      nome: string;
      prezzo_cents: number;
      varianti: Array<{ taglia: string | null; colore: string | null }> | null;
    }>) {
      nomi.push(riga.nome);
      min = min == null ? riga.prezzo_cents : Math.min(min, riga.prezzo_cents);
      max = max == null ? riga.prezzo_cents : Math.max(max, riga.prezzo_cents);
      for (const v of riga.varianti ?? []) {
        if (v.taglia) taglie.add(v.taglia);
        if (v.colore) colori.add(v.colore);
      }
    }

    return {
      taglie: ordinaTaglie(taglie),
      colori: ordinaColori(colori),
      prezzoMinCents: min,
      prezzoMaxCents: max,
      franchise: contaFranchise(nomi),
    };
  } catch {
    return FACETTE_VUOTE;
  }
}

/**
 * Facette per la toolbar filtri: quali taglie/colori esistono davvero nel
 * catalogo attivo (opzionalmente ristretto a una categoria) e il range prezzi.
 * Volutamente NON dipende dai filtri correnti: le opzioni restano stabili
 * mentre l'utente compone la selezione.
 *
 * Le pagine vetrina sono force-dynamic, ma le facette dipendono solo dalla
 * categoria: si cachano con unstable_cache (revalidate breve + tag) cosi il
 * full-scan prodotti+varianti non gira a ogni richiesta. L'aggregazione usa un
 * client cookieless creato internamente (unstable_cache non accetta il client
 * Supabase). L'argomento `supabase` resta solo come guardia "env configurate":
 * se e null (env Supabase assenti) non si cacha nulla e si torna vuoto.
 */
export async function caricaFacetteVetrina(
  supabase: Supabase | null,
  categoriaIds?: string[],
): Promise<FacetteCatalogo> {
  if (!supabase) return FACETTE_VUOTE;

  // Chiave stabile per categoria: ordinata cosi ordini diversi degli stessi id
  // condividono la stessa entry di cache. "tutte" = catalogo intero (home).
  const ids = categoriaIds && categoriaIds.length > 0 ? [...categoriaIds].sort() : [];
  const chiave = ids.length > 0 ? ids.join(",") : "tutte";

  const cached = unstable_cache(
    () => aggregaFacette(ids),
    ["facette-vetrina", chiave, String(VERSIONE_FRANCHISE)],
    { revalidate: FACETTE_REVALIDATE_S, tags: [TAG_FACETTE_VETRINA] },
  );

  return cached();
}
