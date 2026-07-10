// Backfill (rieseguibile) degli embedding di ricerca semantica del catalogo.
//
// Uso (dalla radice del progetto, richiede la migration 20260711130000):
//   npx tsx --env-file=.env.local scripts/backfill-embeddings.ts [--dry-run] [--force]
//
//   --dry-run  calcola e riporta quanti prodotti andrebbero (ri)embeddati,
//              senza chiamare OpenAI ne scrivere nulla;
//   --force    ri-embedda TUTTO, anche le righe con testo+modello invariati
//              (di norma inutile: serve solo se si sospetta un embedding corrotto).
//
// Gira FUORI da Next (tsx): niente import da moduli "server-only" — il loop a
// blocchi da 1000 (max-rows PostgREST tronca in silenzio, vedi
// lib/supabase/scansione) e la chiamata OpenAI sono replicati qui in versione
// batch. Il testo embeddato e l'identita del modello arrivano dal modulo PURO
// condiviso lib/embedding-testo: app e backfill non possono divergere.
//
// Rieseguibile: salta le righe gia allineate (stesso testo E stesso modello),
// quindi ripara anche i buchi lasciati da un hook di salvataggio fallito o da
// un'esecuzione interrotta. Si embeddano ANCHE le bozze (attivo=false): alla
// pubblicazione il prodotto e gia cercabile.

import { createClient } from "@supabase/supabase-js";

import type { Database } from "../src/lib/supabase/database.types";
import {
  DIMENSIONI_EMBEDDING,
  MODELLO_EMBEDDING,
  VERSIONE_MODELLO_EMBEDDING,
  costruisciTestoEmbedding,
} from "../src/lib/embedding-testo";

/** Blocco di lettura: pari al max-rows di Supabase (default 1000). */
const BLOCCO_LETTURA = 1000;
/** Testi per chiamata OpenAI (il limite API e 2048 input; 128 tiene ogni
 *  richiesta piccola e gli errori circoscritti). */
const BLOCCO_OPENAI = 128;
/** Righe per upsert (URL/body PostgREST contenuti). */
const BLOCCO_UPSERT = 100;
/** Timeout della singola chiamata OpenAI batch. */
const TIMEOUT_OPENAI_MS = 60_000;

interface RigaProdotto {
  id: string;
  nome: string;
  descrizione: string | null;
  tema: string | null;
}

function env(nome: string): string {
  const valore = process.env[nome];
  if (!valore) {
    console.error(
      `Manca ${nome}: lancia con  npx tsx --env-file=.env.local scripts/backfill-embeddings.ts`,
    );
    process.exit(1);
  }
  return valore;
}

/** Embedding batch: un vettore per ogni testo, nello stesso ordine. */
async function embeddingBatch(
  chiave: string,
  testi: string[],
): Promise<number[][]> {
  const risposta = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${chiave}`,
    },
    body: JSON.stringify({
      model: MODELLO_EMBEDDING,
      dimensions: DIMENSIONI_EMBEDDING,
      input: testi,
    }),
    signal: AbortSignal.timeout(TIMEOUT_OPENAI_MS),
  });
  if (!risposta.ok) {
    const corpo = await risposta.text().catch(() => "");
    throw new Error(`OpenAI HTTP ${risposta.status}: ${corpo.slice(0, 300)}`);
  }
  const json = (await risposta.json()) as {
    data?: Array<{ index: number; embedding: number[] }>;
  };
  const righe = json.data ?? [];
  if (righe.length !== testi.length) {
    throw new Error(
      `OpenAI: attesi ${testi.length} embedding, ricevuti ${righe.length}.`,
    );
  }
  const vettori = new Array<number[]>(testi.length);
  for (const r of righe) {
    if (
      !Array.isArray(r.embedding) ||
      r.embedding.length !== DIMENSIONI_EMBEDDING
    ) {
      throw new Error(`OpenAI: vettore malformato all'indice ${r.index}.`);
    }
    vettori[r.index] = r.embedding;
  }
  return vettori;
}

