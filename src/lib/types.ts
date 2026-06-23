// Tipi condivisi del dominio e-commerce "by Frody".
// Valuta in EUR, prezzi sempre in centesimi (interi) per evitare errori float.

/** Un prodotto a catalogo. */
export interface Prodotto {
  id: string;
  /** Slug url-friendly, univoco, in italiano (es. "t-shirt-bianca-basic"). */
  slug: string;
  nome: string;
  descrizione: string | null;
  /** Prezzo in centesimi di euro (es. 2999 = 29,99 €). */
  prezzo_cents: number;
  /** Codice valuta ISO 4217 (sempre "EUR" per ora). */
  valuta: string;
  immagine_url: string | null;
  attivo: boolean;
}

/** Una variante acquistabile di un prodotto (taglia/colore + scorte). */
export interface Variante {
  id: string;
  prodotto_id: string;
  taglia: string | null;
  colore: string | null;
  /** Codice univoco di magazzino. */
  sku: string;
  /** Quantita disponibile a stock. */
  stock: number;
}

/** Prodotto completo di tutte le sue varianti (usato nella PDP). */
export type ProdottoConVarianti = Prodotto & { varianti: Variante[] };

/** Una riga del carrello con prodotto e variante risolti. */
export interface RigaCarrello {
  id: string;
  quantita: number;
  prodotto: Prodotto;
  variante: Variante;
}

/**
 * Esito di una mutazione del carrello (Server Action).
 * Le action ritornano sempre lo stato corrente del carrello (righe + totali),
 * cosi il client aggiorna badge/drawer/totali senza un secondo round-trip.
 * `ok=false` con `motivo` permette al client di reagire (toast) senza perdere
 * lo stato gia mostrato. `avviso` segnala un esito riuscito ma corretto
 * (es. quantita limitata allo stock).
 */
export interface EsitoCarrello {
  ok: boolean;
  righe: RigaCarrello[];
  /** Somma delle quantita (per il badge). */
  count: number;
  /** Subtotale in centesimi (prezzo * quantita sommati). */
  subtotaleCents: number;
  valuta: string;
  avviso?: string;
  motivo?: "non_configurato" | "esaurito" | "stock_insufficiente" | "errore";
}

/** Stato di avanzamento di un ordine. */
export type StatoOrdine = "in_attesa" | "pagato" | "annullato";

/** Un ordine cliente. */
export interface Ordine {
  id: string;
  stato: StatoOrdine;
  /** Totale in centesimi di euro. */
  totale_cents: number;
  email: string | null;
  stripe_session_id: string | null;
  /** Timestamp ISO 8601 di creazione. */
  creato_il: string;
}

/** Un utente abilitato all'area gestore (riga in public.profili). */
export interface Profilo {
  id: string;
  ruolo: "gestore" | "staff";
  nome: string | null;
}

/**
 * Dati di una variante mentre viene modificata nel form gestore.
 * `id` assente => riga nuova ancora da creare.
 */
export interface VarianteInput {
  id?: string;
  taglia: string | null;
  colore: string | null;
  sku: string;
  stock: number;
}
