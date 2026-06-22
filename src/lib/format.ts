// Formattazione di valori per la UI italiana.

/**
 * Formatta un prezzo espresso in centesimi nel formato italiano.
 * Es. formatPrezzo(2999) => "29,99 €".
 *
 * @param cents prezzo in centesimi (intero)
 * @param valuta codice ISO 4217 (default "EUR")
 */
export function formatPrezzo(cents: number, valuta: string = "EUR"): string {
  const euro = cents / 100;
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: valuta,
  }).format(euro);
}
