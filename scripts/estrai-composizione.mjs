// Backfill di prodotti.composizione (M12) dalla riga standard in coda alle
// descrizioni ("Composizione: 100% Cotone."), scritta dai flussi genera/import.
//
// Uso:
//   node scripts/estrai-composizione.mjs            → DRY-RUN: report e campione
//   node scripts/estrai-composizione.mjs --applica  → scrive la colonna
//
// Prudente per costruzione: tocca SOLO composizione (mai la descrizione),
// SOLO dove la colonna è ancora null, e solo se la riga combacia col pattern.
// Legge a blocchi da 1000 (PostgREST tronca oltre).
import { readFileSync } from "node:fs";

const applica = process.argv.includes("--applica");

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((r) => r.includes("=") && !r.startsWith("#"))
    .map((r) => [r.slice(0, r.indexOf("=")).trim(), r.slice(r.indexOf("=") + 1).trim()])
);
const BASE = env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1";
const HEADERS = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  "content-type": "application/json",
};

// Riga finale "Composizione: <valore>." (con o senza punto, case-insensitive).
// Il valore viene ripulito dal punto finale; niente limiti sul contenuto: sono
// stringhe scritte dai nostri stessi flussi ("100% Cotone", "Pvc", ...).
const RE_COMPOSIZIONE = /(?:^|\n)\s*Composizione:\s*(.+?)\s*\.?\s*$/i;

const righe = [];
for (let da = 0; ; da += 1000) {
  const res = await fetch(
    `${BASE}/prodotti?select=id,nome,descrizione,composizione&order=id.asc&limit=1000&offset=${da}`,
    { headers: HEADERS }
  );
  if (!res.ok) {
    console.error("Lettura fallita:", res.status, await res.text());
    process.exit(1);
  }
  const blocco = await res.json();
  righe.push(...blocco);
  if (blocco.length < 1000) break;
}

const daScrivere = [];
let giaValorizzati = 0;
let senzaRiga = 0;
for (const p of righe) {
  if (p.composizione) {
    giaValorizzati++;
    continue;
  }
  const m = RE_COMPOSIZIONE.exec(p.descrizione ?? "");
  if (!m) {
    senzaRiga++;
    continue;
  }
  daScrivere.push({ id: p.id, nome: p.nome, composizione: m[1] });
}

console.log(`prodotti letti: ${righe.length}`);
console.log(`colonna gia valorizzata: ${giaValorizzati}`);
console.log(`senza riga "Composizione:": ${senzaRiga}`);
console.log(`da scrivere: ${daScrivere.length}`);

// Distribuzione dei valori estratti (con conteggio): a colpo d'occhio si vede
// se il pattern ha agganciato robaccia.
const conta = new Map();
for (const r of daScrivere) {
  conta.set(r.composizione, (conta.get(r.composizione) ?? 0) + 1);
}
console.log("\nvalori estratti (distinti):");
[...conta.entries()]
  .sort((a, b) => b[1] - a[1])
  .forEach(([v, n]) => console.log(`  ${String(n).padStart(5)} × ${v}`));

// Niente process.exit sul percorso normale: su Windows l'uscita forzata con
// socket keep-alive ancora aperti puo far scattare un'assertion libuv.
if (!applica) {
  console.log("\nDRY-RUN: nessuna scrittura. Rilancia con --applica per scrivere.");
} else {
  let scritti = 0;
  for (const r of daScrivere) {
    const res = await fetch(`${BASE}/prodotti?id=eq.${r.id}&composizione=is.null`, {
      method: "PATCH",
      headers: HEADERS,
      body: JSON.stringify({ composizione: r.composizione }),
    });
    if (!res.ok) {
      console.error(`scrittura fallita per ${r.id} (${r.nome}):`, res.status);
      continue;
    }
    scritti++;
    if (scritti % 300 === 0) console.log(`  ...${scritti}/${daScrivere.length}`);
  }
  console.log(`\nscritti: ${scritti}/${daScrivere.length}`);
}
