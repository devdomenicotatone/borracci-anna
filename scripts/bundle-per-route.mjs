// Bundle CLIENT per route dai dati di `next experimental-analyze --output`.
//
// Misura il GRAFO COMPLETO di ogni route (inclusi i chunk caricati lazy via
// dynamic/import()): serve a scoprire QUALI pacchetti appartengono a quali
// route, non quanto scarica il browser al primo load (per quello c'è
// scripts/bundle-eager.mjs).
//
// Uso:
//   npx next experimental-analyze --output
//   node scripts/bundle-per-route.mjs .next/diagnostics/analyze/data report.json
//
// Nota formato: ogni analyze.data è una sequenza di frame [u32 big-endian di
// lunghezza][JSON utf8]; al frame 0 c'è il grafo (sources/chunk_parts/
// output_files), i frame successivi sono tabelle binarie che non servono qui.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const dirData = process.argv[2];
const fileOut = process.argv[3];
if (!dirData || !fileOut) {
  console.error("Uso: node scripts/bundle-per-route.mjs <dir analyze/data> <output.json>");
  process.exit(1);
}

function leggiFrame0(percorso) {
  const buf = readFileSync(percorso);
  const len = buf.readUInt32BE(0);
  return JSON.parse(buf.subarray(4, 4 + len).toString("utf8"));
}

// Ricostruisce il path completo di una source risalendo i parent_source_index.
function pathCompleto(sources, i, cache) {
  if (cache[i] !== undefined) return cache[i];
  const s = sources[i];
  const parent = s.parent_source_index;
  const base = parent === undefined || parent === null ? "" : pathCompleto(sources, parent, cache);
  cache[i] = base + s.path;
  return cache[i];
}

// Etichetta leggibile: nome pacchetto npm oppure cartella sotto src/.
function pacchetto(p) {
  const nm = p.lastIndexOf("node_modules/");
  if (nm !== -1) {
    const resto = p.slice(nm + "node_modules/".length);
    const parti = resto.split("/");
    return parti[0].startsWith("@") ? `${parti[0]}/${parti[1] ?? ""}` : parti[0];
  }
  if (p.includes("/src/")) return "src" + p.slice(p.indexOf("/src/") + 4).replace(/\/[^/]*$/, "");
  if (p.includes("[project]")) return p.replace(/^.*\[project\]\//, "").replace(/\/[^/]*$/, "") || "(root)";
  return "(next-internals)";
}

function trovaRoute(dir, prefisso = "") {
  const risultati = [];
  for (const nome of readdirSync(dir)) {
    const pieno = join(dir, nome);
    if (statSync(pieno).isDirectory()) {
      risultati.push(...trovaRoute(pieno, `${prefisso}/${nome}`));
    }
  }
  if (existsSync(join(dir, "analyze.data")) && prefisso !== "") {
    risultati.push({ route: prefisso, file: join(dir, "analyze.data") });
  }
  return risultati;
}

const route = trovaRoute(dirData);
// La radice (data/analyze.data) è la home "/".
if (existsSync(join(dirData, "analyze.data"))) {
  route.push({ route: "/", file: join(dirData, "analyze.data") });
}

const report = [];
for (const { route: nomeRoute, file } of route) {
  const f0 = leggiFrame0(file);
  const cache = {};
  const perPacchetto = new Map();
  let totJs = 0;
  let totJsGz = 0;
  let totCss = 0;

  for (const parte of f0.chunk_parts) {
    const out = f0.output_files[parte.output_file_index]?.filename ?? "";
    if (!out.startsWith("[client-fs]")) continue; // solo bundle client
    if (out.endsWith(".css")) {
      totCss += parte.size;
      continue;
    }
    if (!out.endsWith(".js")) continue;
    totJs += parte.size;
    totJsGz += parte.compressed_size ?? 0;
    const src = pathCompleto(f0.sources, parte.source_index, cache);
    const p = pacchetto(src);
    const agg = perPacchetto.get(p) ?? { size: 0, gz: 0 };
    agg.size += parte.size;
    agg.gz += parte.compressed_size ?? 0;
    perPacchetto.set(p, agg);
  }

  report.push({
    route: nomeRoute,
    jsKb: +(totJs / 1024).toFixed(1),
    jsGzKb: +(totJsGz / 1024).toFixed(1),
    cssKb: +(totCss / 1024).toFixed(1),
    pacchetti: [...perPacchetto.entries()]
      .map(([nome, v]) => ({ nome, kb: +(v.size / 1024).toFixed(1), gzKb: +(v.gz / 1024).toFixed(1) }))
      .sort((a, b) => b.kb - a.kb),
  });
}

report.sort((a, b) => b.jsKb - a.jsKb);
writeFileSync(fileOut, JSON.stringify(report, null, 2));

console.log("ROUTE (solo pagine)".padEnd(46) + "JS KB".padStart(9) + "gzip".padStart(9));
const sospetti = [
  "konva",
  "react-konva",
  "react-filerobot-image-editor",
  "styled-components",
  "leaflet",
  "@imgly/background-removal",
  "onnxruntime-web",
  "@supabase/supabase-js",
  "qrcode",
];
for (const r of report) {
  if (/api\/|icon|manifest|robots|sitemap|image|favicon|social|middleware/.test(r.route)) continue;
  console.log(r.route.padEnd(46) + String(r.jsKb).padStart(9) + String(r.jsGzKb).padStart(9));
  const presenti = r.pacchetti.filter((p) => sospetti.includes(p.nome));
  if (presenti.length) {
    console.log("    da tenere d'occhio: " + presenti.map((p) => `${p.nome}=${p.kb}KB`).join(", "));
  }
}
