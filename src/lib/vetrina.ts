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
import { scansionaBlocchi } from "@/lib/supabase/scansione";
import { COLORI, ordinaTaglie } from "@/lib/catalogo";
import {
  VERSIONE_FRANCHISE,
  appartieneAlChip,
  contaFranchise,
  etichettaFranchise,
} from "@/lib/franchise";

type Supabase = SupabaseClient<Database>;

/** Prodotti per "pagina" della griglia (il bottone Mostra altri ne carica altrettanti). */
export const PRODOTTI_PER_PAGINA = 24;

/** Campi letti per le card della vetrina (condivisi con la home a fasce).
 *  L'embed `prodotto_foto(url, ordine)` alimenta il mini-carosello delle card:
 *  le righe grezze vanno appiattite con {@link normalizzaCard}. */
export const CAMPI_CARD =
  "id, slug, nome, descrizione, prezzo_cents, valuta, immagine_url, attivo, solo_online, categoria_id, disponibilita_su_richiesta, stock_totale, prodotto_foto(url, ordine)";

/** Riga card grezza: l'embed foto e ancora da appiattire in `foto_urls`. */
export type RigaCard = Prodotto & {
  prodotto_foto?: Array<{ url: string; ordine: number }> | null;
};

/** Cap foto per card: oltre le prime il carosello in griglia non aggiunge nulla. */
const MAX_FOTO_CARD = 8;

