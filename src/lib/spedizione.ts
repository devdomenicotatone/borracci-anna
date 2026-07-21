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

// Tariffa UNICA nazionale (centesimi), modificabile via env senza toccare il
// codice. Decisione della titolare (audit lug 2026, finding 16): su Stripe le
// shipping option sono radio a libera scelta del cliente, quindi con le due
// zone (continentale/isole) chi spediva nelle isole poteva selezionare la
// tariffa continentale piu bassa. Con la tariffa unica il problema sparisce;
// l'eventuale supplemento isole del corriere resta assorbito dal negozio.
const DEFAULT_ITALIA_CENTS = 590; // 5,90 EUR

function leggiTariffaDaEnv(grezzo: string | undefined, fallback: number): number {
  if (!grezzo) return fallback;
  const n = Number.parseInt(grezzo, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// Server-only (niente NEXT_PUBLIC): letta a runtime, non incollata a build-time,
// cosi cambiare il prezzo richiede solo un riavvio, non un rebuild. Usata solo
// lato server (route checkout); sul client vale il default ma non viene usata.
/** Tariffa unica Italia (centesimi). Legge SHIPPING_IT_CENTS; in fallback la
 *  storica SHIPPING_IT_CONTINENTE_CENTS, cosi un env gia configurato resta valido. */
export const SPEDIZIONE_ITALIA_CENTS = leggiTariffaDaEnv(
  process.env.SHIPPING_IT_CENTS ?? process.env.SHIPPING_IT_CONTINENTE_CENTS,
  DEFAULT_ITALIA_CENTS,
);

// Stima di consegna comunicata al cliente (giorni lavorativi). UNICO punto di
// verita: usata sia dalle shipping option Stripe (checkout) sia dalla pagina di
// successo, che prima divergevano (2-5 vs 2-4).
export const CONSEGNA_MIN_GG = 2;
export const CONSEGNA_MAX_GG = 5;

/** Zona di spedizione. "gratuita" = soglia free-shipping raggiunta. */
export type ZonaSpedizione = "italia" | "gratuita";

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
 * SEMPRE una sola opzione (mai una scelta lasciata al cliente): la gratuita
 * sopra soglia, la tariffa unica Italia sotto. Pura (niente IO): unico punto di
 * verita del costo, usabile sia lato server (checkout) sia lato client (stima).
 */
export function opzioniSpedizione(subtotaleCents: number): OpzioneSpedizione[] {
  if (statoSpedizione(subtotaleCents).raggiunta) {
    return [{ zona: "gratuita", etichetta: "Spedizione gratuita", costoCents: 0 }];
  }
  return [
    {
      zona: "italia",
      etichetta: "Spedizione standard (Italia)",
      costoCents: SPEDIZIONE_ITALIA_CENTS,
    },
  ];
}

/**
 * Costo di spedizione (centesimi) per un dato subtotale, con TARIFFA ESPLICITA.
 * La tariffa va passata dal server (SPEDIZIONE_ITALIA_CENTS legge env
 * server-only: sul client varrebbe sempre il default) — cosi il carrello
 * mostra ESATTAMENTE la cifra che Stripe addebitera (finding M3+B6 audit
 * legale). Pura: usabile ovunque.
 */
export function costoSpedizione(
  subtotaleCents: number,
  tariffaCents: number,
): number {
  return statoSpedizione(subtotaleCents).raggiunta ? 0 : tariffaCents;
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
