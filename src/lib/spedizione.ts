// Politica di spedizione "Borracci Anna".
// Soglia per la spedizione gratuita: UNICO punto di verita, modificabile qui
// (o via env NEXT_PUBLIC_FREE_SHIPPING_CENTS, in centesimi). Default 89,00 EUR.
// Usato dalla progress bar nel carrello e nel mini-cart per spingere l'AOV.

const DEFAULT_SOGLIA_CENTS = 8900;

function leggiSogliaDaEnv(): number {
  const grezzo = process.env.NEXT_PUBLIC_FREE_SHIPPING_CENTS;
  if (!grezzo) return DEFAULT_SOGLIA_CENTS;
  const n = Number.parseInt(grezzo, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_SOGLIA_CENTS;
}

/** Soglia (in centesimi) oltre la quale la spedizione e gratuita. */
export const SOGLIA_SPEDIZIONE_GRATUITA_CENTS = leggiSogliaDaEnv();

// Tariffe per zona (centesimi), modificabili via env senza toccare il codice.
// Valori di partenza da confermare col preventivo reale dell'aggregatore.
const DEFAULT_CONTINENTE_CENTS = 590; // 5,90 EUR
const DEFAULT_ISOLE_CENTS = 890; // 8,90 EUR

function leggiTariffaDaEnv(grezzo: string | undefined, fallback: number): number {
  if (!grezzo) return fallback;
  const n = Number.parseInt(grezzo, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// Server-only (niente NEXT_PUBLIC): lette a runtime, non incollate a build-time,
// cosi cambiare il prezzo richiede solo un riavvio, non un rebuild. Usate solo
// lato server (route checkout); sul client questi const valgono il default ma non
// vengono mai usati (la UI non mostra ancora la tariffa per zona).
/** Tariffa Italia continentale (centesimi). */
export const SPEDIZIONE_CONTINENTE_CENTS = leggiTariffaDaEnv(
  process.env.SHIPPING_IT_CONTINENTE_CENTS,
  DEFAULT_CONTINENTE_CENTS,
);

/** Tariffa isole e aree disagiate (centesimi). */
export const SPEDIZIONE_ISOLE_CENTS = leggiTariffaDaEnv(
  process.env.SHIPPING_IT_ISOLE_CENTS,
  DEFAULT_ISOLE_CENTS,
);

// Stima di consegna comunicata al cliente (giorni lavorativi). UNICO punto di
// verita: usata sia dalle shipping option Stripe (checkout) sia dalla pagina di
// successo, che prima divergevano (2-5 vs 2-4).
export const CONSEGNA_MIN_GG = 2;
export const CONSEGNA_MAX_GG = 5;

/** Zona di spedizione (Italia). "gratuita" = soglia free-shipping raggiunta. */
export type ZonaSpedizione = "continentale" | "isole" | "gratuita";

/** Un'opzione di spedizione offerta al cliente al checkout. */
export interface OpzioneSpedizione {
  zona: ZonaSpedizione;
  /** Etichetta mostrata al cliente (es. radio button su Stripe Checkout). */
  etichetta: string;
  /** Costo in centesimi (0 = gratis). */
  costoCents: number;
}

/**
 * Opzioni di spedizione da offrire al checkout per un dato subtotale (centesimi).
 * Sopra la soglia di spedizione gratuita ritorna una sola opzione a 0 EUR;
 * altrimenti le due zone Italia (continentale / isole-aree disagiate), tra cui
 * il cliente sceglie su Stripe. Pura (niente IO): unico punto di verita del
 * costo, usabile sia lato server (checkout) sia lato client (stima).
 */
export function opzioniSpedizione(subtotaleCents: number): OpzioneSpedizione[] {
  if (statoSpedizione(subtotaleCents).raggiunta) {
    return [{ zona: "gratuita", etichetta: "Spedizione gratuita", costoCents: 0 }];
  }
  return [
    {
      zona: "continentale",
      etichetta: "Italia continentale",
      costoCents: SPEDIZIONE_CONTINENTE_CENTS,
    },
    {
      zona: "isole",
      etichetta: "Isole e aree disagiate",
      costoCents: SPEDIZIONE_ISOLE_CENTS,
    },
  ];
}

export interface StatoSpedizione {
  /** Soglia in centesimi. */
  sogliaCents: number;
  /** Quanto manca alla soglia, in centesimi (0 se gia raggiunta). */
  mancanteCents: number;
  /** True se il subtotale ha raggiunto la soglia. */
  raggiunta: boolean;
  /** Avanzamento verso la soglia, 0..100. */
  percentuale: number;
}

/**
 * Calcola lo stato della spedizione gratuita dato un subtotale (in centesimi).
 * Pura (niente IO): usabile sia lato server sia lato client.
 */
export function statoSpedizione(subtotaleCents: number): StatoSpedizione {
  const sogliaCents = SOGLIA_SPEDIZIONE_GRATUITA_CENTS;
  const sub = Math.max(0, subtotaleCents);
  const mancanteCents = Math.max(0, sogliaCents - sub);
  const raggiunta = sub >= sogliaCents;
  const percentuale =
    sogliaCents > 0 ? Math.min(100, Math.round((sub / sogliaCents) * 100)) : 100;
  return { sogliaCents, mancanteCents, raggiunta, percentuale };
}
