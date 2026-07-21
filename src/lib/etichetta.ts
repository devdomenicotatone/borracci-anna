// Etichettatura tessile (M12): la riga standard "Composizione: X." in coda
// alle descrizioni e la convenzione storica dei flussi genera/import. Da qui
// in poi la verita e la colonna `prodotti.composizione`; queste due funzioni
// pure tengono coerenti i mondi:
//   - estraiComposizione: usata dai flussi di creazione (e dal backfill
//     scripts/estrai-composizione.mjs, stessa regex) per valorizzare la colonna
//     dalla descrizione finale;
//   - descrizioneSenzaComposizione: usata dalla PDP per non mostrare due volte
//     la composizione (riga legacy nel testo + voce strutturata).
// Pure e senza dipendenze: importabili da server e client.

/** Riga finale "Composizione: <valore>." (punto opzionale, case-insensitive). */
const RE_COMPOSIZIONE = /(?:^|\n)\s*Composizione:\s*(.+?)\s*\.?\s*$/i;

/** Composizione estratta dalla riga standard in coda al testo; null se assente. */
export function estraiComposizione(testo: string | null | undefined): string | null {
  const m = RE_COMPOSIZIONE.exec(testo ?? "");
  return m ? m[1] : null;
}

/**
 * Descrizione senza la riga legacy "Composizione: ..." in coda (la PDP la
 * mostra come voce dedicata). Il testo resta intatto se la riga non c'e.
 */
export function descrizioneSenzaComposizione(
  testo: string | null | undefined,
): string | null {
  if (!testo) return testo ?? null;
  const ripulito = testo.replace(RE_COMPOSIZIONE, "").trim();
  return ripulito || null;
}
