// Politica di spedizione "by Frody".
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
