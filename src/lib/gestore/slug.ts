// Generazione di slug url-friendly per i prodotti (area gestore).

/**
 * Converte un testo in uno slug: minuscolo, senza accenti, parole unite da "-".
 * Es. slugify("T-shirt Blu Notte") => "t-shirt-blu-notte".
 */
export function slugify(testo: string): string {
  return testo
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // rimuove i diacritici (accenti)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-") // non-alfanumerico => "-"
    .replace(/^-+|-+$/g, ""); // niente "-" iniziali/finali
}

/**
 * Restituisce lo slug con un suffisso numerico per disambiguarlo.
 * slugConSuffisso("maglia", 1) => "maglia"; (..., 2) => "maglia-2".
 * Utile lato client quando lo slug base risulta gia in uso.
 */
export function slugConSuffisso(slug: string, n: number): string {
  return n <= 1 ? slug : `${slug}-${n}`;
}
