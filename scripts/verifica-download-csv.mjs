// Verifica che l'URL download scarichi il CSV completo, da loggati (una tantum).
import { readFileSync } from "node:fs";

const HOST = "www.ingrossoblt.com";
const URL_DOWNLOAD = `https://${HOST}/catalogexport/catalog/download/`;
const env = {};
for (const riga of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const EMAIL = env.BLT_EMAIL?.trim(), PASSWORD = env.BLT_PASSWORD?.trim();

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const H = { "User-Agent": UA, Accept: "text/html,*/*;q=0.8", "Accept-Language": "it-IT,it;q=0.9", "Accept-Encoding": "gzip, deflate, br" };
const jar = new Map();
function accumula(res) {
  const raw = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : (res.headers.get("set-cookie")?.split(/,(?=\s*[A-Za-z0-9_.-]+=)/) ?? []);
  for (const r of raw) { const p = r.split(";")[0]; const i = p.indexOf("="); if (i > 0) { const n = p.slice(0, i).trim(), v = p.slice(i + 1).trim(); if (n && v && v.toLowerCase() !== "deleted") jar.set(n, v); } }
}
const cookie = () => [...jar].map(([n, v]) => `${n}=${v}`).join("; ");
async function get(url, opts = {}) {
  let cur = url;
  for (let i = 0; i < 6; i++) {
    // Solo la PRIMA richiesta usa method/body/headers di opts; dai redirect
    // in poi si prosegue in GET semplice (altrimenti si ripeterebbe il POST).
    const primo = i === 0;
    const res = await fetch(cur, { headers: { ...H, Cookie: cookie(), ...(primo ? opts.headers || {} : {}) }, method: primo ? opts.method ?? "GET" : "GET", body: primo ? opts.body : undefined, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(30000) });
    accumula(res);
    if (res.status >= 300 && res.status < 400) { cur = new URL(res.headers.get("location"), cur).toString(); continue; }
    return res;
  }
  throw new Error("troppi redirect");
}

// Login
const pagina = await (await get(`https://${HOST}/customer/account/login/`)).text();
const fk = pagina.match(/name="form_key"[^>]*value="([^"]+)"/) ?? pagina.match(/value="([^"]+)"[^>]*name="form_key"/);
const body = new URLSearchParams({ form_key: fk?.[1] ?? "", "login[username]": EMAIL, "login[password]": PASSWORD, send: "" }).toString();
await get(`https://${HOST}/customer/account/loginPost/`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: `https://${HOST}`, Referer: `https://${HOST}/customer/account/login/` }, body });
console.log("Login:", jar.has("PHPSESSID") ? "ok" : "FALLITO");

// Download
const res = await get(URL_DOWNLOAD);
console.log("\nGET", URL_DOWNLOAD);
console.log("  status:", res.status);
console.log("  content-type:", res.headers.get("content-type"));
console.log("  content-disposition:", res.headers.get("content-disposition"));
const testo = await res.text();
console.log("  dimensione:", (testo.length / 1024 / 1024).toFixed(2), "MB");
const righe = testo.split(/\r?\n/).filter((r) => r.trim());
console.log("  righe totali:", righe.length);
console.log("\n  header:", righe[0]?.slice(0, 200));
console.log("  1a riga:", righe[1]?.slice(0, 160));
const atteso = "sku_parent,sku_child,sku_type";
console.log("\n  ✅ È il CSV atteso:", righe[0]?.startsWith(atteso));
