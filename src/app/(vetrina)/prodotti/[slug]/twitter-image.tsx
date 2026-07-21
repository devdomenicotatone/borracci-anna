// La card Twitter/X riusa la stessa immagine Open Graph del prodotto.
// Nota: `runtime` e `revalidate` non sono re-esportabili (Next li parsa
// staticamente): il runtime usa il default `nodejs` come la opengraph-image,
// la cache ISR va dichiarata QUI (stesso giorno della gemella OG: senza, ogni
// scrape rigenerava la card da zero — audit SEO 2026-07).
export const revalidate = 86400;
export { default, alt, size, contentType } from "./opengraph-image";
