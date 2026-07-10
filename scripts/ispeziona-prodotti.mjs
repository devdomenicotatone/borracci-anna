// Sola lettura: stato dei due prodotti non-BLT e delle loro varianti.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const r of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = r.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const slugs = ["polo-jersey", "polo-collo-coreano"];
const { data: prod } = await sb.from("prodotti")
  .select("id, nome, slug, codice, attivo, disponibilita_su_richiesta, solo_online")
  .in("slug", slugs);

for (const p of prod ?? []) {
  const { data: varianti } = await sb.from("varianti")
    .select("taglia, colore, stock, sku").eq("prodotto_id", p.id).order("taglia");
  const tot = (varianti ?? []).reduce((s, v) => s + (v.stock ?? 0), 0);
  console.log(`\n=== ${p.nome}  (slug: ${p.slug}) ===`);
  console.log(`  codice: ${p.codice ?? "(nessuno)"} | attivo: ${p.attivo} | su_richiesta: ${p.disponibilita_su_richiesta} | solo_online: ${p.solo_online}`);
  console.log(`  varianti: ${(varianti ?? []).length} | STOCK TOTALE: ${tot}`);
  for (const v of varianti ?? []) console.log(`    - ${v.taglia ?? "-"} / ${v.colore ?? "-"}  stock=${v.stock}  sku=${v.sku}`);
}

// Quanti prodotti a catalogo hanno un codice (= importati da BLT) vs no?
let conCodice = 0, senzaCodice = 0;
for (let da = 0; ; da += 1000) {
  const { data } = await sb.from("prodotti").select("codice").range(da, da + 999);
  for (const r of data ?? []) (r.codice ? conCodice++ : senzaCodice++);
  if (!data || data.length < 1000) break;
}
console.log(`\n=== catalogo: con codice (BLT) = ${conCodice} | senza codice (tuoi) = ${senzaCodice} ===`);
