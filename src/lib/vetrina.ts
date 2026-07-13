import "server-only";

// Query del catalogo pubblico (vetrina): prodotti filtrati/ordinati e facette
// (taglie/colori/range prezzo/temi disponibili) per la toolbar filtri.
// Condiviso da home e pagine categoria. Filtri, ordinamento e conteggi dei
// temi si applicano lato DB cosi la vetrina regge anche con molti prodotti.
// La ricerca testuale e letterale (token ilike) con FALLBACK SEMANTICO
// integrativo quando trova poco (pgvector + embedding, lib/ricerca-semantica).
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
  type Ordinamento,
} from "@/lib/filtri-catalogo";
import type { Prodotto } from "@/lib/types";
import { scansionaBlocchi } from "@/lib/supabase/scansione";
import {
  SOGLIA_FALLBACK_SEMANTICO,
  cercaIdSemantici,
} from "@/lib/ricerca-semantica";
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
 * Ricerca testuale: letterale (token ilike in AND su nome/descrizione); se
 * trova meno di SOGLIA_FALLBACK_SEMANTICO risultati si accodano i vicini per
 * SIGNIFICATO (embedding + pgvector, vedi estendiConSemantica): "felpa uomo
 * ragno" torna gli Spider-Man anche senza match di parole. Qualsiasi guasto
 * del percorso semantico lascia il solo letterale (mai pagina rotta).
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
 *
 * `soloPagina`: ritorna SOLO le card della pagina `pagina` (il DELTA per
 * l'append client dello scorrimento infinito, vedi lib/catalogo-actions),
 * invece del cumulato 1..pagina che serve al percorso URL ?pagina=N. Stessi
 * filtri e stesso ordinamento (tie-break su id): le card coincidono con quelle
 * che il cumulato metterebbe in quella posizione. Una pagina e al massimo
 * PRODOTTI_PER_PAGINA righe, ben sotto il max-rows di PostgREST: un singolo
 * .range() con offset non rischia il troncamento silenzioso che impone la
 * scansione a blocchi al cumulato (max-rows cappa le righe PER RISPOSTA, non
 * l'offset).
 */
export async function caricaProdottiVetrina(
  supabase: Supabase | null,
  opzioni: {
    filtri: FiltriCatalogo;
    categoriaIds?: string[];
    pagina?: number;
    /** true = solo le card della pagina richiesta (delta), non il cumulato. */
    soloPagina?: boolean;
  },
): Promise<EsitoCatalogo> {
  const { filtri, categoriaIds, pagina = 1, soloPagina = false } = opzioni;

  if (!supabase) {
    // Dati demo (env assenti): stanno tutti in una pagina, il delta delle
    // successive e legittimamente vuoto.
    return {
      prodotti: soloPagina && pagina > 1 ? [] : PRODOTTI_ESEMPIO,
      totale: PRODOTTI_ESEMPIO.length,
    };
  }

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
    // `conRicerca=false` omette il vincolo letterale sui token: e il builder
    // del fallback semantico, che carica per id prodotti trovati per
    // SIGNIFICATO (il vincolo sulle parole li escluderebbe tutti) ma deve
    // rispettare ogni altro filtro corrente.
    const costruisci = (
      campiBase: string,
      conteggio: boolean,
      conRicerca = true,
    ) => {
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
      if (conRicerca) {
        for (const t of token) {
          q = q.or(`nome.ilike.%${t}%,descrizione.ilike.%${t}%`);
        }
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
    // Per "Altro" (complemento dei chip visibili) gli slug arrivano dalle
    // STESSE facette mostrate all'utente (cache condivisa: di norma un hit),
    // cosi numero sul chip e risultati del click coincidono. Gli slug sono
    // kebab-case (validati al salvataggio): sicuri dentro `in.(...)`. Si
    // calcolano PRIMA del costruttore: la scansione a blocchi chiede un
    // builder NUOVO a ogni blocco e ognuno deve avere la stessa clausola.
    let visibiliAltro: string[] | null = null;
    if (filtri.franchise === FRANCHISE_ALTRO) {
      const facette = await caricaFacetteVetrina(supabase, categoriaIds);
      visibiliAltro = facette.franchise
        .map((f) => f.slug)
        .filter((s) => s !== FRANCHISE_ALTRO);
    }
    const costruisciConTema = (conteggio: boolean, conRicerca = true) => {
      let q = costruisci(CAMPI_CARD, conteggio, conRicerca);
      if (visibiliAltro != null) {
        q =
          visibiliAltro.length > 0
            ? q.or(`tema.is.null,tema.not.in.(${visibiliAltro.join(",")})`)
            : q.is("tema", null);
      } else if (filtri.franchise) {
        q = q.eq("tema", filtri.franchise);
      }
      return q;
    };

    try {
      // Griglia paginata "Mostra altri" (cumulativa): letta a blocchi cosi non
      // si ferma a max-rows quando una categoria o un filtro supera le 1000 card
      // (senza scansione, .range(0, pagina*24-1) verrebbe troncato a 1000). Il
      // totale resta il count completo dei match, per sapere se c'e altro.
      // Col delta (`soloPagina`) basta un singolo .range() con offset: al
      // massimo PRODOTTI_PER_PAGINA righe, mai vicine a max-rows.
      let letterali: Prodotto[];
      let totale: number;
      if (soloPagina) {
        const offset = (pagina - 1) * PRODOTTI_PER_PAGINA;
        const { data, error, count } = await costruisciConTema(true).range(
          offset,
          offset + PRODOTTI_PER_PAGINA - 1,
        );
        if (error) throw error; // stesso trattamento del cumulato (catch sotto)
        letterali = ((data as unknown as RigaCard[] | null) ?? []).map(
          normalizzaCard,
        );
        totale = count ?? letterali.length;
      } else {
        const esito = await scansionaBlocchi<RigaCard>(costruisciConTema, {
          limite: pagina * PRODOTTI_PER_PAGINA,
        });
        letterali = esito.righe.map(normalizzaCard);
        totale = esito.totale;
      }

      // — Fallback semantico integrativo (Fase 3 dei temi) — Quando il
      // letterale trova POCO (sotto soglia: ricerca rotta o povera, es. "uomo
      // ragno"), si accodano i prodotti vicini per significato (pgvector, vedi
      // lib/ricerca-semantica), filtrati dagli stessi filtri correnti. I
      // letterali restano primi: precisione alta davanti. `.catch(null)`:
      // qualunque intoppo del percorso semantico NON deve finire nel catch
      // esterno (che svuoterebbe una griglia letterale gia buona).
      if (token.length > 0 && totale < SOGLIA_FALLBACK_SEMANTICO) {
        // L'estensione vuole TUTTI i letterali (dedup completo). Nel delta
        // delle pagine successive alla prima la pagina letterale e vuota (i
        // letterali, sotto soglia, stanno tutti in pagina 1): si rileggono —
        // sono meno di SOGLIA righe, una chiamata sola.
        let tuttiLetterali = letterali;
        if (soloPagina && pagina > 1) {
          const { data, error } = await costruisciConTema(false).range(
            0,
            SOGLIA_FALLBACK_SEMANTICO - 1,
          );
          if (error) throw error;
          tuttiLetterali = ((data as unknown as RigaCard[] | null) ?? []).map(
            normalizzaCard,
          );
        }
        const esteso = await estendiConSemantica(supabase, {
          q: filtri.q,
          ordina: filtri.ordina,
          letterali: tuttiLetterali,
          totaleLetterale: totale,
          limite: pagina * PRODOTTI_PER_PAGINA,
          costruisciCard: (ids) =>
            costruisciConTema(false, false).in("id", ids),
        }).catch(() => null);
        if (esteso) {
          // Il delta della lista estesa e la sua fetta di pagina: la lista
          // (letterali + semantici, gia limitata a pagina*24) e ricalcolata
          // per intero ma al client viaggia solo la pagina richiesta.
          return soloPagina
            ? {
                prodotti: esteso.prodotti.slice(
                  (pagina - 1) * PRODOTTI_PER_PAGINA,
                ),
                totale: esteso.totale,
              }
            : esteso;
        }
      }
      return { prodotti: letterali, totale };
    } catch (err) {
      // 42703 = undefined_column: la colonna `tema` non esiste ancora
      // (migration 20260707150000 non applicata) -> fallback runtime qui
      // sotto. Senza filtro tema il 42703 non puo succedere; ogni altro
      // errore degrada a vuoto come sempre.
      if (
        !filtri.franchise ||
        (err as { code?: string } | null)?.code !== "42703"
      ) {
        return { prodotti: [], totale: 0 };
      }
    }

    // — Fallback runtime (pre-migration): dizionario sui nomi, come prima
    // della colonna. Slug ignoto al dizionario (link vecchio/manomesso): si
    // ignora il filtro, come faceva il vecchio percorso.
    if (etichettaFranchise(filtri.franchise) == null) {
      if (soloPagina) {
        // Delta: singolo .range() con offset (vedi commento del percorso DB).
        const offset = (pagina - 1) * PRODOTTI_PER_PAGINA;
        const { data, error, count } = await costruisci(CAMPI_CARD, true).range(
          offset,
          offset + PRODOTTI_PER_PAGINA - 1,
        );
        if (error) throw error; // -> catch esterno: degrada a vuoto
        const prodotti = ((data as unknown as RigaCard[] | null) ?? []).map(
          normalizzaCard,
        );
        return { prodotti, totale: count ?? prodotti.length };
      }
      const { righe, totale } = await scansionaBlocchi<RigaCard>(
        (conteggio) => costruisci(CAMPI_CARD, conteggio),
        { limite: pagina * PRODOTTI_PER_PAGINA },
      );
      return { prodotti: righe.map(normalizzaCard), totale };
    }

    // — Percorso tema pre-migration: match in JS sulla scansione leggera —
    // Scansione INTEGRALE a blocchi (vedi scansionaBlocchi): il catalogo supera
    // le 1000 righe e senza paginazione i conteggi tema sarebbero parziali in
    // silenzio. Un errore propaga al catch della funzione (griglia vuota).
    const { righe } = await scansionaBlocchi<{ id: string; nome: string }>(
      (conteggio) => costruisci("id, nome", conteggio),
    );

    // "Altro" e il complemento dei chip VISIBILI: servono gli slug delle stesse
    // facette che l'utente vede (cache condivisa con la pagina: di norma un hit).
    const facette = await caricaFacetteVetrina(supabase, categoriaIds);
    const visibili = new Set(facette.franchise.map((f) => f.slug));

    const filtrate = righe.filter((r) =>
      appartieneAlChip(r.nome, filtri.franchise, visibili),
    );
    const totale = filtrate.length;
    // Cumulato: pagine 1..N; delta (`soloPagina`): solo la fetta della pagina N.
    const ids = filtrate
      .slice(
        soloPagina ? (pagina - 1) * PRODOTTI_PER_PAGINA : 0,
        pagina * PRODOTTI_PER_PAGINA,
      )
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

/**
 * Accoda ai risultati letterali i prodotti semanticamente vicini alla query
 * (vedi lib/ricerca-semantica), rispettando i filtri correnti. La RPC ritorna
 * SOLO id+distanza: le card si caricano con `costruisciCard` — lo stesso
 * costruttore della griglia SENZA il vincolo letterale — a blocchi da 100 id
 * (un IN con centinaia di id gonfia l'URL PostgREST). Cosi taglie/colori/
 * prezzo/categoria/tema valgono identici sui semantici, in un posto solo.
 *
 * Chi chiama gate-a gia su "letterale sotto soglia" (< 8 < PRODOTTI_PER_PAGINA):
 * i `letterali` ricevuti sono quindi TUTTI i match letterali, e il dedup per id
 * e completo. Ritorna null quando non c'e nulla da aggiungere o il percorso
 * semantico non e disponibile: si resta al solo letterale. Non lancia mai.
 */
async function estendiConSemantica(
  supabase: Supabase,
  opzioni: {
    q: string;
    ordina: Ordinamento;
    letterali: Prodotto[];
    totaleLetterale: number;
    /** Cap cumulativo della griglia (pagina * PRODOTTI_PER_PAGINA). */
    limite: number;
    costruisciCard: (
      ids: string[],
    ) => PromiseLike<{ data: unknown; error: unknown }>;
  },
): Promise<EsitoCatalogo | null> {
  try {
    const candidati = await cercaIdSemantici(supabase, opzioni.q);
    if (!candidati || candidati.length === 0) return null;

    const visti = new Set(opzioni.letterali.map((p) => p.id));
    const nuovi = candidati.filter((c) => !visti.has(c.id));
    if (nuovi.length === 0) return null;

    const ids = nuovi.map((c) => c.id);
    const blocchi: string[][] = [];
    for (let i = 0; i < ids.length; i += 100) blocchi.push(ids.slice(i, i + 100));
    const esiti = await Promise.all(
      blocchi.map(async (b) => {
        const { data, error } = await opzioni.costruisciCard(b);
        if (error) throw error; // -> catch: si resta al solo letterale
        return (data as RigaCard[] | null) ?? [];
      }),
    );

    const semantici = esiti.flat().map(normalizzaCard);
    if (semantici.length === 0) return null;

    // I blocchi spezzano l'ordine del DB: si riordina qui. Con "novita"
    // (default) vince la PERTINENZA (distanza coseno crescente): per una
    // ricerca e l'ordine atteso; un ordinamento esplicito dell'utente invece
    // si rispetta anche sul blocco semantico.
    const distanze = new Map(nuovi.map((c) => [c.id, c.distanza]));
    semantici.sort(confrontoSemantico(opzioni.ordina, distanze));

    return {
      prodotti: [...opzioni.letterali, ...semantici].slice(0, opzioni.limite),
      totale: opzioni.totaleLetterale + semantici.length,
    };
  } catch {
    return null;
  }
}

/** Comparatore del blocco semantico: pertinenza col default "novita",
 *  altrimenti il criterio esplicito; distanza (poi id) come tie-break. */
function confrontoSemantico(
  ordina: Ordinamento,
  distanze: Map<string, number>,
): (a: Prodotto, b: Prodotto) => number {
  const perDistanza = (a: Prodotto, b: Prodotto) =>
    (distanze.get(a.id) ?? 1) - (distanze.get(b.id) ?? 1) ||
    a.id.localeCompare(b.id);
  return (a, b) => {
    switch (ordina) {
      case "prezzo-asc":
        return a.prezzo_cents - b.prezzo_cents || perDistanza(a, b);
      case "prezzo-desc":
        return b.prezzo_cents - a.prezzo_cents || perDistanza(a, b);
      case "nome":
        return a.nome.localeCompare(b.nome, "it") || perDistanza(a, b);
      default:
        return perDistanza(a, b);
    }
  };
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