/** Appiattisce l'embed foto di una riga card in `Prodotto.foto_urls` (ordinate). */
export function normalizzaCard(riga: RigaCard): Prodotto {
  const { prodotto_foto, ...prodotto } = riga;
  return {
    ...prodotto,
    foto_urls: (prodotto_foto ?? [])
      .slice()
      .sort((a, b) => a.ordine - b.ordine)
      .slice(0, MAX_FOTO_CARD)
      .map((f) => f.url),
  };
}

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
 *
 * Filtro per TEMA (franchise): NON si applica lato DB. Il conteggio dei chip
 * assegna ogni prodotto a UN solo tema (primo match del dizionario), quindi il
 * filtro usa la stessa funzione (appartieneAlChip) su una scansione leggera
 * `id, nome` gia filtrata/ordinata dal DB; le card della pagina si caricano
 * poi per id. Cosi il numero sul chip e ESATTAMENTE quanti prodotti appaiono
 * cliccandolo — incluso il chip "Altro", complemento dei chip visibili.
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
    // Percorso tema attivo solo per slug noti ("altro" incluso): uno slug
    // ignoto (link vecchio/manomesso) si ignora, come faceva il vecchio filtro.
    const perTema =
      filtri.franchise !== "" && etichettaFranchise(filtri.franchise) != null;

    // Il join sulle varianti serve solo quando si filtra per taglia/colore:
    // `!inner` esclude i prodotti senza una variante che soddisfi ENTRAMBI i
    // vincoli (es. "esiste una variante Blu in M"). PostgREST embedda le
    // varianti come array: nessuna duplicazione delle righe prodotto.
    const filtraVarianti = filtri.taglie.length > 0 || filtri.colori.length > 0;
    // Col tema attivo la prima query e una scansione leggera (id + nome, per il
    // match in JS); altrimenti carica direttamente i campi delle card.
    const campiBase = perTema ? "id, nome" : CAMPI_CARD;
    const campi = filtraVarianti
      ? `${campiBase}, varianti!inner(taglia, colore)`
      : campiBase;

    // Multi-parola: ogni token deve comparire (AND tra i token, chiamate .or()
    // consecutive = AND) nel nome OPPURE nella descrizione. Cosi "squid game
    // logo" trova i prodotti con tutte le parole in qualsiasi ordine, non la
    // stringa esatta. Cap a 6 token: oltre e rumore e allunga la query.
    const token = filtri.q
      ? patternRicerca(filtri.q).split(/\s+/).filter(Boolean).slice(0, 6)
      : [];

    // Costruttore della query: ogni chiamata da un builder NUOVO con filtri e
    // ordinamento applicati. Serve alla scansione a blocchi del percorso tema:
    // .range() muta il builder, quindi non si puo riusarne uno solo.
    const costruisci = (conteggio: boolean) => {
      let q = supabase
        .from("prodotti")
        .select(campi, conteggio ? { count: "exact" } : undefined)
        .eq("attivo", true);

      if (categoriaIds && categoriaIds.length > 0) {
        q = q.in("categoria_id", categoriaIds);
      }
      if (filtri.taglie.length > 0) {
        q = q.in("varianti.taglia", filtri.taglie);
      }
      if (filtri.colori.length > 0) {
        q = q.in("varianti.colore", filtri.colori);
      }
      if (filtri.prezzoMin != null) {
        q = q.gte("prezzo_cents", filtri.prezzoMin * 100);
      }
      if (filtri.prezzoMax != null) {
        q = q.lte("prezzo_cents", filtri.prezzoMax * 100);
      }
      for (const t of token) {
        q = q.or(`nome.ilike.%${t}%,descrizione.ilike.%${t}%`);
      }

      switch (filtri.ordina) {
        case "prezzo-asc":
          q = q.order("prezzo_cents", { ascending: true });
          break;
        case "prezzo-desc":
          q = q.order("prezzo_cents", { ascending: false });
          break;
        case "nome":
          q = q.order("nome", { ascending: true });
          break;
        default:
          q = q.order("creato_il", { ascending: false });
      }
      // Tie-break stabile (prezzi/nomi uguali) per una paginazione coerente.
      return q.order("id", { ascending: true });
    };

    if (!perTema) {
      // Griglia paginata "Mostra altri" (cumulativa): letta a blocchi cosi non
      // si ferma a max-rows quando una categoria o un filtro supera le 1000 card
      // (senza scansione, .range(0, pagina*24-1) verrebbe troncato a 1000). Il
      // totale resta il count completo dei match, per sapere se c'e altro.
      const { righe, totale } = await scansionaBlocchi<RigaCard>(costruisci, {
        limite: pagina * PRODOTTI_PER_PAGINA,
      });
      return { prodotti: righe.map(normalizzaCard), totale };
    }

    // — Percorso tema: match in JS sulla scansione leggera (gia ordinata) —
    // Scansione INTEGRALE a blocchi (vedi scansionaBlocchi): il catalogo supera
    // le 1000 righe e senza paginazione i conteggi tema sarebbero parziali in
    // silenzio. Un errore propaga al catch della funzione (griglia vuota).
    const { righe } = await scansionaBlocchi<{ id: string; nome: string }>(
      costruisci,
    );

    // "Altro" e il complemento dei chip VISIBILI: servono gli slug delle stesse
    // facette che l'utente vede (cache condivisa con la pagina: di norma un hit).
    const facette = await caricaFacetteVetrina(supabase, categoriaIds);
    const visibili = new Set(facette.franchise.map((f) => f.slug));

    const filtrate = righe.filter((r) =>
      appartieneAlChip(r.nome, filtri.franchise, visibili),
    );
    const totale = filtrate.length;
    const ids = filtrate
      .slice(0, pagina * PRODOTTI_PER_PAGINA)
      .map((r) => r.id);
    if (ids.length === 0) return { prodotti: [], totale };

    // Card per id, a blocchi: un IN con centinaia di id gonfia l'URL PostgREST.
    const blocchi: string[][] = [];
    for (let i = 0; i < ids.length; i += 100) blocchi.push(ids.slice(i, i + 100));
    const esiti = await Promise.all(
      blocchi.map((b) =>
        supabase.from("prodotti").select(CAMPI_CARD).in("id", b),
      ),
    );
    // Un blocco fallito NON azzera l'esito: il totale e gia certo (viene dalla
    // scansione riuscita) e l'assemblaggio sotto salta gli id mancanti. Meglio
    // una griglia parziale che un finto "nessun prodotto con questi filtri".

    // L'IN non conserva l'ordine: si riassembla su quello della scansione.
    const perId = new Map(
      esiti
        .flatMap((e) => (e.data as unknown as RigaCard[] | null) ?? [])
        .map((p) => [p.id, normalizzaCard(p)]),
    );
    const prodotti = ids
      .map((id) => perId.get(id))
      .filter((p): p is Prodotto => p != null);
    return { prodotti, totale };
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

