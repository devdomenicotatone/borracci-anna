// Sola lettura: anteprima della correzione "taglie fittizie -> Taglia unica".
// Categorizza i falsi esauriti e mostra cosa cambierebbe, SENZA scrivere.
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
  for (let i = 0; i < s.length; i++) { const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ",") { rec.push(f); f = ""; }
    else if (c === "\r") {} else if (c === "\n") { rec.push(f); out.push(rec); rec = []; f = ""; } else f += c; }
  if (f !== "" || rec.length) { rec.push(f); out.push(rec); } return out;
}
const disp = (s) => { const x = (s ?? "").trim().toLowerCase(); return x !== "" && x !== "no stock" && x !== "out of stock"; };
const eUnica = (t) => (t ?? "").trim().toLowerCase() === "taglia unica";

const righe = parseCsv(readFileSync(CSV, "utf8"));
const H = Object.fromEntries(righe[0].map((h, i) => [h, i]));
const parentInfo = new Map(); // parent -> { standalone, dispon, nRighe }
for (const r of righe.slice(1)) {
  const p = su(r[H.sku_parent]); if (!p) continue;
  const tipo = (r[H.sku_type] ?? "").trim();
  if (tipo !== "Sku Child" && tipo !== "Sku Standalone") continue;
  const info = parentInfo.get(p) ?? { standalone: false, dispon: false, nRighe: 0, typology: "" };
  if (tipo === "Sku Standalone") info.standalone = true;
  if (disp(pu(r[H.stock]))) info.dispon = true;
  if (!info.typology) info.typology = pu(r[H.product_typology]);
  info.nRighe++;
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
const prodotti = await tutte("prodotti", "id, nome, codice, fornitore");
const varianti = await tutte("varianti", "prodotto_id, taglia, colore, stock, sku");
const varPer = new Map();
for (const v of varianti) { if (!varPer.has(v.prodotto_id)) varPer.set(v.prodotto_id, []); varPer.get(v.prodotto_id).push(v); }

const gruppoA = [], gruppoB = [], gruppoC = [];
for (const p of prodotti) {
  if (p.fornitore !== "BLT") continue;
  const vs = varPer.get(p.id) ?? [];
  const tot = vs.reduce((s, v) => s + (v.stock ?? 0), 0);
  if (tot > 0) continue;
  const parent = parentPer(p.codice);
  const info = parent ? parentInfo.get(parent) : null;
  if (!info || !info.dispon) continue; // vero esaurito / fuori CSV
  const tutteUnica = vs.length > 0 && vs.every((v) => eUnica(v.taglia));
  const colori = [...new Set(vs.map((v) => v.colore ?? "(nessuno)"))];
  const riga = { codice: p.codice, nome: p.nome, taglie: vs.map((v) => v.taglia), colori, nVar: vs.length, csvUnaRiga: info.nRighe, typology: info.typology };
  if (info.standalone && !tutteUnica) gruppoA.push(riga);       // palloni: S-XXL -> Taglia unica
  else if (tutteUnica) gruppoB.push(riga);                       // gia unica: fix di match
  else gruppoC.push(riga);                                       // altro
}

console.log(`FALSI ESAURITI CATEGORIZZATI:`);
console.log(`  A) CSV taglia-unica + sito con taglie fittizie  -> CORREGGO a "Taglia unica": ${gruppoA.length}`);
console.log(`  B) sito gia "Taglia unica" (basta il match)                                  : ${gruppoB.length}`);
console.log(`  C) altri casi (taglie vere non combacianti, da guardare)                     : ${gruppoC.length}`);

const perTyp = {};
for (const r of gruppoA) perTyp[r.typology || "(vuota)"] = (perTyp[r.typology || "(vuota)"] || 0) + 1;
console.log(`\n=== GRUPPO A per tipologia CSV ===`);
console.log(Object.entries(perTyp).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join("  |  "));

console.log(`\n===== GRUPPO A — ANTEPRIMA CORREZIONE (${gruppoA.length}) =====`);
for (const r of gruppoA) {
  console.log(`  ${r.codice}  ${r.nome.slice(0,44)}`);
  console.log(`     ora: ${r.nVar} varianti [${r.taglie.join(",")}] colori:${r.colori.join("/")}  ->  1 "Taglia unica" per colore, disponibile`);
}
if (gruppoB.length) {
  console.log(`\n===== GRUPPO B — gia taglia unica, solo da agganciare (${gruppoB.length}) =====`);
  for (const r of gruppoB.slice(0, 15)) console.log(`  ${r.codice}  ${r.nome.slice(0,50)}  colori:${r.colori.join("/")}`);
}
if (gruppoC.length) {
  console.log(`\n===== GRUPPO C — da guardare a mano (${gruppoC.length}) =====`);
  for (const r of gruppoC.slice(0, 20)) console.log(`  ${r.codice}  ${r.nome.slice(0,44)}  taglie:[${r.taglie.join(",")}]`);
}
