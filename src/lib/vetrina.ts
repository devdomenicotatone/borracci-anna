import "server-only";

// Query del catalogo pubblico (vetrina): prodotti filtrati/ordinati e facette
// (taglie/colori/range prezzo/temi disponibili) per la toolbar filtri.
// Condiviso da home e pagine categoria. Filtri, ordinamento e conteggi dei
// temi si applicano lato DB cosi la vetrina regge anche con molti prodotti.
// Il tema e la colonna `prodotti.tema` (slug del dizionario lib/franchise,
// NULL = senza tema): filtro eq/complemento e conteggi group-by, esatti e
// indicizzati. Il dizionario resta il classificatore in scrittura e il
// fallback in lettura finche la migration 20260707150000 non e applicata.

import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  FACETTE_VUOTE,
  type FacetteCatalogo,
  type FiltriCatalogo,
  type FranchiseConteggio,
} from "@/lib/filtri-catalogo";
import type { Prodotto } from "@/lib/types";
import { COLORI, ordinaTaglie } from "@/lib/catalogo";
import {
  FRANCHISE_ALTRO,
  VERSIONE_FRANCHISE,
  appartieneAlChip,
  contaFranchise,
  etichettaFranchise,
} from "@/lib/franchise";

type Supabase = SupabaseClient<Database>;

/** Prodotti per "pagina" della griglia (il bottone Mostra altri ne carica altrettanti). */
export const PRODOTTI_PER_PAGINA = 24;

/** Blocco delle scansioni integrali (percorso tema, facette): PostgREST tronca
 *  ogni risposta a max-rows (default Supabase: 1000) SENZA errore, quindi le
 *  letture "tutte le righe" vanno paginate a blocchi e guidate dal count. */
const BLOCCO_SCANSIONE = 1000;

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
 *
 * Filtro per TEMA (franchise): sulla colonna `tema`, lato DB. Un chip normale
 * e un eq(tema); "Altro" e il complemento dei chip visibili (tema NULL + temi
 * sotto soglia), con gli slug dalle stesse facette che l'utente vede: il
 * numero sul chip resta ESATTAMENTE quanti prodotti appaiono cliccandolo,
 * perche conteggio (conta_temi_catalogo) e filtro guardano la stessa colonna.
 * Se la colonna non esiste ancora (migration 20260707150000 non applicata: il
 * DB risponde 42703) si ripiega sul percorso runtime pre-colonna: match col
 * dizionario (appartieneAlChip) su una scansione leggera `id, nome` gia
 * filtrata/ordinata dal DB, card della pagina caricate poi per id.
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

    // Multi-parola: ogni token deve comparire (AND tra i token, chiamate .or()
    // consecutive = AND) nel nome OPPURE nella descrizione. Cosi "squid game
    // logo" trova i prodotti con tutte le parole in qualsiasi ordine, non la
    // stringa esatta. Cap a 6 token: oltre e rumore e allunga la query.
    const token = filtri.q
      ? patternRicerca(filtri.q).split(/\s+/).filter(Boolean).slice(0, 6)
      : [];

    // Costruttore della query: ogni chiamata da un builder NUOVO con filtri
    // comuni e ordinamento applicati. Serve alla scansione a blocchi del
    // fallback runtime (.range() muta il builder) e ai campi diversi dei due
    // percorsi: card complete (percorso DB) o scansione leggera id+nome.
    const costruisci = (campiBase: string, conteggio: boolean) => {
      const campi = filtraVarianti
        ? `${campiBase}, varianti!inner(taglia, colore)`
        : campiBase;
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

    // — Percorso DB: il filtro tema e una clausola sulla colonna `tema` —
    let query = costruisci(CAMPI_CARD, true);
    if (filtri.franchise === FRANCHISE_ALTRO) {
      // "Altro" = complemento dei chip visibili: gli slug arrivano dalle
      // STESSE facette mostrate all'utente (cache condivisa: di norma un hit),
      // cosi numero sul chip e risultati del click coincidono. Gli slug sono
      // kebab-case (validati al salvataggio): sicuri dentro `in.(...)`.
      const facette = await caricaFacetteVetrina(supabase, categoriaIds);
      const visibili = facette.franchise
        .map((f) => f.slug)
        .filter((s) => s !== FRANCHISE_ALTRO);
      query =
        visibili.length > 0
          ? query.or(`tema.is.null,tema.not.in.(${visibili.join(",")})`)
          : query.is("tema", null);
    } else if (filtri.franchise) {
      query = query.eq("tema", filtri.franchise);
    }

    const esito = await query.range(0, pagina * PRODOTTI_PER_PAGINA - 1);
    if (!esito.error) {
      return {
        prodotti: (esito.data as unknown as Prodotto[] | null) ?? [],
        totale: esito.count ?? 0,
      };
    }
    // 42703 = undefined_column: la colonna `tema` non esiste ancora (migration
    // 20260707150000 non applicata) -> fallback runtime qui sotto. Senza
    // filtro tema il 42703 non puo succedere; ogni altro errore degrada a
    // vuoto come sempre.
    if (!filtri.franchise || esito.error.code !== "42703") {
      return { prodotti: [], totale: 0 };
    }

    // — Fallback runtime (pre-migration): dizionario sui nomi, come prima
    // della colonna. Slug ignoto al dizionario (link vecchio/manomesso): si
    // ignora il filtro, come faceva il vecchio percorso.
    if (etichettaFranchise(filtri.franchise) == null) {
      const { data, error, count } = await costruisci(CAMPI_CARD, true).range(
        0,
        pagina * PRODOTTI_PER_PAGINA - 1,
      );
      if (error) return { prodotti: [], totale: 0 };
      return {
        prodotti: (data as unknown as Prodotto[] | null) ?? [],
        totale: count ?? 0,
      };
    }

    // Match in JS sulla scansione leggera id+nome (gia ordinata), INTEGRALE a
    // blocchi: senza range PostgREST tronca a max-rows (default 1000) SENZA
    // errore, e il catalogo supera gia quella soglia: righe perse in silenzio
    // = conteggi e "Mostra altri" sbagliati. Il count exact del primo blocco
    // fa da guida: si legge finche non si coprono tutte le righe attese
    // (robusto anche se il server ha un max-rows piu basso).
    const righe: Array<{ id: string; nome: string }> = [];
    let attese: number | null = null;
    for (;;) {
      const { data, error, count } = await costruisci(
        "id, nome",
        righe.length === 0,
      ).range(righe.length, righe.length + BLOCCO_SCANSIONE - 1);
      if (error) return { prodotti: [], totale: 0 };
      const blocco =
        (data as unknown as Array<{ id: string; nome: string }> | null) ?? [];
      righe.push(...blocco);
      if (attese == null) attese = count ?? null;
      if (blocco.length === 0) break; // guardia anti-loop (mai fidarsi del count)
      if (attese != null ? righe.length >= attese : blocco.length < BLOCCO_SCANSIONE) {
        break;
      }
    }

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
        .flatMap((e) => (e.data as unknown as Prodotto[] | null) ?? [])
        .map((p) => [p.id, p]),
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

/** Etichetta leggibile per un tema fuori dizionario ("death-note" -> "Death Note"):
 *  il gestore sceglie dal dizionario, ma un tema salvato sopravvive alla
 *  rimozione della voce e il suo chip non deve rompersi. */
function etichettaDaSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(" ");
}

