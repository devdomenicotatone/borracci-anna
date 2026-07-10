// DIAGNOSI (sola lettura) — quanto combacia il catalogo del sito col CSV BLT?
// Non scrive NULLA: solo SELECT su prodotti/varianti. Usa la service role key
// da .env.local per vedere anche le bozze. Cancellabile dopo l'uso.
//
//   node scripts/diagnosi-match-csv.mjs "C:/percorso/export.csv"

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const CSV = process.argv[2] ?? "C:/Users/dom19/Downloads/export-prodotti_20260707030002.csv";

// --- env da .env.local (senza stampare i segreti) ---------------------------
const env = {};
for (const riga of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Mancano URL o SERVICE_ROLE_KEY in .env.local"); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

// --- normalizzazione taglia (replica leggera di lib/catalogo) ----------------
const ADULTO = new Set(["XXS","XS","S","M","L","XL","2XL","3XL","4XL","5XL","6XL"]);
function normTaglia(grezza) {
  let t = (grezza ?? "").replace(/^="(.*)"$/s, "$1").replace(/\s+/g, " ").trim();
  if (!t) return "";
  let U = t.toUpperCase();
  if (U === "XXL") U = "2XL";
  if (U === "XXXL") U = "3XL";
  if (U === "XXXXL") U = "4XL";
  if (ADULTO.has(U)) return U;
  if (/^(taglia\s*)?unica$|^tu$|^one[\s-]?size$/i.test(t)) return "Taglia unica";
  const anni = U.match(/^(\d{1,2})\s*ANNI$/); if (anni) return `${+anni[1]} anni`;
  const range = t.match(/^(\d{1,2})\s*[-/]\s*(\d{1,2})$/); if (range) return `${+range[1]}-${+range[2]}`;
  const num = t.match(/^(\d{1,2})$/); if (num && +num[1] <= 16) return String(+num[1]);
  return U; // sconosciuta: tieni com'è (uppercase)
}
const su = (s) => (s ?? "").replace(/^="(.*)"$/s, "$1").trim().toUpperCase();

// --- CSV: parent -> taglie ---------------------------------------------------
function parseCsv(s) {
  const out = []; let f = "", rec = [], q = false;
  for (let i = 0; i < s.length; i++) { const c = s[i];
    if (q) { if (c === '"') { if (s[i+1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { rec.push(f); f = ""; }
    else if (c === "\r") {}
    else if (c === "\n") { rec.push(f); out.push(rec); rec = []; f = ""; }
    else f += c;
  }
  if (f !== "" || rec.length) { rec.push(f); out.push(rec); }
  return out;
}
const righe = parseCsv(readFileSync(CSV, "utf8"));
const H = Object.fromEntries(righe[0].map((h, i) => [h, i]));
const csvParentTaglie = new Map(); // PARENT(maiusc) -> Set taglie normalizzate
const csvParentSet = new Set();
for (const r of righe.slice(1)) {
  const parent = su(r[H.sku_parent]);
  if (!parent) continue;
  csvParentSet.add(parent);
  if (!csvParentTaglie.has(parent)) csvParentTaglie.set(parent, new Set());
  const tipo = (r[H.sku_type] ?? "").trim();
  if (tipo === "Sku Child") csvParentTaglie.get(parent).add(normTaglia(r[H.taglia]));
  if (tipo === "Sku Standalone") csvParentTaglie.get(parent).add("Taglia unica");
}
console.log("CSV: prodotti (parent unici):", csvParentSet.size);

// --- DB: scarica prodotti + varianti a blocchi di 1000 -----------------------
async function tutte(tabella, colonne) {
  const acc = [];
  for (let da = 0; ; da += 1000) {
    const { data, error } = await sb.from(tabella).select(colonne).range(da, da + 999);
    if (error) { console.error(`Errore ${tabella}:`, error.message); process.exit(1); }
    acc.push(...data);
    if (data.length < 1000) break;
  }
  return acc;
}
const prodotti = await tutte("prodotti", "id, codice, nome, attivo");
const varianti = await tutte("varianti", "prodotto_id, taglia, sku");
const varPerProdotto = new Map();
for (const v of varianti) {
  if (!varPerProdotto.has(v.prodotto_id)) varPerProdotto.set(v.prodotto_id, []);
  varPerProdotto.get(v.prodotto_id).push(v);
}

// --- Diagnosi ----------------------------------------------------------------
const tot = prodotti.length;
const attivi = prodotti.filter((p) => p.attivo).length;
let senzaCodice = 0, codiceFuoriCsv = 0, matchProdotto = 0;
const esFuori = [], esSenza = [], fuoriCsvTutti = [];
let varTot = 0, varMatchTaglia = 0, varTagliaMancante = 0;
const esTagliaMancante = [];

for (const p of prodotti) {
  const cod = su(p.codice);
  if (!cod) { senzaCodice++; if (esSenza.length < 12) esSenza.push(p.nome); continue; }
  if (!csvParentSet.has(cod)) { codiceFuoriCsv++; fuoriCsvTutti.push(cod); if (esFuori.length < 20) esFuori.push(`${cod}  ${p.nome}`); continue; }
  matchProdotto++;
  const taglieCsv = csvParentTaglie.get(cod) ?? new Set();
  for (const v of varPerProdotto.get(p.id) ?? []) {
    varTot++;
    if (taglieCsv.has(normTaglia(v.taglia))) varMatchTaglia++;
    else { varTagliaMancante++; if (esTagliaMancante.length < 15) esTagliaMancante.push(`${cod} taglia "${v.taglia}" -> "${normTaglia(v.taglia)}" (CSV ha: ${[...taglieCsv].join("/")})`); }
  }
}

console.log("\n=================  CATALOGO DEL SITO  =================");
console.log("prodotti totali:", tot, "| attivi:", attivi, "| bozze:", tot - attivi);
console.log("\n--- match a livello PRODOTTO (codice DB == sku_parent CSV) ---");
console.log("✅ codice trovato nel CSV:", matchProdotto, `(${(matchProdotto/tot*100).toFixed(1)}%)`);
console.log("⚠️  codice presente ma NON nel CSV:", codiceFuoriCsv);
console.log("❌ senza codice (non agganciabili per codice):", senzaCodice);
if (esSenza.length) console.log("   es. senza codice:", esSenza.join(" | "));
if (esFuori.length) console.log("   es. codice fuori CSV:\n   " + esFuori.join("\n   "));

console.log("\n--- match a livello VARIANTE/taglia (sui prodotti agganciati) ---");
console.log("varianti totali (dei prodotti agganciati):", varTot);
console.log("✅ taglia presente nel CSV:", varMatchTaglia);
console.log("⚠️  taglia NON trovata nel CSV per quel prodotto:", varTagliaMancante);
if (esTagliaMancante.length) console.log("   es.:\n   " + esTagliaMancante.join("\n   "));

console.log("\n--- quanto del fornitore NON tratti ---");
const codiciDb = new Set(prodotti.map((p) => su(p.codice)).filter(Boolean));
let parentNonTuoi = 0;
for (const p of csvParentSet) if (!codiciDb.has(p)) parentNonTuoi++;
console.log("prodotti del CSV che NON hai a catalogo (da ignorare nel sync):", parentNonTuoi, `su ${csvParentSet.size}`);

// --- I 102 "codici fuori CSV": quanti sono schede recuperabili? --------------
// Provo a normalizzare il codice togliendo suffissi aggiunti dal sito: "-B"
// (split bambino), una "B" finale, e ri-provo il match sul CSV.
let recupBmeno = 0, recupAltro = 0, orfaniVeri = 0;
const esOrfani = [];
const varianti2 = (c) => c.replace(/-B$/,"").replace(/B$/,"");
for (const cod of fuoriCsvTutti) {
  if (cod.endsWith("-B") && csvParentSet.has(cod.slice(0, -2))) { recupBmeno++; continue; }
  if (csvParentSet.has(varianti2(cod))) { recupAltro++; continue; }
  orfaniVeri++; if (esOrfani.length < 25) esOrfani.push(cod);
}
console.log("\n--- dei", codiceFuoriCsv, "codici fuori CSV ---");
console.log("recuperabili togliendo '-B' (schede bambino splittate):", recupBmeno);
console.log("recuperabili con altra normalizzazione:", recupAltro);
console.log("orfani veri (nessun match nemmeno normalizzando):", orfaniVeri);
console.log("   es. orfani veri:", esOrfani.join(" | "));
