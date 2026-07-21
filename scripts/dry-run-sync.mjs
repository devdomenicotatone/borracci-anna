// DRY-RUN (sola lettura) — cosa cambierebbe applicando il CSV di oggi?
// Non scrive NULLA. Confronta lo stock attuale delle varianti col semaforo BLT.
//   node scripts/dry-run-sync.mjs "C:/percorso/export.csv"

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const CSV = process.argv[2] ?? "C:/Users/dom19/Downloads/export-prodotti_20260707030002.csv";

const env = {};
for (const riga of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ADULTO = new Set(["XXS","XS","S","M","L","XL","2XL","3XL","4XL","5XL","6XL"]);
function normTaglia(grezza) {
  let t = (grezza ?? "").replace(/^="(.*)"$/s, "$1").replace(/\s+/g, " ").trim();
  if (!t) return "";
  let U = t.toUpperCase();
  if (U === "XXL") U = "2XL"; if (U === "XXXL") U = "3XL"; if (U === "XXXXL") U = "4XL";
  if (ADULTO.has(U)) return U;
  if (/^(taglia\s*)?unica$|^tu$|^one[\s-]?size$/i.test(t)) return "Taglia unica";
  const anni = U.match(/^(\d{1,2})\s*ANNI$/); if (anni) return `${+anni[1]} anni`;
  const range = t.match(/^(\d{1,2})\s*[-/]\s*(\d{1,2})$/); if (range) return `${+range[1]}-${+range[2]}`;
  const num = t.match(/^(\d{1,2})$/); if (num && +num[1] <= 16) return String(+num[1]);
  return U;
}
const su = (s) => (s ?? "").replace(/^="(.*)"$/s, "$1").trim().toUpperCase();
const pu = (s) => (s ?? "").replace(/^="(.*)"$/s, "$1").trim();

function parseCsv(s) {
  const out = []; let f = "", rec = [], q = false;
  for (let i = 0; i < s.length; i++) { const c = s[i];
    if (q) { if (c === '"') { if (s[i+1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ",") { rec.push(f); f = ""; }
    else if (c === "\r") {} else if (c === "\n") { rec.push(f); out.push(rec); rec = []; f = ""; } else f += c;
  }
  if (f !== "" || rec.length) { rec.push(f); out.push(rec); }
  return out;
}
const righe = parseCsv(readFileSync(CSV, "utf8"));
const H = Object.fromEntries(righe[0].map((h, i) => [h, i]));

// (parent, tagliaNorm) -> { semaforo, prezzoIngrossoCents }
const csvMap = new Map();
const chiave = (p, t) => `${p}||${t}`;
for (const r of righe.slice(1)) {
  const tipo = (r[H.sku_type] ?? "").trim();
  const parent = su(r[H.sku_parent]);
  if (!parent) continue;
  let taglia, semaforo;
  if (tipo === "Sku Child") { taglia = normTaglia(r[H.taglia]); semaforo = pu(r[H.stock]); }
  else if (tipo === "Sku Standalone") { taglia = "Taglia unica"; semaforo = pu(r[H.stock]); }
  else continue; // Sku Parent: riga riassuntiva, niente stock
  const prezzo = Math.round(Number(pu(r[H.price]).replace(/\./g, "").replace(",", ".")) * 100) || null;
  csvMap.set(chiave(parent, taglia), { semaforo, prezzoIngrossoCents: prezzo });
}
const csvParentSet = new Set([...csvMap.keys()].map((k) => k.split("||")[0]));

// Match codice DB -> parent CSV (gestisce lo split bambino "-B")
function parentPerCodice(cod) {
  if (csvParentSet.has(cod)) return cod;
  if (cod.endsWith("-B") && csvParentSet.has(cod.slice(0, -2))) return cod.slice(0, -2);
  return null;
}
// "No stock" -> esaurito; "In/Low stock" -> disponibile (scelta: Disponibile/Esaurito)
const disponibile = (semaforo) => semaforo !== "No stock" && semaforo !== "" && semaforo != null;

async function tutte(tab, col) {
  const acc = [];
  for (let da = 0; ; da += 1000) {
    const { data, error } = await sb.from(tab).select(col).range(da, da + 999);
    if (error) { console.error(error.message); process.exit(1); }
    acc.push(...data); if (data.length < 1000) break;
  }
  return acc;
}
const prodotti = await tutte("prodotti", "id, codice, nome, attivo");
const varianti = await tutte("varianti", "prodotto_id, taglia, stock");
const codicePerId = new Map(prodotti.map((p) => [p.id, su(p.codice)]));

let analizzate = 0, senzaRiscontro = 0;
let siAccende = 0, siSpegne = 0, invariato = 0;
let attualeDisp = 0, attualeEsaur = 0;
const esAccende = [], esSpegne = [];
for (const v of varianti) {
  const cod = codicePerId.get(v.prodotto_id);
  if (!cod) continue;
  const parent = parentPerCodice(cod);
  if (!parent) continue; // prodotto non nel CSV (i 5 casi)
  const info = csvMap.get(chiave(parent, normTaglia(v.taglia)));
  analizzate++;
  if (v.stock > 0) attualeDisp++;
  else attualeEsaur++;
  if (!info) { senzaRiscontro++; continue; }
  const dTarget = disponibile(info.semaforo);
  const dAttuale = v.stock > 0;
  if (dTarget && !dAttuale) { siAccende++; if (esAccende.length < 5) esAccende.push(`${cod} ${v.taglia}`); }
  else if (!dTarget && dAttuale) { siSpegne++; if (esSpegne.length < 10) esSpegne.push(`${cod} ${v.taglia}`); }
  else invariato++;
}

console.log("========  DRY-RUN SYNC GIACENZA (nessuna scrittura)  ========");
console.log("varianti dei tuoi prodotti agganciate al CSV:", analizzate);
console.log("  stato ATTUALE sul sito → disponibili:", attualeDisp, "| esaurite:", attualeEsaur);
console.log("\ncosa farebbe il sync:");
console.log("  🟢 tornerebbero DISPONIBILI (ora 0, CSV ok):", siAccende, esAccende.length ? `  es. ${esAccende.join(", ")}` : "");
console.log("  🔴 diventerebbero ESAURITE (ora >0, CSV No stock):", siSpegne, esSpegne.length ? `  es. ${esSpegne.join(", ")}` : "");
console.log("  ⚪ invariate:", invariato);
console.log("  ❓ senza riscontro nel CSV (taglia assente, da rivedere):", senzaRiscontro);
