// Testo da embeddare per la ricerca semantica e identita del modello OpenAI.
// Modulo PURO, senza "server-only": lo importano sia il codice server
// (lib/embeddings, lib/ricerca-semantica) sia lo script di backfill
// (scripts/backfill-embeddings.ts), che gira FUORI da Next con tsx — per
// questo l'import interno e RELATIVO (gli alias "@/" non esistono li) e
// tutta la catena resta priva di dipendenze runtime da Next.

import { etichettaFranchise } from "./franchise";

/** Modello OpenAI degli embedding e dimensioni richieste (param `dimensions`).
 *  text-embedding-3-large e il piu forte sul multilingue (query italiane ->
 *  franchise inglesi); 1536 dimensioni perche l'indice HNSW sul tipo `vector`
 *  regge max 2000 e cosi small/large restano interscambiabili senza toccare
 *  lo schema. */
export const MODELLO_EMBEDDING = "text-embedding-3-large";
export const DIMENSIONI_EMBEDDING = 1536;

/** Identita completa persistita in `prodotto_embedding.modello`: embedding di
 *  modelli (o dimensioni) diversi non sono confrontabili tra loro — cambiare
 *  questa stringa manda "da rifare" tutte le righe al prossimo backfill. */
export const VERSIONE_MODELLO_EMBEDDING = `${MODELLO_EMBEDDING}@${DIMENSIONI_EMBEDDING}`;

/** Cap sulla descrizione: oltre e coda ripetitiva (composizione, lavaggio)
 *  che diluisce il segnale di nome/tema e paga token inutili. */
const MAX_DESCRIZIONE = 600;

/** Etichetta leggibile per un tema fuori dizionario ("death-note" ->
 *  "Death Note"): stessa logica del chip in vetrina, un tema salvato
 *  sopravvive alla rimozione della voce dal dizionario. */
function etichettaTema(slug: string): string {
  return (
    etichettaFranchise(slug) ??
    slug
      .split("-")
      .filter(Boolean)
      .map((p) => p[0].toUpperCase() + p.slice(1))
      .join(" ")
  );
}

/**
 * Il testo che rappresenta un prodotto nello spazio semantico:
 *   "T-shirt Hogwarts Grifondoro. Tema: Harry Potter. Cotone pettinato..."
 * - il tema entra come ETICHETTA (non slug): porta segnale quando il nome non
 *   cita il franchise per esteso;
 * - NIENTE categoria: il tipo di capo e gia nel nome ("T-shirt...", "Felpa...")
 *   e includerla obbligherebbe a re-embeddare anche sui cambi categoria bulk;
 * - taglie/colori/prezzo restano fuori: sono filtri strutturati, non semantica.
 * Cambiare questo formato invalida i testi salvati: il backfill rieseguibile
 * riallinea tutto (ri-embedda solo chi ha `testo` diverso).
 */
export function costruisciTestoEmbedding(prodotto: {
  nome: string;
  descrizione: string | null;
  tema: string | null;
}): string {
  const parti = [prodotto.nome.replace(/\s+/g, " ").trim()];
  if (prodotto.tema) parti.push(`Tema: ${etichettaTema(prodotto.tema)}`);
  const descrizione = (prodotto.descrizione ?? "").replace(/\s+/g, " ").trim();
  if (descrizione) parti.push(descrizione.slice(0, MAX_DESCRIZIONE));
  return parti.join(". ");
}