async function main(): Promise<void> {
  const flags = new Set(process.argv.slice(2));
  const dryRun = flags.has("--dry-run");
  const force = flags.has("--force");

  const supabase = createClient<Database>(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const chiaveOpenAI = env("OPENAI_API_KEY");

  // --- 1) Prodotti, a blocchi (il catalogo supera il max-rows di PostgREST) --
  const prodotti: RigaProdotto[] = [];
  for (;;) {
    const { data, error } = await supabase
      .from("prodotti")
      .select("id, nome, descrizione, tema")
      .order("id", { ascending: true })
      .range(prodotti.length, prodotti.length + BLOCCO_LETTURA - 1);
    if (error) throw new Error(`Lettura prodotti: ${error.message}`);
    const blocco = (data ?? []) as RigaProdotto[];
    prodotti.push(...blocco);
    if (blocco.length < BLOCCO_LETTURA) break;
  }

  // --- 2) Embedding esistenti, a blocchi --------------------------------------
  const esistenti = new Map<string, { testo: string; modello: string }>();
  for (;;) {
    const { data, error } = await supabase
      .from("prodotto_embedding")
      .select("prodotto_id, testo, modello")
      .order("prodotto_id", { ascending: true })
      .range(esistenti.size, esistenti.size + BLOCCO_LETTURA - 1);
    if (error) {
      if (error.code === "42P01") {
        console.error(
          "La tabella prodotto_embedding non esiste: applica prima la migration " +
            "20260711130000_ricerca_semantica.sql nel SQL Editor di Supabase.",
        );
        process.exit(1);
      }
      throw new Error(`Lettura prodotto_embedding: ${error.message}`);
    }
    const blocco = data ?? [];
    for (const r of blocco) {
      esistenti.set(r.prodotto_id, { testo: r.testo, modello: r.modello });
    }
    if (blocco.length < BLOCCO_LETTURA) break;
  }

  // --- 3) Cosa va (ri)embeddato ----------------------------------------------
  const daFare = prodotti
    .map((p) => ({ id: p.id, testo: costruisciTestoEmbedding(p) }))
    .filter((p) => {
      if (force) return true;
      const e = esistenti.get(p.id);
      return !(
        e != null &&
        e.testo === p.testo &&
        e.modello === VERSIONE_MODELLO_EMBEDDING
      );
    });

  console.log(
    `Prodotti: ${prodotti.length} | embedding esistenti: ${esistenti.size} | ` +
      `da (ri)embeddare: ${daFare.length} | modello: ${VERSIONE_MODELLO_EMBEDDING}` +
      (force ? " | --force" : ""),
  );
  if (daFare.length === 0) {
    console.log("Tutto gia allineato: niente da fare.");
    return;
  }
  if (dryRun) {
    for (const p of daFare.slice(0, 3)) {
      console.log(`  es. ${p.id}: "${p.testo.slice(0, 100)}..."`);
    }
    console.log("--dry-run: nessuna chiamata OpenAI, nessuna scrittura.");
    return;
  }

  // --- 4) Embedding a batch + upsert a blocchi --------------------------------
  const adesso = new Date().toISOString();
  let fatti = 0;
  for (let i = 0; i < daFare.length; i += BLOCCO_OPENAI) {
    const batch = daFare.slice(i, i + BLOCCO_OPENAI);
    const testi = batch.map((p) => p.testo);

    // Un solo retry per batch: gli errori transitori (rete, 429) di norma
    // rientrano; se persiste si esce con errore, la ri-esecuzione riprende
    // da dove si era arrivati (le righe gia scritte risultano allineate).
    let vettori: number[][];
    try {
      vettori = await embeddingBatch(chiaveOpenAI, testi);
    } catch (err) {
      console.warn(`Batch OpenAI fallito, ritento tra 3s... (${err})`);
      await new Promise((r) => setTimeout(r, 3000));
      vettori = await embeddingBatch(chiaveOpenAI, testi);
    }

    const righe = batch.map((p, j) => ({
      prodotto_id: p.id,
      embedding: JSON.stringify(vettori[j]),
      testo: p.testo,
      modello: VERSIONE_MODELLO_EMBEDDING,
      aggiornato_il: adesso,
    }));
    for (let k = 0; k < righe.length; k += BLOCCO_UPSERT) {
      const { error } = await supabase
        .from("prodotto_embedding")
        .upsert(righe.slice(k, k + BLOCCO_UPSERT));
      if (error) throw new Error(`Upsert embedding: ${error.message}`);
    }

    fatti += batch.length;
    console.log(`  ${fatti}/${daFare.length} embeddati...`);
  }

  console.log(`Fatto: ${fatti} embedding scritti (modello ${VERSIONE_MODELLO_EMBEDDING}).`);
}

main().catch((err) => {
  console.error("Backfill interrotto:", err);
  process.exit(1);
});
