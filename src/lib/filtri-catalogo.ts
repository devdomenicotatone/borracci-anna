// Filtri e ordinamento del catalogo vetrina, codificati nella query string.
// Modulo puro (niente import server/client): le pagine server lo usano per
// interpretare i searchParams, la toolbar client per ricostruire gli URL.
//
// Schema URL (chiavi omesse quando al default, cosi gli URL restano puliti):
//   ?taglia=M&taglia=L        piu taglie = chiave ripetuta
//   &colore=Blu               idem per i colori (nomi palette)
//   &prezzo_min=20&prezzo_max=80   in EURO interi (non centesimi)
//   &q=polo                   ricerca testuale
//   &ordina=prezzo-asc        novita (default) | prezzo-asc | prezzo-desc | nome

export const ORDINAMENTI = [
  "novita",
  "prezzo-asc",
  "prezzo-desc",
  "nome",
] as const;

export type Ordinamento = (typeof ORDINAMENTI)[number];

export const ORDINAMENTO_DEFAULT: Ordinamento = "novita";

/** Etichette mostrate nel menu di ordinamento. */
export const ETICHETTE_ORDINAMENTO: Record<Ordinamento, string> = {
  novita: "Novità",
  "prezzo-asc": "Prezzo: dal più basso",
  "prezzo-desc": "Prezzo: dal più alto",
  nome: "Nome (A-Z)",
};

export interface FiltriCatalogo {
  /** Taglie selezionate (es. ["M", "L"]). Vuoto = tutte. */
  taglie: string[];
  /** Colori selezionati (nomi palette, es. ["Blu"]). Vuoto = tutti. */
  colori: string[];
  /** Prezzo minimo/massimo in EURO interi. null = nessun limite. */
  prezzoMin: number | null;
  prezzoMax: number | null;
  /** Testo di ricerca (nome/descrizione). */
  q: string;
  ordina: Ordinamento;
}

export const FILTRI_VUOTI: FiltriCatalogo = {
  taglie: [],
  colori: [],
  prezzoMin: null,
  prezzoMax: null,
  q: "",
  ordina: ORDINAMENTO_DEFAULT,
};

/** Forma dei searchParams che Next passa alle pagine (gia awaited). */
export type SearchParamsCatalogo = Record<
  string,
  string | string[] | undefined
>;

/** Primo valore di un param (Next da string[] per chiavi ripetute). */
function primo(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/** Tutti i valori di un param, ripuliti e deduplicati. */
function lista(v: string | string[] | undefined): string[] {
  const valori = Array.isArray(v) ? v : v != null ? [v] : [];
  return [...new Set(valori.map((s) => s.trim()).filter(Boolean))];
}

/** Intero >= 0 oppure null (tollera "20", "20.5" -> 20). */
function interoOpzionale(v: string | string[] | undefined): number | null {
  const s = primo(v).trim();
  if (!s) return null;
  const n = Number.parseFloat(s.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

/**
 * Interpreta i searchParams della pagina in un FiltriCatalogo valido.
 * Input malformati degradano al default (mai errori all'utente).
 */
export function parseFiltri(sp: SearchParamsCatalogo): FiltriCatalogo {
  let prezzoMin = interoOpzionale(sp.prezzo_min);
  let prezzoMax = interoOpzionale(sp.prezzo_max);
  // Range invertito (es. min 80, max 20): si riordina invece di non trovare nulla.
  if (prezzoMin != null && prezzoMax != null && prezzoMin > prezzoMax) {
    [prezzoMin, prezzoMax] = [prezzoMax, prezzoMin];
  }

  const ordinaRaw = primo(sp.ordina);
  const ordina = (ORDINAMENTI as readonly string[]).includes(ordinaRaw)
    ? (ordinaRaw as Ordinamento)
    : ORDINAMENTO_DEFAULT;

  return {
    taglie: lista(sp.taglia),
    colori: lista(sp.colore),
    prezzoMin,
    prezzoMax,
    q: primo(sp.q).trim().slice(0, 80),
    ordina,
  };
}

/**
 * Serializza i filtri in query string (senza "?"), omettendo i default.
 * Ritorna "" quando non c'e nulla da codificare: l'URL resta pulito.
 */
export function serializzaFiltri(filtri: FiltriCatalogo): string {
  const qs = new URLSearchParams();
  for (const t of filtri.taglie) qs.append("taglia", t);
  for (const c of filtri.colori) qs.append("colore", c);
  if (filtri.prezzoMin != null) qs.set("prezzo_min", String(filtri.prezzoMin));
  if (filtri.prezzoMax != null) qs.set("prezzo_max", String(filtri.prezzoMax));
  if (filtri.q) qs.set("q", filtri.q);
  if (filtri.ordina !== ORDINAMENTO_DEFAULT) qs.set("ordina", filtri.ordina);
  return qs.toString();
}

/**
 * Facette del catalogo: quali taglie/colori esistono davvero e il range dei
 * prezzi. Le calcola il server (lib/vetrina), le consuma la toolbar client:
 * il tipo vive qui perche questo modulo e importabile da entrambi i mondi.
 */
export interface FacetteCatalogo {
  /** Taglie realmente presenti (ordinate sulla scala XXS -> 6XL). */
  taglie: string[];
  /** Colori realmente presenti (ordinati come la palette). */
  colori: string[];
  /** Range prezzi del catalogo corrente, in centesimi. null = catalogo vuoto. */
  prezzoMinCents: number | null;
  prezzoMaxCents: number | null;
}

export const FACETTE_VUOTE: FacetteCatalogo = {
  taglie: [],
  colori: [],
  prezzoMinCents: null,
  prezzoMaxCents: null,
};

/**
 * Pagina corrente (param `pagina`, 1-based). Non fa parte di FiltriCatalogo:
 * non e un filtro, e serializzaFiltri non la include mai, cosi ogni cambio
 * di filtro riparte naturalmente dalla prima pagina.
 */
export function parsePagina(sp: SearchParamsCatalogo): number {
  const n = interoOpzionale(sp.pagina);
  return n != null && n >= 1 ? n : 1;
}

/**
 * Quanti filtri sono attivi (per il badge sul bottone "Filtri").
 * L'ordinamento non conta: e una preferenza di vista, non un filtro.
 */
export function contaFiltriAttivi(filtri: FiltriCatalogo): number {
  return (
    filtri.taglie.length +
    filtri.colori.length +
    (filtri.prezzoMin != null || filtri.prezzoMax != null ? 1 : 0) +
    (filtri.q ? 1 : 0)
  );
}
