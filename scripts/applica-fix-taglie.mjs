// Correzione palloni (gruppo A): sostituisce le taglie fittizie S-XXL con una
// sola "Taglia unica" disponibile, per colore. SCRIVE solo con argomento APPLICA.
//   node scripts/applica-fix-taglie.mjs            -> prova a vuoto
//   node scripts/applica-fix-taglie.mjs APPLICA    -> scrive
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APPLICA = process.argv.includes("APPLICA");
const CSV = "C:/Users/dom19/Downloads/export-prodotti_20260707030002.csv";
const env = {};
for (const r of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = r.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const su = (s) => (s ?? "").replace(/^="([\s\S]*)"$/, "$1").trim().toUpperCase();
const pu = (s) => (s ?? "").replace(/^="([\s\S]*)"$/, "$1").trim();
const slugify = (s) => (s ?? "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const eUnica = (t) => (t ?? "").trim().toLowerCase() === "taglia unica";
const disp = (s) => { const x = (s ?? "").trim().toLowerCase(); return x !== "" && x !== "no stock" && x !== "out of stock"; };
function parseCsv(s) {
  const out = []; let f = "", rec = [], q = false;
  for (let i = 0; i < s.length; i++) { const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ",") { rec.push(f); f = ""; }
    else if (c === "\r") {} else if (c === "\n") { rec.push(f); out.push(rec); rec = []; f = ""; } else f += c; }
  if (f !== "" || rec.length) { rec.push(f); out.push(rec); } return out;
}
const righe = parseCsv(readFileSync(CSV, "utf8"));
const H = Object.fromEntries(righe[0].map((h, i) => [h, i]));
const parentInfo = new Map();
for (const r of righe.slice(1)) {
  const p = su(r[H.sku_parent]); if (!p) continue;
  const tipo = (r[H.sku_type] ?? "").trim();
  if (tipo !== "Sku Child" && tipo !== "Sku Standalone") continue;
  const info = parentInfo.get(p) ?? { standalone: false, dispon: false, typology: "" };
  if (tipo === "Sku Standalone") info.standalone = true;
  if (disp(pu(r[H.stock]))) info.dispon = true;
  if (!info.typology) info.typology = pu(r[H.product_typology]);
  parentInfo.set(p, info);
}
const parentPer = (cod) => { const c = su(cod); if (parentInfo.has(c)) return c; if (c.endsWith("-B") && parentInfo.has(c.slice(0, -2))) return c.slice(0, -2); return null; };

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
const varianti = await tutte("varianti", "id, prodotto_id, taglia, colore, stock, sku");
const varPer = new Map();
for (const v of varianti) { if (!varPer.has(v.prodotto_id)) varPer.set(v.prodotto_id, []); varPer.get(v.prodotto_id).push(v); }

let corretti = 0, varianteAggiornate = 0, eliminate = 0, errori = 0;
for (const p of prodotti) {
  if (p.fornitore !== "BLT") continue;
  const vs = varPer.get(p.id) ?? [];
  const tot = vs.reduce((s, v) => s + (v.stock ?? 0), 0);
  if (tot > 0) continue;
  const parent = parentPer(p.codice);
  const info = parent ? parentInfo.get(parent) : null;
  if (!info || !info.dispon) continue;
  const tutteUnica = vs.length > 0 && vs.every((v) => eUnica(v.taglia));
  // Solo palloni: taglia-unica veri. Esclude T-Shirt/Felpe "box" (confezioni)
  // che nel CSV sono standalone ma vanno vendute con le loro taglie.
  if (!(info.standalone && !tutteUnica && info.typology === "Palloni")) continue;

  // Raggruppa per colore
  const perColore = new Map();
  for (const v of vs) { const k = v.colore ?? "__null__"; if (!perColore.has(k)) perColore.set(k, []); perColore.get(k).push(v); }

  const azioni = [];
  for (const [, gruppo] of perColore) {
    const tieni = gruppo[0];
    const colorePulito = /non definito/i.test(tieni.colore ?? "") ? null : tieni.colore;
    const nuovoSku = slugify([p.codice, colorePulito, "Taglia unica"].filter(Boolean).join("-"));
    azioni.push({ tieni, elimina: gruppo.slice(1), colorePulito, nuovoSku });
  }
  console.log(`${p.codice}  ${p.nome.slice(0, 40)}: ${vs.length} varianti -> ${azioni.length} "Taglia unica"`);

  if (!APPLICA) continue;
  for (const a of azioni) {
    // aggiorna la variante tenuta a Taglia unica (prova col nuovo sku, fallback senza)
    let { error } = await sb.from("varianti").update({ taglia: "Taglia unica", stock: 999, colore: a.colorePulito, sku: a.nuovoSku }).eq("id", a.tieni.id);
    if (error && error.code === "23505") {
      ({ error } = await sb.from("varianti").update({ taglia: "Taglia unica", stock: 999, colore: a.colorePulito }).eq("id", a.tieni.id));
    }
    if (error) { console.error(`  ! aggiornamento fallito ${a.tieni.sku}: ${error.message}`); errori++; continue; }
    varianteAggiornate++;
    if (a.elimina.length) {
      const { error: eDel } = await sb.from("varianti").delete().in("id", a.elimina.map((v) => v.id));
      if (eDel) { console.error(`  ! eliminazione fallita: ${eDel.message}`); errori++; } else eliminate += a.elimina.length;
    }
  }
  corretti++;
}
console.log(`\n${APPLICA ? "APPLICATO" : "PROVA (nessuna scrittura)"}: prodotti ${corretti} | varianti a Taglia unica ${varianteAggiornate} | eliminate ${eliminate} | errori ${errori}`);
