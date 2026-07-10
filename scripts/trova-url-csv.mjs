// Scoperta URL download CSV nell'area riservata BLT (una tantum, diagnostico).
// Riusa la meccanica di login di lib/gestore/fornitori/ingrossoblt.ts (Magento 2).
// Non stampa la password. Serve a trovare l'href del bottone "Scarica Catalogo CSV".

import { readFileSync } from "node:fs";

const HOST = "www.ingrossoblt.com";
const env = {};
for (const riga of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const EMAIL = (env.BLT_EMAIL ?? "").trim();
const PASSWORD = (env.BLT_PASSWORD ?? "").trim();
console.log("Account configurato in .env.local:", EMAIL || "(NESSUNO)", "| password:", PASSWORD ? "presente" : "ASSENTE");
if (!EMAIL || !PASSWORD) { console.log("\nMancano le credenziali BLT in .env.local: non posso loggarmi."); process.exit(0); }

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const H = { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "it-IT,it;q=0.9,en;q=0.8", "Accept-Encoding": "gzip, deflate, br" };

const jar = new Map();
function accumula(res) {
  const raw = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : (res.headers.get("set-cookie")?.split(/,(?=\s*[A-Za-z0-9_.-]+=)/) ?? []);
  for (const r of raw) { const p = r.split(";")[0]; const i = p.indexOf("="); if (i > 0) { const n = p.slice(0, i).trim(), v = p.slice(i + 1).trim(); if (n && v && v.toLowerCase() !== "deleted") jar.set(n, v); } }
}
const cookie = () => [...jar].map(([n, v]) => `${n}=${v}`).join("; ");

async function get(url) {
  let cur = url;
  for (let i = 0; i < 5; i++) {
    const res = await fetch(cur, { headers: { ...H, Cookie: cookie() }, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(20000) });
    accumula(res);
    if (res.status >= 300 && res.status < 400) { cur = new URL(res.headers.get("location"), cur).toString(); continue; }
    return { res, url: cur };
  }
  throw new Error("troppi redirect");
}

// 1. Login
const login = await get(`https://${HOST}/customer/account/login/`);
const pagina = await login.res.text();
const fk = pagina.match(/name="form_key"[^>]*value="([^"]+)"/) ?? pagina.match(/value="([^"]+)"[^>]*name="form_key"/);
if (!fk) { console.log("form_key non trovato: forse gia loggato o pagina cambiata."); }
const body = new URLSearchParams({ form_key: fk ? fk[1] : "", "login[username]": EMAIL, "login[password]": PASSWORD, send: "" });
const post = await fetch(`https://${HOST}/customer/account/loginPost/`, { method: "POST", headers: { ...H, Cookie: cookie(), "Content-Type": "application/x-www-form-urlencoded", Origin: `https://${HOST}`, Referer: `https://${HOST}/customer/account/login/` }, body: body.toString(), redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(20000) });
accumula(post);
const dest = post.headers.get("location") ?? "";
console.log("\nLogin POST →", post.status, "location:", dest || "(nessuna)");
console.log("Sessione PHPSESSID:", jar.has("PHPSESSID") ? "ok" : "assente", "| login riuscito:", post.status >= 300 && post.status < 400 && !/login/i.test(dest));

// 2. Dashboard account: raccogli i link candidati
const dash = await get(`https://${HOST}/customer/account/`);
const htmlDash = await dash.res.text();
console.log("\nDashboard scaricata:", htmlDash.length, "byte");
const href = [...htmlDash.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
const KW = /catalog|csv|export|download|scarica|listino|price|prezz/i;
const candidati = [...new Set(href.filter((h) => KW.test(h)))].map((h) => new URL(h, `https://${HOST}/`).toString()).filter((h) => h.includes(HOST));
console.log("Link candidati (catalog/csv/export/scarica):");
candidati.forEach((c) => console.log("  ", c));

// Cerca anche testo del menu account (voci "Scarica catalogo")
const voci = [...htmlDash.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([^<]{0,60})<\/a>/gi)].filter((m) => /scarica|catalog|csv|export/i.test(m[2]));
if (voci.length) { console.log("\nVoci di menu con testo pertinente:"); voci.forEach((m) => console.log(`   "${m[2].trim()}" → ${new URL(m[1], `https://${HOST}/`)}`)); }

// 3. Segui i candidati e cerca link .csv o bottoni "Scarica Catalogo CSV"
for (const c of candidati.slice(0, 6)) {
  try {
    const p = await get(c);
    const ct = p.res.headers.get("content-type") ?? "";
    if (/csv|octet-stream|excel|download/i.test(ct)) { console.log(`\n>>> ${c}  è già un file (content-type: ${ct})`); continue; }
    const h = await p.res.text();
    const csvLinks = [...h.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((x) => /\.csv|csv|download|export|scarica/i.test(x));
    const btn = h.match(/<a[^>]*href="([^"]+)"[^>]*>[^<]*(?:scarica|download)[^<]*csv[^<]*<\/a>/i);
    console.log(`\nPagina ${c}: ${h.length} byte`);
    if (btn) console.log("   BOTTONE CSV →", new URL(btn[1], c).toString());
    [...new Set(csvLinks)].slice(0, 10).forEach((x) => console.log("   link:", new URL(x, c).toString()));
  } catch (e) { console.log(`   errore su ${c}:`, e.message); }
}
