// Zoom su UNA route dell'analisi bundle: file sorgente più pesanti nel bundle
// client e ripartizione per chunk di output. Con un filtro regex si isola un
// pacchetto (es. "leaflet") o una cartella (es. "src/components").
//
// Uso:
//   node scripts/bundle-dettaglio.mjs .next/diagnostics/analyze/data/privacy/analyze.data
//   node scripts/bundle-dettaglio.mjs <analyze.data> 30 "node_modules/leaflet"
import { readFileSync } from "node:fs";

const [file, nStr, filtroStr] = process.argv.slice(2);
if (!file) {
  console.error("Uso: node scripts/bundle-dettaglio.mjs <analyze.data> [N] [filtro-regex]");
  process.exit(1);
}
const N = Number(nStr ?? 40);
const filtro = filtroStr ? new RegExp(filtroStr) : null;

const buf = readFileSync(file);
const len = buf.readUInt32BE(0);
const f0 = JSON.parse(buf.subarray(4, 4 + len).toString("utf8"));

const cache = {};
function pathCompleto(i) {
  if (cache[i] !== undefined) return cache[i];
  const s = f0.sources[i];
  const parent = s.parent_source_index;
  const base = parent === undefined || parent === null ? "" : pathCompleto(parent);
  cache[i] = base + s.path;
  return cache[i];
}

const perFile = new Map();
const perOutput = new Map();
for (const parte of f0.chunk_parts) {
  const out = f0.output_files[parte.output_file_index]?.filename ?? "";
  if (!out.startsWith("[client-fs]") || !out.endsWith(".js")) continue;
  const src = pathCompleto(parte.source_index);
  if (filtro && !filtro.test(src)) continue;
  const agg = perFile.get(src) ?? { size: 0 };
  agg.size += parte.size;
  perFile.set(src, agg);
  const aggO = perOutput.get(out) ?? { size: 0, gz: 0 };
  aggO.size += parte.size;
  aggO.gz += parte.compressed_size ?? 0;
  perOutput.set(out, aggO);
}

console.log(`=== TOP ${N} FILE SORGENTE${filtro ? ` (filtro ${filtro})` : ""} ===`);
[...perFile.entries()]
  .sort((a, b) => b[1].size - a[1].size)
  .slice(0, N)
  .forEach(([p, v]) => console.log(`${(v.size / 1024).toFixed(1).padStart(8)} KB  ${p.replace(/^\[project\]\//, "")}`));

console.log("\n=== CHUNK CLIENT (output) ===");
[...perOutput.entries()]
  .sort((a, b) => b[1].size - a[1].size)
  .forEach(([p, v]) =>
    console.log(
      `${(v.size / 1024).toFixed(1).padStart(8)} KB (gz ${(v.gz / 1024).toFixed(1)})  ${p.replace("[client-fs]/", "")}`
    )
  );
