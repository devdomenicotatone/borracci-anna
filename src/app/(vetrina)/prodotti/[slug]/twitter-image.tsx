// La card Twitter/X riusa la stessa immagine Open Graph del prodotto.
// Nota: `runtime` non e re-esportabile (Next lo parsa staticamente); la
// twitter-image usa il default `nodejs`, come la opengraph-image.
export { default, alt, size, contentType } from "./opengraph-image";
