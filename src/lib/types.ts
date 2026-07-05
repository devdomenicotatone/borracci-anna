// Tipi condivisi del dominio e-commerce "Borracci Anna".
// Valuta in EUR, prezzi sempre in centesimi (interi) per evitare errori float.

/** Una categoria di catalogo (lista gestibile dal pannello). */
export interface Categoria {
  id: string;
  /** Slug url-friendly, univoco (es. "polo"). */
  slug: string;
  nome: string;
  /** Categoria padre (macro). null = categoria di primo livello (es. Uomo/Donna). */
  parent_id?: string | null;
  /** Ordinamento in elenco/menu (ascendente). */
  ordine: number;
}

/** Un prodotto a catalogo. */
export interface Prodotto {
  id: string;
  /** Slug url-friendly, univoco, in italiano (es. "t-shirt-bianca-basic"). */
  slug: string;
  /**
   * Codice prodotto opzionale (es. "ABC123"): base degli SKU delle varianti al
   * posto dello slug. null => gli SKU derivano dallo slug. Vedi migration
   * 20260704120000.
   */
  codice?: string | null;
  nome: string;
  descrizione: string | null;
  /** Prezzo in centesimi di euro (es. 2999 = 29,99 €). */
  prezzo_cents: number;
  /** Codice valuta ISO 4217 (sempre "EUR" per ora). */
  valuta: string;
  immagine_url: string | null;
  attivo: boolean;
  /** Categoria assegnata (null = senza categoria). */
  categoria_id?: string | null;
  /**
   * Magazzino non in tempo reale: il cliente sceglie colore+taglia e contatta
   * il negozio ("Scrivici per la disponibilita") invece di comprare subito.
   * Default true (vedi migration 20260623160000).
   */
  disponibilita_su_richiesta?: boolean;
  /**
   * Articolo disponibile SOLO dal sito, non presente in negozio: badge
   * informativo in vetrina. Default false (vedi migration 20260705120000).
   */
  solo_online?: boolean;
}

/**
 * Una foto della galleria prodotto. `variante_id` opzionale: se valorizzato la
 * foto rappresenta quel colore. La copertina resta `Prodotto.immagine_url`.
 */
export interface ProdottoFoto {
  id: string;
  prodotto_id: string;
  variante_id: string | null;
  /** Colore rappresentato dalla foto (testo, dalla palette). null = generica. */
  colore: string | null;
  url: string;
  /** LQIP (~16px) per placeholder="blur" di next/image. null = placeholder generico. */
  blur_data_url: string | null;
  /** Ordinamento in galleria (ascendente). */
  ordine: number;
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
  motivo?: "non_configurato" | "esaurito" | "errore";
}

/**
 * Stato di avanzamento di un ordine (flusso a pagamento differito):
 * in_attesa  = richiesta inviata, da confermare dal gestore;
 * confermato = disponibilita confermata, in attesa di pagamento;
 * pagato     = pagato; annullato = rifiutato/annullato.
 */
export type StatoOrdine = "in_attesa" | "confermato" | "pagato" | "annullato";

/** Elenco dei valori validi di StatoOrdine (utile per validazione/iterazione). */
export const STATI_ORDINE: readonly StatoOrdine[] = [
  "in_attesa",
  "confermato",
  "pagato",
  "annullato",
];

/** Type guard runtime: vero se `v` e uno StatoOrdine valido. */
export function isStatoOrdine(v: unknown): v is StatoOrdine {
  return typeof v === "string" && (STATI_ORDINE as readonly string[]).includes(v);
}

/** Indirizzo di spedizione scelto dal cliente su Stripe (persistito sull'ordine). */
export interface IndirizzoSpedizione {
  nome: string | null;
  indirizzo: {
    line1: string | null;
    line2: string | null;
    cap: string | null;
    citta: string | null;
    provincia: string | null;
    paese: string | null;
  } | null;
}

/** Un ordine cliente. */
export interface Ordine {
  id: string;
  stato: StatoOrdine;
  /** Totale in centesimi di euro (merce + spedizione, una volta pagato). */
  totale_cents: number;
  /** Costo di spedizione in centesimi, incassato via Stripe. null se ignoto. */
  costo_spedizione_cents: number | null;
  /** Indirizzo di spedizione scelto su Stripe. null finche non pagato. */
  spedizione_indirizzo: IndirizzoSpedizione | null;
  email: string | null;
  /** Dati cliente della richiesta. */
  nome: string | null;
  telefono: string | null;
  note: string | null;
  /** Token segreto per la pagina pubblica /ordine/[token]. */
  token: string | null;
  /** Timestamp ISO 8601 della conferma disponibilita (null se non confermato). */
  confermato_il: string | null;
  stripe_session_id: string | null;
  /** Timestamp ISO 8601 di creazione. */
  creato_il: string;
}

/** Una riga d'ordine (snapshot del prodotto al momento della richiesta). */
export interface OrdineRiga {
  id: string;
  ordine_id: string;
  prodotto_id: string | null;
  variante_id: string | null;
  nome_prodotto: string;
  sku: string | null;
  prezzo_cents: number;
  quantita: number;
  taglia?: string | null;
  colore?: string | null;
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
