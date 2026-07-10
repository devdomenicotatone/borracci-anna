import "server-only";

// Embedding dei prodotti per la ricerca semantica (Fase 3 dei temi).
// Due responsabilita:
//   - embeddingOpenAI: la chiamata alle API OpenAI (fetch diretto, nessun SDK
//     in piu), usata anche dal percorso di ricerca (lib/ricerca-semantica);
//   - sincronizzaEmbeddingProdotto: riallinea l'embedding di UN prodotto dopo
//     un salvataggio. Pensata per girare dentro after() (post-risposta): non
//     allunga l'azione del gestore e NON lancia mai — un fallimento logga e
//     basta, lo script di backfill rieseguibile e la rete di sicurezza.
// Il testo embeddato e il suo formato vivono in lib/embedding-testo (modulo
// puro condiviso con lo script di backfill).

import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  DIMENSIONI_EMBEDDING,
  MODELLO_EMBEDDING,
  VERSIONE_MODELLO_EMBEDDING,
  costruisciTestoEmbedding,
} from "@/lib/embedding-testo";

/** Timeout di default: i flussi di scrittura girano post-risposta, possono
 *  aspettare piu della ricerca (che passa il suo, piu stretto). */
const TIMEOUT_SCRITTURA_MS = 8000;

/**
 * Embedding di un testo via API OpenAI (modello e dimensioni di
 * lib/embedding-testo). LANCIA su chiave assente, timeout, HTTP non-ok o
 * risposta malformata: ogni chiamante decide come degradare (la ricerca torna
 * al letterale, la sincronizzazione logga e rinuncia).
 */
export async function embeddingOpenAI(
  input: string,
  opzioni: { timeoutMs?: number } = {},
): Promise<number[]> {
  const chiave = process.env.OPENAI_API_KEY;
  if (!chiave) throw new Error("OPENAI_API_KEY non configurata.");

  const risposta = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${chiave}`,
    },
    body: JSON.stringify({
      model: MODELLO_EMBEDDING,
      dimensions: DIMENSIONI_EMBEDDING,
      input,
    }),
    signal: AbortSignal.timeout(opzioni.timeoutMs ?? TIMEOUT_SCRITTURA_MS),
  });
  if (!risposta.ok) {
    throw new Error(`OpenAI embeddings: HTTP ${risposta.status}`);
  }

  const json = (await risposta.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };
  const embedding = json.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length !== DIMENSIONI_EMBEDDING) {
    throw new Error("OpenAI embeddings: risposta senza vettore valido.");
  }
  return embedding;
}

/**
 * Riallinea l'embedding di ricerca di un prodotto (creato o modificato).
 * SKIP senza chiamata OpenAI se il testo E il modello sono invariati: cosi
 * l'hook e un no-op sui salvataggi che non toccano nome/descrizione/tema
 * (toggle attivo, foto, varianti). Si embeddano anche le BOZZE: alla
 * pubblicazione il prodotto e gia cercabile.
 *
 * NON lancia mai: chiamata da after() nei flussi di scrittura, un errore
 * (OpenAI giu, migration non applicata) non deve sporcare il salvataggio.
 */
export async function sincronizzaEmbeddingProdotto(
  prodottoId: string,
): Promise<void> {
  try {
    // Env assenti (build/anteprima o feature non configurata): no-op silenzioso.
    if (!process.env.OPENAI_API_KEY) return;
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
    const supabase = createAdminSupabase();

    const { data: prodotto, error } = await supabase
      .from("prodotti")
      .select("nome, descrizione, tema")
      .eq("id", prodottoId)
      .maybeSingle();
    if (error) throw error;
    if (!prodotto) return; // eliminato nel frattempo: la CASCADE ha gia pulito

    const testo = costruisciTestoEmbedding(prodotto);

    const { data: esistente, error: erroreLettura } = await supabase
      .from("prodotto_embedding")
      .select("testo, modello")
      .eq("prodotto_id", prodottoId)
      .maybeSingle();
    if (erroreLettura) throw erroreLettura; // es. 42P01: migration non applicata
    if (
      esistente != null &&
      esistente.testo === testo &&
      esistente.modello === VERSIONE_MODELLO_EMBEDDING
    ) {
      return; // invariato: niente chiamata OpenAI
    }

    // Un solo retry: qui non c'e un utente in attesa e un errore transitorio
    // di rete non deve lasciare l'embedding vecchio piu del necessario.
    let embedding: number[];
    try {
      embedding = await embeddingOpenAI(testo);
    } catch {
      embedding = await embeddingOpenAI(testo);
    }

    const { error: erroreUpsert } = await supabase
      .from("prodotto_embedding")
      .upsert({
        prodotto_id: prodottoId,
        embedding: JSON.stringify(embedding),
        testo,
        modello: VERSIONE_MODELLO_EMBEDDING,
        aggiornato_il: new Date().toISOString(),
      });
    if (erroreUpsert) throw erroreUpsert;
  } catch (err) {
    console.warn(
      `[sincronizzaEmbeddingProdotto] embedding non aggiornato per ${prodottoId}:`,
      err,
    );
  }
}
