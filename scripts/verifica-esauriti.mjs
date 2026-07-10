// Sola lettura: dopo l'accensione della vendita diretta, quali prodotti BLT
// appaiono ESAURITI pur essendo disponibili nel CSV? (taglie fittizie S-XXL).
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const CSV = process.argv[2] ?? "C:/Users/dom19/Downloads/export-prodotti_20260707030002.csv";
const env = {};
for (const r of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = r.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const su = (s) => (s ?? "").replace(/^="([\s\S]*)"$/, "$1").trim().toUpperCase();
const pu = (s) => (s ?? "").replace(/^="([\s\S]*)"$/, "$1").trim();

function parseCsv(s) {
  const out = []; let f = "", rec = [], q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { rec.push(f); f = ""; }
    else if (c === "\r") { /* skip */ }
    else if (c === "\n") { rec.push(f); out.push(rec); rec = []; f = ""; }
    else f += c;
  }
  if (f !== "" || rec.length) { rec.push(f); out.push(rec); }
  return out;
}

const ADULTO = new Set(["XXS","XS","S","M","L","XL","2XL","3XL","4XL","5XL","6XL"]);
function normTaglia(g) {
  let t = pu(g).replace(/\s+/g, " ").trim(); if (!t) return "";
  let U = t.toUpperCase();
  if (U === "XXL") U = "2XL"; if (U === "XXXL") U = "3XL"; if (U === "XXXXL") U = "4XL";
  if (ADULTO.has(U)) return U;
  if (/^(taglia\s*)?unica$|^tu$|^one[\s-]?size$/i.test(t)) return "Taglia unica";
  const a = U.match(/^(\d{1,2})\s*ANNI$/); if (a) return `${+a[1]} anni`;
  const r = t.match(/^(\d{1,2})\s*[-/]\s*(\d{1,2})$/); if (r) return `${+r[1]}-${+r[2]}`;
  const n = t.match(/^(\d{1,2})$/); if (n && +n[1] <= 16) return String(+n[1]);
  return U;
}
const disp = (s) => { const x = (s ?? "").trim().toLowerCase(); return x !== "" && x !== "no stock" && x !== "out of stock"; };

// CSV: parent -> { standalone, qualcheTagliaDisponibile }
const righe = parseCsv(readFileSync(CSV, "utf8"));
const H = Object.fromEntries(righe[0].map((h, i) => [h, i]));
const parentInfo = new Map();
for (const r of righe.slice(1)) {
  const p = su(r[H.sku_parent]); if (!p) continue;
  const tipo = (r[H.sku_type] ?? "").trim();
  if (tipo !== "Sku Child" && tipo !== "Sku Standalone") continue;
  const info = parentInfo.get(p) ?? { standalone: false, dispon: false };
  if (tipo === "Sku Standalone") info.standalone = true;
  if (disp(pu(r[H.stock]))) info.dispon = true;
  parentInfo.set(p, info);
}
const parentPer = (cod) => { const c = su(cod); if (parentInfo.has(c)) return c; if (c.endsWith("-B") && parentInfo.has(c.slice(0,-2))) return c.slice(0,-2); return null; };

async function tutte(tab, col) {
  const acc = [];
  for (let da = 0; ; da += 1000) {
    const { data, error } = await sb.from(tab).select(col).range(da, da + 999);
    if (error) { console.error(tab, error.message); process.exit(1); }
    acc.push(...data); if (data.length < 1000) break;
  }
  return acc;
}
const prodotti = await tutte("prodotti", "id, nome, codice, fornitore, disponibilita_su_richiesta");
const varianti = await tutte("varianti", "prodotto_id, taglia, stock");
const varPer = new Map();
for (const v of varianti) { if (!varPer.has(v.prodotto_id)) varPer.set(v.prodotto_id, []); varPer.get(v.prodotto_id).push(v); }

// Conferma vendita diretta
let diretta = 0, richiesta = 0;
for (const p of prodotti) (p.disponibilita_su_richiesta ? richiesta++ : diretta++);
console.log(`disponibilita: vendita diretta=${diretta} | su richiesta=${richiesta}`);

// Falsi esauriti: prodotto BLT, stock totale 0, ma CSV lo dà disponibile
let falsiEsauriti = 0, veriEsauriti = 0, ok = 0;
const esempi = [];
for (const p of prodotti) {
  if (p.fornitore !== "BLT") continue;
  const vs = varPer.get(p.id) ?? [];
  const tot = vs.reduce((s, v) => s + (v.stock ?? 0), 0);
  if (tot > 0) { ok++; continue; }
  const parent = parentPer(p.codice);
  const info = parent ? parentInfo.get(parent) : null;
  if (info && info.dispon) {
    falsiEsauriti++;
    if (esempi.length < 20) {
      const taglieSito = vs.map((v) => v.taglia).join(",");
      esempi.push(`${p.codice}  ${p.nome.slice(0,40)}  | sito:[${taglieSito}] ${info.standalone ? "| CSV=taglia unica" : ""}`);
    }
  } else veriEsauriti++;
}
console.log(`\nprodotti BLT disponibili (stock>0): ${ok}`);
console.log(`⚠️  FALSI esauriti (stock 0 ma CSV disponibile): ${falsiEsauriti}`);
console.log(`   veri esauriti (CSV No stock o fuori CSV): ${veriEsauriti}`);
console.log(`\nesempi di falsi esauriti:\n` + esempi.join("\n"));
