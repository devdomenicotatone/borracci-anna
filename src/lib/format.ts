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

/**
 * Converte un prezzo inserito in euro (stringa) nei centesimi interi.
 * Tollerante agli input reali da tastiera/telefono: "29,99", "29.99",
 * "€ 1.299,00", ",99", ".5". Evita gli errori di virgola mobile di `* 100`.
 *
 * @returns i centesimi (intero) oppure null se l'input non e un importo valido.
 */
export function parsePrezzoCents(input: string): number | null {
  // Rimuove il simbolo euro e qualunque spazio. In JavaScript la classe `\s`
  // copre anche gli spazi unicode usati da Intl (NBSP U+00A0 e narrow-NBSP
  // U+202F), quindi un prezzo formattato e reincollato viene comunque parsato.
  let s = input.trim().replace(/[€\s]/g, "");
  if (!s) return null;

  // Se sono presenti sia "." che ",", l'ultimo separatore e il decimale;
  // gli altri sono separatori delle migliaia e vanno rimossi.
  const ultimaVirgola = s.lastIndexOf(",");
  const ultimoPunto = s.lastIndexOf(".");
  if (ultimaVirgola > -1 && ultimoPunto > -1) {
    const dec = Math.max(ultimaVirgola, ultimoPunto);
    s = s.slice(0, dec).replace(/[.,]/g, "") + "." + s.slice(dec + 1);
  } else {
    s = s.replace(",", ".");
  }

  if (s.startsWith(".")) s = "0" + s; // ".5" => "0.5"
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;

  const cents = Math.round(Number.parseFloat(s) * 100);
  return Number.isFinite(cents) ? cents : null;
}