/**
 * Chip dei temi dai conteggi DB-side (le righe di conta_temi_catalogo, una per
 * tema). Stesse regole di contaFranchise: chip proprio da `min` prodotti in su
 * (sotto soglia e rumore), ordinati per numerosita; se emerge almeno un chip,
 * in coda "Altro" col resto (tema NULL + temi sotto soglia): la somma dei
 * count e SEMPRE il totale della categoria.
 */
function chipTemi(
  righe: Array<{ tema: string | null; n: number }>,
  min = 3,
): FranchiseConteggio[] {
  const totale = righe.reduce((somma, r) => somma + r.n, 0);
  const chips = righe
    .filter((r): r is { tema: string; n: number } => r.tema != null && r.n >= min)
    .map((r) => ({
      slug: r.tema,
      etichetta: etichettaFranchise(r.tema) ?? etichettaDaSlug(r.tema),
      count: r.n,
    }))
    .sort(
      (a, b) => b.count - a.count || a.etichetta.localeCompare(b.etichetta, "it"),
    );
  if (chips.length === 0) return []; // nessun tema: niente riga chip

  const altro = totale - chips.reduce((somma, c) => somma + c.count, 0);
  if (altro > 0) {
    chips.push({
      slug: FRANCHISE_ALTRO,
      etichetta: etichettaFranchise(FRANCHISE_ALTRO)!,
      count: altro,
    });
  }
  return chips;
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

  // Scansione integrale a blocchi (vedi BLOCCO_SCANSIONE): senza range la
  // risposta si fermerebbe a max-rows e i conteggi sarebbero parziali in
  // silenzio — il catalogo supera gia le 1000 righe. L'ordine per id rende la
  // paginazione stabile (senza ORDER BY ogni blocco potrebbe rimescolarsi).
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

  const righe: RigaFacette[] = [];
  let attese: number | null = null;
  for (;;) {
    const { data, error, count } = await costruisci(righe.length === 0).range(
      righe.length,
      righe.length + BLOCCO_SCANSIONE - 1,
    );
    if (error) throw error;
    const blocco = (data as unknown as RigaFacette[] | null) ?? [];
    righe.push(...blocco);
    if (attese == null) attese = count ?? null;
    if (blocco.length === 0) break; // guardia anti-loop (mai fidarsi del count)
    if (attese != null ? righe.length >= attese : blocco.length < BLOCCO_SCANSIONE) {
      break;
    }
  }

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

  // Conteggi dei temi: esatti e lato DB (group by sulla colonna `tema`, una
  // riga per tema: mai vicini al tetto max-rows). Coerenti col filtro del
  // click, che guarda la stessa colonna.
  const { data: temi, error: erroreTemi } = await supabase.rpc(
    "conta_temi_catalogo",
    { p_categoria_ids: categoriaIds.length > 0 ? categoriaIds : null },
  );

  let franchise: FranchiseConteggio[];
  if (!erroreTemi && temi != null) {
    franchise = chipTemi(temi);
  } else if (
    erroreTemi != null &&
    (erroreTemi.code === "PGRST202" || erroreTemi.code === "42883")
  ) {
    // RPC non ancora migrata (migration 20260707150000): si conta col
    // dizionario sui nomi della scansione, come prima della colonna.
    franchise = contaFranchise(nomi);
  } else {
    // Errore transitorio: si lancia (vedi commento della funzione), cosi la
    // cache non memorizza conteggi dal dizionario incoerenti col filtro DB.
    throw erroreTemi ?? new Error("conta_temi_catalogo: risposta vuota");
  }

  return {
    taglie: ordinaTaglie(taglie),
    colori: ordinaColori(colori),
    prezzoMinCents: min,
    prezzoMaxCents: max,
    franchise,
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
