// Generazione di slug url-friendly (area gestore): per i prodotti e, in forma
// gerarchica dal percorso, per le categorie.

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
 * Slug gerarchico dal percorso di nomi (radice -> ... -> categoria), per un
 * indirizzo leggibile e naturalmente piu univoco (rami diversi => slug diversi).
 * Es. slugGerarchico(["Uomo", "T-shirt", "Anime & Manga"]) => "uomo-t-shirt-anime-manga".
 */
export function slugGerarchico(nomiPercorso: string[]): string {
  return slugify(nomiPercorso.join(" "));
}
