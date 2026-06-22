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
