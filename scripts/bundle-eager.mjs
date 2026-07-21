// JS EAGER per route: quello che il browser scarica davvero al primo load.
//
// Scarica l'HTML dal server locale (`npm run build && npm run start`), estrae
// gli <script src> dei chunk (escludendo il polyfill `noModule`, che i browser
// moderni non scaricano) e ne somma il peso leggendo i file da .next.
// Complementare a scripts/bundle-per-route.mjs, che misura il grafo completo
// inclusi i chunk lazy.
//
// Uso:
//   node scripts/bundle-eager.mjs http://localhost:3000 . report.json / /prodotti /carrello
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const [base, dirProgetto, fileOut, ...routes] = process.argv.slice(2);
if (!base || !dirProgetto || !fileOut || routes.length === 0) {
  console.error("Uso: node scripts/bundle-eager.mjs <base-url> <dir-progetto> <output.json> <route...>");
  process.exit(1);
}

function pesoChunk(rel) {
  const pieno = join(dirProgetto, ".next", ...rel.replace(/^\/_next\//, "").split("/"));
  const raw = statSync(pieno).size;
  const gz = gzipSync(readFileSync(pieno), { level: 9 }).length;
  return { raw, gz };
}

const risultato = [];
for (const route of routes) {
  const res = await fetch(base + route, { redirect: "manual" });
  const stato = res.status;
  if (stato >= 300 && stato < 400) {
    risultato.push({ route, stato, redirect: res.headers.get("location") });
    continue;
  }
  const html = await res.text();

  // Script eager: <script src="/_next/...js"> senza attributo nomodule
  // (l'HTML di Next lo serializza camelCase: `noModule`).
  const scripts = [];
  const reScript = /<script\s+([^>]*?)src="(\/_next\/[^"]+\.js)"([^>]*)>/g;
  let m;
  while ((m = reScript.exec(html))) {
    scripts.push({ src: m[2], nomodule: /nomodule/i.test(m[1] + m[3]) });
  }
  // Anche i preload/modulepreload contano come eager.
  const preload = [];
  const rePre = /<link\s+[^>]*rel="(?:modulepreload|preload)"[^>]*href="(\/_next\/[^"]+\.js)"[^>]*>/g;
  while ((m = rePre.exec(html))) preload.push(m[1]);

  const visti = new Set();
  let rawTot = 0;
  let gzTot = 0;
  let nPoly = 0;
  const dettaglio = [];
  for (const s of scripts) {
    if (s.nomodule) {
      nPoly++;
      continue;
    }
    if (visti.has(s.src)) continue;
    visti.add(s.src);
    const { raw, gz } = pesoChunk(s.src);
    rawTot += raw;
    gzTot += gz;
    dettaglio.push({
      src: s.src.replace("/_next/static/chunks/", ""),
      kb: +(raw / 1024).toFixed(1),
      gzKb: +(gz / 1024).toFixed(1),
    });
  }
  for (const p of preload) {
    if (visti.has(p)) continue;
    visti.add(p);
    const { raw, gz } = pesoChunk(p);
    rawTot += raw;
    gzTot += gz;
    dettaglio.push({
      src: "(preload) " + p.replace("/_next/static/chunks/", ""),
      kb: +(raw / 1024).toFixed(1),
      gzKb: +(gz / 1024).toFixed(1),
    });
  }
  dettaglio.sort((a, b) => b.kb - a.kb);
  risultato.push({
    route,
    stato,
    scriptEager: visti.size,
    polyfillNomodule: nPoly,
    kb: +(rawTot / 1024).toFixed(1),
    gzKb: +(gzTot / 1024).toFixed(1),
    dettaglio,
  });
}

writeFileSync(fileOut, JSON.stringify(risultato, null, 2));
console.log("ROUTE".padEnd(42) + "stato".padStart(6) + "script".padStart(8) + "KB".padStart(10) + "gzip KB".padStart(10));
for (const r of risultato) {
  if (r.redirect) {
    console.log(r.route.padEnd(42) + String(r.stato).padStart(6) + `  -> ${r.redirect}`);
  } else {
    console.log(
      r.route.padEnd(42) +
        String(r.stato).padStart(6) +
        String(r.scriptEager).padStart(8) +
        String(r.kb).padStart(10) +
        String(r.gzKb).padStart(10)
    );
  }
}