/** Riga della scansione facette (campi minimi per aggregare). */
interface RigaFacette {
  nome: string;
  prezzo_cents: number;
  varianti: Array<{ taglia: string | null; colore: string | null }> | null;
}

/**
 * Aggregazione facette vera e propria. Isolata perche gira DENTRO unstable_cache:
 * non puo ricevere il client Supabase (non serializzabile) ne leggere i cookie,
 * quindi si crea qui un client COOKIELESS (service role, cookieless). Legge solo
 * dati pubblici del catalogo attivo (prezzo + varianti), coerenti con l'anon.
 *
 * Niente fallback morbidi qui dentro: unstable_cache memorizza QUALSIASI valore
 * ritornato, e un errore transitorio cacheato come FACETTE_VUOTE prenderebbe il
 * posto dell'entry buona per 5 minuti (coi chip spariti e il filtro "altro"
 * degradato a tutta la categoria). Su errore si LANCIA: il chiamante degrada
 * per la singola richiesta senza avvelenare la cache.
 */
async function aggregaFacette(
  categoriaIds: string[],
): Promise<FacetteCatalogo> {
  const supabase = createAdminSupabase();

  // Scansione integrale a blocchi (vedi scansionaBlocchi): senza paginazione la
  // risposta si fermerebbe a max-rows e i conteggi sarebbero parziali in
  // silenzio — il catalogo supera gia le 1000 righe. L'ordine per id rende la
  // paginazione stabile (senza ORDER BY ogni blocco potrebbe rimescolarsi).
  // Un errore propaga (throw): meglio degradare la singola richiesta che
  // avvelenare la cache facette con conteggi vuoti.
  const costruisci = (conteggio: boolean) => {
    let q = supabase
      .from("prodotti")
      .select(
        "nome, prezzo_cents, varianti(taglia, colore)",
        conteggio ? { count: "exact" } : undefined,
      )
      .eq("attivo", true);
    if (categoriaIds.length > 0) {
      q = q.in("categoria_id", categoriaIds);
    }
    return q.order("id", { ascending: true });
  };

  const { righe } = await scansionaBlocchi<RigaFacette>(costruisci);

  const taglie = new Set<string>();
  const colori = new Set<string>();
  const nomi: string[] = [];
  let min: number | null = null;
  let max: number | null = null;

  for (const riga of righe) {
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
  // Senza service role key il client cookieless non si puo creare: si degrada
  // PRIMA della cache, cosi il valore vuoto non viene mai memorizzato.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return FACETTE_VUOTE;

  // Chiave stabile per categoria: ordinata cosi ordini diversi degli stessi id
  // condividono la stessa entry di cache. "tutte" = catalogo intero (home).
  const ids = categoriaIds && categoriaIds.length > 0 ? [...categoriaIds].sort() : [];
  const chiave = ids.length > 0 ? ids.join(",") : "tutte";

  const cached = unstable_cache(
    () => aggregaFacette(ids),
    ["facette-vetrina", chiave, String(VERSIONE_FRANCHISE)],
    { revalidate: FACETTE_REVALIDATE_S, tags: [TAG_FACETTE_VETRINA] },
  );

  try {
    return await cached();
  } catch {
    // Errore transitorio dell'aggregazione: si degrada per QUESTA richiesta.
    // unstable_cache non memorizza quando la funzione lancia, quindi l'entry
    // buona precedente resta valida e verra riprovata alla prossima visita.
    return FACETTE_VUOTE;
  }
}
