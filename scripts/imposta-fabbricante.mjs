// Impostazione BULK di prodotti.fabbricante (M13, GPSR) per fornitore.
// Pensato per la titolare: quando ha i dati legali del fabbricante (nome,
// indirizzo postale, email — MAI inventarli), un solo comando li applica a
// tutti i prodotti di quel fornitore che ne sono ancora privi.
//
// Uso:
//   node scripts/imposta-fabbricante.mjs BLT "Nome S.r.l. | Via Esempio 1, 00100 Roma (IT) | info@esempio.it"
//     → DRY-RUN: mostra quanti prodotti verrebbero aggiornati
//   node scripts/imposta-fabbricante.mjs BLT "..." --applica
//     → scrive (solo dove fabbricante e ancora null: i valori gia compilati
//       a mano NON vengono toccati)
//
// I " | " nel testo diventano a-capo (la PDP mostra il campo multiriga).
import { readFileSync } from "node:fs";

const [fornitore, testoGrezzo] = process.argv.slice(2);
const applica = process.argv.includes("--applica");

if (!fornitore || !testoGrezzo) {
  console.error(
    'Uso: node scripts/imposta-fabbricante.mjs <fornitore> "<nome | indirizzo | email>" [--applica]',
  );
  process.exit(1);
}

const testo = testoGrezzo
  .split("|")
  .map((r) => r.trim())
  .filter(Boolean)
  .join("\n");

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

const filtro = `fornitore=eq.${encodeURIComponent(fornitore)}&fabbricante=is.null`;
const conta = await fetch(`${BASE}/prodotti?select=id&${filtro}`, {
  method: "HEAD",
  headers: { ...HEADERS, prefer: "count=exact" },
});
const totale = Number(conta.headers.get("content-range")?.split("/")[1] ?? 0);

console.log(`fornitore: ${fornitore}`);
console.log(`fabbricante da impostare:\n---\n${testo}\n---`);
console.log(`prodotti senza fabbricante: ${totale}`);

// Niente process.exit sul percorso normale: su Windows l'uscita forzata con
// socket keep-alive ancora aperti puo far scattare un'assertion libuv.
if (!applica) {
  console.log("\nDRY-RUN: nessuna scrittura. Rilancia con --applica per scrivere.");
} else {
  const res = await fetch(`${BASE}/prodotti?${filtro}`, {
    method: "PATCH",
    headers: { ...HEADERS, prefer: "count=exact" },
    body: JSON.stringify({ fabbricante: testo }),
  });
  if (!res.ok) {
    console.error("Scrittura fallita:", res.status, await res.text());
    process.exitCode = 1;
  } else {
    console.log(`\naggiornati: ${res.headers.get("content-range")}`);
  }
}
