// Report READ-ONLY del catalogo live: prodotti, varianti, categorie e file
// foto su Storage. Non modifica NULLA. Serve a fotografare lo stato reale del
// DB cloud prima del consolidamento (cosi lo script di consolidamento lavora
// sui dati veri, senza assunzioni).
//
// Uso:  node scripts/catalogo-stato.mjs
// Legge NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY da .env.local.
// Incolla l'output al chatbot per ricevere lo script di consolidamento esatto.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

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
  console.error(
    "Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function box(titolo) {
  console.log("\n" + "=".repeat(72));
  console.log(titolo);
  console.log("=".repeat(72));
}

// 1. Categorie (se la tabella esiste gia) ------------------------------------
box("CATEGORIE");
{
  const { data, error } = await admin
    .from("categorie")
    .select("id, slug, nome, parent_id, ordine")
    .order("ordine", { ascending: true });
  if (error) {
    console.log(`(tabella categorie non leggibile: ${error.message})`);
  } else if (!data || data.length === 0) {
    console.log("(nessuna categoria)");
  } else {
    // Albero indentato (fino a 3 livelli: macro > figlie > nipoti).
    const figliDi = (id) => data.filter((c) => c.parent_id === id);
    const stampa = (c, livello) => {
      const rientro = "  ".repeat(livello);
      console.log(`${rientro}- ${c.nome}  [${c.slug}]  id=${c.id}`);
      for (const f of figliDi(c.id)) stampa(f, livello + 1);
    };
    for (const c of data.filter((c) => !c.parent_id)) stampa(c, 0);
  }
}

// 2. Prodotti + varianti -----------------------------------------------------
// Resiliente all'ordine di esecuzione: prova con categoria_id (post-migration);
// se la colonna non esiste ancora (42703), ripiega senza, cosi lo script
// fotografa il catalogo anche PRIMA della migration.
box("PRODOTTI + VARIANTI");
const VARIANTI_SEL = "varianti(id, taglia, colore, sku, stock)";
let prodotti;
let errProd;
{
  const conCat = await admin
    .from("prodotti")
    .select(
      `id, slug, nome, attivo, prezzo_cents, valuta, immagine_url, categoria_id, creato_il, ${VARIANTI_SEL}`,
    )
    .order("creato_il", { ascending: true });
  if (conCat.error && conCat.error.code === "42703") {
    const senzaCat = await admin
      .from("prodotti")
      .select(
        `id, slug, nome, attivo, prezzo_cents, valuta, immagine_url, creato_il, ${VARIANTI_SEL}`,
      )
      .order("creato_il", { ascending: true });
    prodotti = senzaCat.data;
    errProd = senzaCat.error;
    if (!errProd) console.log("(colonna categoria_id non ancora presente)\n");
  } else {
    prodotti = conCat.data;
    errProd = conCat.error;
  }
}

if (errProd) {
  console.error("Errore leggendo i prodotti:", errProd.message);
  process.exit(1);
}

console.log(`Totale prodotti: ${prodotti?.length ?? 0}\n`);
for (const p of prodotti ?? []) {
  console.log(`• ${p.nome}`);
  console.log(`    id=${p.id}`);
  console.log(`    slug=${p.slug}  attivo=${p.attivo}  prezzo_cents=${p.prezzo_cents}`);
  console.log(`    categoria_id=${p.categoria_id ?? "—"}`);
  console.log(`    immagine_url=${p.immagine_url ?? "—"}`);
  const vs = p.varianti ?? [];
  console.log(`    varianti (${vs.length}):`);
  for (const v of vs) {
    console.log(
      `      - taglia=${v.taglia ?? "—"} colore=${v.colore ?? "—"} sku=${v.sku} stock=${v.stock} (id=${v.id})`,
    );
  }

  // 3. File foto su Storage nella cartella del prodotto.
  const { data: files, error: errList } = await admin.storage
    .from("prodotti")
    .list(p.id);
  if (errList) {
    console.log(`    storage: (errore: ${errList.message})`);
  } else if (!files || files.length === 0) {
    console.log("    storage: (nessun file)");
  } else {
    console.log(
      `    storage: ${files.map((f) => `${p.id}/${f.name}`).join(", ")}`,
    );
  }
  console.log("");
}

// 4. Galleria prodotto_foto (se gia esistente) -------------------------------
box("PRODOTTO_FOTO (galleria)");
{
  const { data, error } = await admin
    .from("prodotto_foto")
    .select("id, prodotto_id, variante_id, url, ordine")
    .order("prodotto_id", { ascending: true })
    .order("ordine", { ascending: true });
  if (error) {
    console.log(`(tabella prodotto_foto non leggibile: ${error.message})`);
  } else if (!data || data.length === 0) {
    console.log("(nessuna foto in galleria)");
  } else {
    for (const f of data) {
      console.log(
        `- prodotto=${f.prodotto_id} variante=${f.variante_id ?? "—"} ordine=${f.ordine} url=${f.url}`,
      );
    }
  }
}

console.log("\nFatto. Copia tutto l'output qui sopra e incollalo nel chatbot.");
