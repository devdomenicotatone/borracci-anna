// Popola il catalogo con i prodotti reali (polo "1 Liven") a partire dalle foto.
// SVUOTA prima i prodotti esistenti (i campioni finti), poi crea i 7 prodotti:
// foto ottimizzata in WebP su Storage, descrizione con composizione + lavaggio,
// prezzo 35 EUR, varianti taglie (S-XL) con stock 0. Prodotti creati come BOZZE
// (attivo = false): imposta stock e pubblica dal pannello /gestore.
//
// Uso:  node scripts/seed-catalogo.mjs
// Legge NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY da .env.local.

import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

function leggiEnv(file) {
  try {
    const txt = readFileSync(file, "utf8");
    const env = {};
    for (const riga of txt.split(/\r?\n/)) {
      const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return env;
  } catch {
    return {};
  }
}

const env = { ...leggiEnv(".env.local"), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const FOTO_DIR = "cartella foto momentanea da eliminare";
const PREZZO_CENTS = 3500;
const TAGLIE = ["S", "M", "L", "XL"];

function descrizione(modello) {
  const dettaglio =
    modello === "rigato"
      ? "colletto e bottoniera a contrasto rigati"
      : "bottoniera a contrasto in fantasia";
  return [
    `Polo in cotone elasticizzato con ${dettaglio}. Vestibilità classica e comoda.`,
    "",
    "Composizione: 94% cotone, 6% elastane.",
    "",
    "Lavaggio consigliato: lavare in lavatrice a 30°C · non candeggiare · non asciugare in asciugatrice · stirare a bassa temperatura · non lavare a secco.",
  ].join("\n");
}

const PRODOTTI = [
  // Mod. 9554 — colletto rigato
  { slug: "polo-rigata-grigia", nome: "Polo colletto rigato — Grigia", colore: "Grigio", modello: "rigato", foto: "1782153621523_20260622_202038.jpg" },
  { slug: "polo-rigata-blu", nome: "Polo colletto rigato — Blu", colore: "Blu", modello: "rigato", foto: "1782153629158_20260622_203031.jpg" },
  { slug: "polo-rigata-bianca", nome: "Polo colletto rigato — Bianca", colore: "Bianco", modello: "rigato", foto: "1782153634205_20260622_203148.jpg" },
  { slug: "polo-rigata-celeste", nome: "Polo colletto rigato — Celeste", colore: "Celeste", modello: "rigato", foto: "1782153640230_20260622_203237.jpg" },
  // Mod. C562/QZ — bottoniera fantasia
  { slug: "polo-fantasia-blu", nome: "Polo bottoniera fantasia — Blu", colore: "Blu", modello: "fantasia", foto: "1782153683756_20260622_203354.jpg" },
  { slug: "polo-fantasia-bianca", nome: "Polo bottoniera fantasia — Bianca", colore: "Bianco", modello: "fantasia", foto: "1782153689491_20260622_203459.jpg" },
  { slug: "polo-fantasia-celeste", nome: "Polo bottoniera fantasia — Celeste", colore: "Celeste", modello: "fantasia", foto: "1782153695743_20260622_203619.jpg" },
];

// 1. Svuota i prodotti esistenti (le varianti spariscono via ON DELETE CASCADE).
const { error: delErr } = await admin
  .from("prodotti")
  .delete()
  .neq("id", "00000000-0000-0000-0000-000000000000");
if (delErr) {
  console.error("Errore eliminando i prodotti esistenti:", delErr.message);
  process.exit(1);
}
console.log("Prodotti esistenti eliminati.");

// 2. Crea i prodotti reali.
for (const p of PRODOTTI) {
  const { data: prod, error } = await admin
    .from("prodotti")
    .insert({
      slug: p.slug,
      nome: p.nome,
      descrizione: descrizione(p.modello),
      prezzo_cents: PREZZO_CENTS,
      valuta: "EUR",
      attivo: false,
    })
    .select("id")
    .single();
  if (error) {
    console.error(`✗ ${p.slug}:`, error.message);
    continue;
  }
  const id = prod.id;

  // Foto: auto-orienta (EXIF), ridimensiona e converte in WebP.
  try {
    const buf = await sharp(path.join(FOTO_DIR, p.foto))
      .rotate()
      .resize(1400, 1400, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    const storagePath = `${id}/cover.webp`;
    const { error: upErr } = await admin.storage
      .from("prodotti")
      .upload(storagePath, buf, { upsert: true, contentType: "image/webp" });
    if (upErr) {
      console.error(`  foto ${p.slug}:`, upErr.message);
    } else {
      const { data: pub } = admin.storage.from("prodotti").getPublicUrl(storagePath);
      const urlFoto = `${pub.publicUrl}?v=${Date.now()}`;
      await admin.from("prodotti").update({ immagine_url: urlFoto }).eq("id", id);
    }
  } catch (e) {
    console.error(`  foto ${p.slug}:`, e.message);
  }

  // Varianti taglia (stock 0, da impostare nel pannello).
  const varianti = TAGLIE.map((t) => ({
    prodotto_id: id,
    taglia: t,
    colore: p.colore,
    sku: `${p.slug}-${t.toLowerCase()}`,
    stock: 0,
  }));
  const { error: vErr } = await admin.from("varianti").insert(varianti);
  if (vErr) console.error(`  varianti ${p.slug}:`, vErr.message);

  console.log(`✓ ${p.nome}`);
}

console.log("\nFatto. I prodotti sono BOZZE: imposta stock e attiva da /gestore/prodotti.");
