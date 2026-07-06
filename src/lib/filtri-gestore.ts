// Filtri, ordinamento e paginazione della lista prodotti del GESTORE, codificati
// nella query string. Modulo puro (niente import server/client): la pagina
// server lo usa per interpretare i searchParams, la lista client per ricostruire
// gli URL. Gemello di lib/filtri-catalogo.ts (vetrina), ma con i filtri propri
// del pannello (stato attivo/nascosto, categoria singola incl. "senza", ricerca
// anche per sku, ordinamento per scorte).
//
// Schema URL (chiavi omesse quando al default, cosi gli URL restano puliti):
//   ?q=abc123           ricerca per nome/slug/codice/sku
//   &stato=nascosti     tutti (default) | attivi | nascosti
//   &categoria=<id>     id categoria, oppure "none" = senza categoria
//   &ordina=nome        recenti (default) | nome | prezzo-asc | prezzo-desc | scorte
//   &pagina=2           1-based (non e un filtro: mai in serializzaFiltriGestore)

export const STATI_PRODOTTO = ["tutti", "attivi", "nascosti"] as const;
export type StatoProdotto = (typeof STATI_PRODOTTO)[number];

export const ORDINAMENTI_GESTORE = [
  "recenti",
  "nome",
  "prezzo-asc",
  "prezzo-desc",
  "scorte",
] as const;
export type OrdinamentoGestore = (typeof ORDINAMENTI_GESTORE)[number];

export const ORDINAMENTO_GESTORE_DEFAULT: OrdinamentoGestore = "recenti";

/** Etichette del menu di ordinamento. */
export const ETICHETTE_ORDINAMENTO_GESTORE: Record<OrdinamentoGestore, string> = {
  recenti: "Più recenti",
  nome: "Nome (A-Z)",
  "prezzo-asc": "Prezzo: dal più basso",
  "prezzo-desc": "Prezzo: dal più alto",
  scorte: "Scorte: prima le basse",
};

export interface FiltriGestore {
  /** Testo di ricerca (nome/slug/codice/sku). */
  q: string;
  stato: StatoProdotto;
  /** "" = tutte le categorie; "none" = senza categoria; altrimenti id categoria. */
  categoria: string;
  ordina: OrdinamentoGestore;
}

export const FILTRI_GESTORE_VUOTI: FiltriGestore = {
  q: "",
  stato: "tutti",
  categoria: "",
  ordina: ORDINAMENTO_GESTORE_DEFAULT,
};

/** Numero massimo di pagine caricabili con "Mostra altri" (guardia URL). */
export const PAGINA_MAX_GESTORE = 100;

/** Forma dei searchParams che Next passa alla pagina (gia awaited). */
export type SearchParamsGestore = Record<string, string | string[] | undefined>;

/** Conteggi prodotti per categoria (una entry per id + "senza categoria"),
 *  sull'intero catalogo del gestore. Prodotti dalla RPC conteggi_categorie_gestore,
 *  consumati dal menu a tendina. Il tipo vive qui perche questo modulo e
 *  importabile sia dal server (data layer) sia dal client (lista). */
export interface ConteggiCategorie {
  /** id categoria -> quanti prodotti (diretti). */
  perCategoria: Record<string, number>;
  /** Prodotti senza categoria. */
  senza: number;
}

/** Primo valore di un param (Next da string[] per chiavi ripetute). */
function primo(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/** Intero >= 1 oppure null. */
function paginaValida(v: string | string[] | undefined): number | null {
  const n = Number.parseInt(primo(v).trim(), 10);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/**
 * Interpreta i searchParams in un FiltriGestore valido.
 * Input malformati degradano al default (mai errori all'utente).
 */
export function parseFiltriGestore(sp: SearchParamsGestore): FiltriGestore {
  const statoRaw = primo(sp.stato);
  const stato = (STATI_PRODOTTO as readonly string[]).includes(statoRaw)
    ? (statoRaw as StatoProdotto)
    : "tutti";

  const ordinaRaw = primo(sp.ordina);
  const ordina = (ORDINAMENTI_GESTORE as readonly string[]).includes(ordinaRaw)
    ? (ordinaRaw as OrdinamentoGestore)
    : ORDINAMENTO_GESTORE_DEFAULT;

  return {
    q: primo(sp.q).trim().slice(0, 80),
    stato,
    categoria: primo(sp.categoria).trim().slice(0, 60),
    ordina,
  };
}

/**
 * Serializza i filtri in query string (senza "?"), omettendo i default.
 * NON include la pagina: ogni cambio di filtro riparte dalla prima pagina.
 */
export function serializzaFiltriGestore(filtri: FiltriGestore): string {
  const qs = new URLSearchParams();
  if (filtri.q) qs.set("q", filtri.q);
  if (filtri.stato !== "tutti") qs.set("stato", filtri.stato);
  if (filtri.categoria) qs.set("categoria", filtri.categoria);
  if (filtri.ordina !== ORDINAMENTO_GESTORE_DEFAULT) qs.set("ordina", filtri.ordina);
  return qs.toString();
}

/** Pagina corrente (1-based), limitata a PAGINA_MAX_GESTORE per sicurezza. */
export function parsePaginaGestore(sp: SearchParamsGestore): number {
  const n = paginaValida(sp.pagina);
  if (n == null) return 1;
  return Math.min(n, PAGINA_MAX_GESTORE);
}

/** Quanti filtri sono attivi (l'ordinamento non conta: e una vista, non un filtro). */
export function contaFiltriGestoreAttivi(filtri: FiltriGestore): number {
  return (
    (filtri.q ? 1 : 0) +
    (filtri.stato !== "tutti" ? 1 : 0) +
    (filtri.categoria ? 1 : 0)
  );
}
