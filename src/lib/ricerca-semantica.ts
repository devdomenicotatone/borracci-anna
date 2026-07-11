import "server-only";

// Percorso SEMANTICO della ricerca vetrina (Fase 3 dei temi): la query
// dell'utente diventa un embedding OpenAI e la RPC pgvector
// ricerca_semantica_catalogo (migration 20260711130000) torna gli id dei
// prodotti attivi piu vicini per significato ("felpa uomo ragno" ->
// Spider-Man). Lo usa lib/vetrina come FALLBACK INTEGRATIVO quando il
// letterale trova meno di SOGLIA_FALLBACK_SEMANTICO risultati: zero
// costi/latenza sulle ricerche gia buone.
//
// DEGRADA SEMPRE: qualsiasi guasto (chiave assente, timeout OpenAI, migration
// non applicata) ritorna null e la vetrina resta sul solo letterale.

import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { embeddingOpenAI } from "@/lib/embeddings";
import { VERSIONE_MODELLO_EMBEDDING } from "@/lib/embedding-testo";

type Supabase = SupabaseClient<Database>;

/** Sotto quanti risultati letterali scatta il percorso semantico. 8 = una
 *  riga abbondante di griglia: bastano pochi match letterali perche la
 *  ricerca sia "riuscita" e non valga un giro OpenAI; 0-7 sono le ricerche
 *  povere o rotte ("uomo ragno") che il semantico deve salvare. */
export const SOGLIA_FALLBACK_SEMANTICO = 8;

/** Query minima (caratteri) per pagare un embedding: sotto e digitazione. */
const MIN_CHAR_SEMANTICA = 3;

/** Candidati chiesti alla RPC: generosi, perche i filtri correnti (taglie,
 *  colori, prezzo, tema, categoria) si applicano DOPO, sulle card. */
const LIMITE_CANDIDATI = 200;

/** Distanza coseno massima (0 = identico). Tarata sul catalogo reale
 *  (2026-07-11, 3-large@1536): i match buoni stanno a 0.29-0.57 ("felpa uomo
 *  ragno"->Felpa Spiderman 0.29, "maglia del mago con gli occhiali"->Harry
 *  Potter 0.43-0.50, refusi 0.52-0.57), il rumore parte da 0.72 (query senza
 *  match reali). 0.65 = centro del gap: tiene i refusi, esclude la coda a
 *  caso. Se si cambia modello va ritarata. */
const MAX_DISTANZA = 0.65;

/** Timeout OpenAI sul percorso di ricerca: oltre, meglio il solo letterale. */
const TIMEOUT_RICERCA_MS = 2500;

/** Un embedding e funzione pura di (modello, testo): cache lunga. */
const REVALIDATE_EMBEDDING_S = 60 * 60 * 24 * 7;

/** Chiave di cache e testo embeddato coincidono: normalizzazione leggera
 *  (spazi e maiuscole) cosi "Uomo  Ragno" e "uomo ragno" pagano 1 embedding. */
function normalizzaQuery(q: string): string {
  return q.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Embedding della query, cachato cross-request (unstable_cache, la
 * convenzione del repo: facette, correlati). Dentro la cache si LANCIA su
 * errore: un fallimento transitorio non deve occupare l'entry (stesso
 * ragionamento di aggregaFacette); a degradare ci pensa il chiamante.
 */
function embeddingQueryCached(testo: string): Promise<number[]> {
  const cached = unstable_cache(
    () => embeddingOpenAI(testo, { timeoutMs: TIMEOUT_RICERCA_MS }),
    ["embedding-ricerca", VERSIONE_MODELLO_EMBEDDING, testo],
    { revalidate: REVALIDATE_EMBEDDING_S },
  );
  return cached();
}

export interface CandidatoSemantico {
  id: string;
  /** Distanza coseno dalla query (0 = identico): e l'ordine di pertinenza. */
  distanza: number;
}

/**
 * Gli id dei prodotti ATTIVI semanticamente vicini a `q`, ordinati per
 * pertinenza (RPC SECURITY INVOKER: vale la RLS del client passato).
 * `null` = percorso non disponibile (chiave assente, query troppo corta,
 * OpenAI giu, migration non applicata): il chiamante resta sul letterale.
 * `[]` = infrastruttura ok ma nessun match sopra soglia.
 */
export async function cercaIdSemantici(
  supabase: Supabase,
  q: string,
): Promise<CandidatoSemantico[] | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  const testo = normalizzaQuery(q);
  if (testo.length < MIN_CHAR_SEMANTICA) return null;

  try {
    const embedding = await embeddingQueryCached(testo);
    const { data, error } = await supabase.rpc("ricerca_semantica_catalogo", {
      p_embedding: JSON.stringify(embedding),
      p_limite: LIMITE_CANDIDATI,
      p_max_distanza: MAX_DISTANZA,
    });
    // PGRST202/42883 (RPC assente) e 42P01 (tabella assente) = migration non
    // ancora applicata: stesso degrado di ogni altro errore, senza log rumorosi.
    if (error) return null;
    return data ?? [];
  } catch {
    return null;
  }
}
