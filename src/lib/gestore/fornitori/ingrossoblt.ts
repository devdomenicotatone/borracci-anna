// Parser e login del fornitore Ingrosso BLT (www.ingrossoblt.com, Magento 2).
// Modulo puro senza "use server": le server action di import lo usano lato
// server (le credenziali e il cookie di sessione non passano MAI dal client).
//
// L'HTML del fornitore e server-rendered: qui si estrae tutto con regex e
// bracket-matching tolleranti (zero dipendenze nuove). Ogni campo e best
// effort: se un pezzo di pagina cambia o manca, si degrada a null/[]/"" senza
// mai lanciare da parseProdottoBlt.

// --- Contratto condiviso ------------------------------------------------------

export interface ProdottoBlt {
  nome: string; //                  es. "Maglia Calcio Palermo 25/26"
  codice: string | null; //         es. "PA0126"
  prezzoIngrossoCents: number | null; //  IVA esclusa (finalPrice)
  prezzoIvatoCents: number | null; //     ingrosso × 1.22 arrotondato
  prezzoConsigliatoCents: number | null; // prezzo consigliato al pubblico, se visibile
  foto: string[]; //                URL assoluti, deduplicati, in ordine galleria
  taglie: string[]; //              [] se non rilevabili
  attributi: { chiave: string; valore: string }[];
  descrizioneFornitore: string; //  testo descrizione/dettagli se presente, anche ""
}

export const HOST_FORNITORE = "www.ingrossoblt.com";

/** True se l'URL e https e punta al fornitore (con o senza www): e la whitelist anti-SSRF. */
export function urlFornitoreValido(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return u.hostname === HOST_FORNITORE || `www.${u.hostname}` === HOST_FORNITORE;
  } catch {
    return false;
  }
}

// --- Utility di parsing -------------------------------------------------------

const ENTITA_NOMINATE: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  euro: "€",
};

/** Decodifica le entita HTML numeriche (&#x20; &#47;) e quelle nominate comuni. */
function decodificaEntita(testo: string): string {
  return testo
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(parseInt(dec, 10)),
    )
    .replace(
      /&([a-z]+);/gi,
      (tutto, nome: string) => ENTITA_NOMINATE[nome.toLowerCase()] ?? tutto,
    );
}

/** Toglie i tag, decodifica le entita e normalizza gli spazi. */
function testoPiano(html: string): string {
  return decodificaEntita(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/**
 * Converte un prezzo testuale in cents. Gestisce il formato italiano
 * ("1.234,56", "35,00") e quello JSON ("16.5"). Null se non e un numero.
 */
function prezzoTestoInCents(testo: string): number | null {
  const pulito = testo.replace(/[^\d.,]/g, "").replace(/[.,]+$/, "");
  if (!pulito) return null;
  let normalizzato: string;
  if (pulito.includes(",")) {
    // Virgola decimale all'italiana; i punti sono separatori delle migliaia.
    normalizzato = pulito.replace(/\./g, "").replace(",", ".");
  } else {
    normalizzato = pulito;
  }
  const n = Number(normalizzato);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/**
 * Estrae il testo di un array JSON che inizia ad `apertura` (indice della "[")
 * con bracket-matching consapevole delle stringhe: un semplice JSON.parse sul
 * blocco fallirebbe per i dati extra a valle nello script Magento.
 */
function estraiArrayJson(html: string, apertura: number): string | null {
  let profondita = 0;
  let inStringa = false;
  let escape = false;
  for (let i = apertura; i < html.length; i++) {
    const c = html[i];
    if (inStringa) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inStringa = false;
      continue;
    }
    if (c === '"') inStringa = true;
    else if (c === "[") profondita++;
    else if (c === "]") {
      profondita--;
      if (profondita === 0) return html.slice(apertura, i + 1);
    }
  }
  return null;
}

// --- Nome e codice --------------------------------------------------------------

/** Codice prodotto dall'URL: "...-pa0126.html" => "PA0126". */
function codiceDaUrl(url: string): string | null {
  try {
    const percorso = new URL(url).pathname;
    const m = percorso.match(/-([a-z]{1,4}[0-9]{2,6})\.html$/i);
    return m ? m[1].toUpperCase() : null;
  } catch {
    return null;
  }
}

/** Fallback: codice dal blocco SKU della pagina prodotto. */
function codiceDaPagina(html: string): string | null {
  const m = html.match(
    /class="product attribute sku"[\s\S]{0,400}?class="value"[^>]*>\s*([^<\s][^<]*?)\s*</,
  );
  return m ? decodificaEntita(m[1]).trim().toUpperCase() : null;
}

/** Nome da og:title o <title>, ripulito da codice, prezzo e firma del sito. */
function estraiNome(html: string, codice: string | null): string {
  const og =
    html.match(
      /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i,
    ) ??
    html.match(
      /<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:title["']/i,
    );
  let nome = og ? decodificaEntita(og[1]) : "";
  if (!nome) {
    const titolo = html.match(/<title>([\s\S]*?)<\/title>/i);
    nome = titolo ? decodificaEntita(titolo[1]) : "";
  }
  nome = nome
    .replace(/\s*\|\s*Ingrosso BLT\s*$/i, "") //     "... | Ingrosso BLT"
    .replace(/\s+a\s+[\d.,]+\s*€\s*$/i, "") //        "... a 20.13€"
    .trim();
  if (codice) {
    // "... - PA0126" in coda: il codice va nel campo dedicato, non nel nome.
    const codiceEscaped = codice.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    nome = nome.replace(new RegExp(`\\s*[-–]\\s*${codiceEscaped}\\s*$`, "i"), "");
  } else {
    nome = nome.replace(/\s*[-–]\s*[a-z]{1,4}[0-9]{2,6}\s*$/i, "");
  }
  return nome.replace(/\s+/g, " ").trim();
}

// --- Prezzi ---------------------------------------------------------------------

/**
 * Prezzo ingrosso IVA esclusa dal JSON di pagina: "finalPrice":{"amount":16.5}.
 * Da loggati Magento serializza l'amount come STRINGA ("amount":"16.5"):
 * le virgolette attorno al numero sono opzionali.
 */
function estraiPrezzoIngrossoCents(html: string): number | null {
  const m = html.match(
    /"finalPrice"\s*:\s*\{[^{}]*?"amount"\s*:\s*"?([0-9]+(?:\.[0-9]+)?)"?/,
  );
  if (!m) return null;
  const cents = Math.round(Number(m[1]) * 100);
  return cents > 0 ? cents : null;
}

/**
 * Prezzo consigliato al pubblico, in modo tollerante e in ordine di fiducia:
 * 1. box prezzo del prodotto (span "prezzo_public" dopo product-info-price,
 *    prima dei prodotti correlati) — visibile anche da sloggati;
 * 2. riga "Prezzo al pubblico"/"consigliato" nella tabella attributi;
 * 3. chiave msrp nei JSON di pagina (modulo Magento_Msrp).
 * Null se assente o pari a zero.
 */
function estraiPrezzoConsigliatoCents(
  html: string,
  attributi: { chiave: string; valore: string }[],
): number | null {
  // 1. Box prezzo principale: finestra dal blocco product-info-price fino al
  //    primo prodotto correlato, per non pescare i prezzi degli articoli affini.
  const inizio = html.indexOf('class="product-info-price"');
  if (inizio >= 0) {
    const fineCorrelati = html.indexOf("product-item", inizio);
    const fine = Math.min(
      fineCorrelati === -1 ? html.length : fineCorrelati,
      inizio + 40_000,
    );
    const finestra = html.slice(inizio, fine);
    const m = finestra.match(/class="prezzo_public"[^>]*>\s*([0-9][0-9.,]*)/);
    if (m) {
      const cents = prezzoTestoInCents(m[1]);
      if (cents && cents > 0) return cents;
    }
  }

  // 2. Tabella attributi: es. "Prezzo al pubblico: 35,00".
  for (const { chiave, valore } of attributi) {
    if (/prezzo/i.test(chiave) && /pubblico|consigliat/i.test(chiave)) {
      const cents = prezzoTestoInCents(valore);
      if (cents && cents > 0) return cents;
    }
  }

  // 3. Chiavi msrp nei JSON di pagina (il markup da loggati puo variare).
  const msrp = html.match(/"msrp_price"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (msrp) {
    const testo = msrp[1].replace(/\\u([0-9a-f]{4})/gi, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
    const cents = prezzoTestoInCents(testoPiano(testo.replace(/\\\//g, "/")));
    if (cents && cents > 0) return cents;
  }
  return null;
}

// --- Galleria foto ----------------------------------------------------------------

const PREFISSO_FOTO = `https://${HOST_FORNITORE}/media/catalog/product/`;

/**
 * URL delle foto dal JSON inline della galleria: blocco `"data": [{"thumb":...,
 * "img":..., "full":...}, ...]`. Si prende `full` (fallback `img`), si deduplica
 * e si tengono SOLO gli URL del catalogo media del fornitore.
 */
function estraiFoto(html: string): string[] {
  for (const m of html.matchAll(/"data"\s*:\s*\[/g)) {
    const apertura = html.indexOf("[", m.index);
    const blocco = estraiArrayJson(html, apertura);
    if (!blocco || (!blocco.includes('"full"') && !blocco.includes('"img"'))) {
      continue;
    }
    let dati: unknown;
    try {
      dati = JSON.parse(blocco);
    } catch {
      continue;
    }
    if (!Array.isArray(dati)) continue;

    const foto: string[] = [];
    for (const voce of dati) {
      if (typeof voce !== "object" || voce === null) continue;
      const { full, img, type } = voce as {
        full?: unknown;
        img?: unknown;
        type?: unknown;
      };
      if (typeof type === "string" && type !== "image") continue; // niente video
      const url =
        typeof full === "string" && full
          ? full
          : typeof img === "string"
            ? img
            : "";
      if (url.startsWith(PREFISSO_FOTO) && !foto.includes(url)) {
        foto.push(url);
      }
    }
    if (foto.length > 0) return foto; // primo blocco galleria valido
  }
  return [];
}

// --- Taglie -------------------------------------------------------------------------

// Set canonico taglie adulto (scala del negozio: "2XL", mai "XXL"); le taglie
// bimbo sono normalizzate come "N anni".
const TAGLIE_CANONICHE = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "2XL",
  "3XL",
  "4XL",
  "5XL",
  "6XL",
] as const;

/** Normalizza una candidata taglia ("m", "XXL", "6 Anni") o null se non e una taglia. */
function normalizzaTaglia(grezza: string): string | null {
  const testo = decodificaEntita(grezza).replace(/\s+/g, " ").trim();
  let maiuscola = testo.toUpperCase();
  // Alias del fornitore -> scala del negozio.
  if (maiuscola === "XXL") maiuscola = "2XL";
  if (maiuscola === "XXXL") maiuscola = "3XL";
  if ((TAGLIE_CANONICHE as readonly string[]).includes(maiuscola)) {
    return maiuscola;
  }
  const anni = maiuscola.match(/^(\d{1,2})\s*ANNI$/);
  if (anni) return `${parseInt(anni[1], 10)} anni`;
  return null;
}

/** Rango per ordinare le taglie: bimbo per eta, poi la scala adulto XS→6XL. */
function rangoTaglia(t: string): number {
  const anni = t.match(/^(\d{1,2}) anni$/);
  if (anni) return parseInt(anni[1], 10);
  const i = (TAGLIE_CANONICHE as readonly string[]).indexOf(t);
  return i === -1 ? 999 : 100 + i;
}

/**
 * Taglie best effort. Da sloggati la pagina non espone la configurazione
 * varianti (ritorna []); da loggati si tenta su tre fronti Magento:
 * jsonConfig/spConfig (configurable), tabella grouped (super_group[...]) e
 * select delle opzioni.
 */
function estraiTaglie(html: string): string[] {
  const candidate: string[] = [];

  // 0. Bundle B2B (markup reale di ingrossoblt da loggati): un blocco
  //    <div data-status="1" class="... bundle-options-M "> per taglia.
  //    data-status "1" = disponibile; le taglie a "0" vengono scartate.
  for (const m of html.matchAll(
    /data-status="(\d)"[^>]*class="[^"]*bundle-options-([A-Za-z0-9]{1,8})/g,
  )) {
    if (m[1] === "1") candidate.push(m[2]);
  }

  // 1. Configurable: etichette dentro il blocco jsonConfig/spConfig.
  const config = html.match(/"(?:jsonConfig|spConfig)"\s*:/);
  if (config && config.index !== undefined) {
    const finestra = html.slice(config.index, config.index + 60_000);
    for (const m of finestra.matchAll(/"label"\s*:\s*"([^"]{1,20})"/g)) {
      candidate.push(m[1]);
    }
  }

  // 2. Grouped: celle della tabella quantita (input super_group[...]).
  if (html.includes("super_group[")) {
    for (const m of html.matchAll(/<td[^>]*>\s*([^<]{1,20}?)\s*<\/td>/g)) {
      candidate.push(m[1]);
    }
  }

  // 3. Select delle opzioni taglia (super_attribute o affini).
  for (const sel of html.matchAll(
    /<select[^>]*(?:super_attribute|taglia|size)[^>]*>([\s\S]*?)<\/select>/gi,
  )) {
    for (const opt of sel[1].matchAll(/<option[^>]*>\s*([^<]{1,20}?)\s*<\/option>/g)) {
      candidate.push(opt[1]);
    }
  }

  const taglie = new Set<string>();
  for (const c of candidate) {
    const t = normalizzaTaglia(c);
    if (t) taglie.add(t);
  }
  return [...taglie].sort((a, b) => rangoTaglia(a) - rangoTaglia(b));
}

// --- Attributi e descrizione -----------------------------------------------------------

/** Coppie chiave/valore dalla tabella "Maggiori Informazioni" del prodotto. */
function estraiAttributi(html: string): { chiave: string; valore: string }[] {
  const tabella = html.match(
    /<table[^>]*(?:additional-attributes|product-attribute-specs-table)[^>]*>([\s\S]*?)<\/table>/i,
  );
  if (!tabella) return [];
  const attributi: { chiave: string; valore: string }[] = [];
  for (const riga of tabella[1].matchAll(
    // Tra </th> e <td> tollera whitespace e commenti HTML.
    /<th[^>]*>([\s\S]*?)<\/th>(?:\s|<!--[\s\S]*?-->)*<td[^>]*>([\s\S]*?)<\/td>/g,
  )) {
    const chiave = testoPiano(riga[1]);
    const valore = testoPiano(riga[2]);
    if (chiave && valore) attributi.push({ chiave, valore });
  }
  return attributi;
}

/** Testo del tab descrizione (piu l'eventuale overview), senza tag. */
function estraiDescrizione(html: string): string {
  const parti: string[] = [];
  for (const blocco of ["overview", "description"]) {
    const m = html.match(
      new RegExp(
        `<div class="product attribute ${blocco}">\\s*<div class="value"[^>]*>([\\s\\S]*?)</div>`,
      ),
    );
    if (m) {
      const testo = testoPiano(m[1]);
      if (testo && !parti.includes(testo)) parti.push(testo);
    }
  }
  return parti.join("\n\n");
}

// --- Parser principale ------------------------------------------------------------------

/** Estrae i dati prodotto dall'HTML di una pagina Ingrosso BLT. Non lancia mai. */
export function parseProdottoBlt(html: string, url: string): ProdottoBlt {
  const codice = codiceDaUrl(url) ?? codiceDaPagina(html);
  const attributi = estraiAttributi(html);
  const prezzoIngrossoCents = estraiPrezzoIngrossoCents(html);
  return {
    nome: estraiNome(html, codice),
    codice,
    prezzoIngrossoCents,
    prezzoIvatoCents:
      prezzoIngrossoCents !== null
        ? Math.round(prezzoIngrossoCents * 1.22) // IVA 22%
        : null,
    prezzoConsigliatoCents: estraiPrezzoConsigliatoCents(html, attributi),
    foto: estraiFoto(html),
    taglie: estraiTaglie(html),
    attributi,
    descrizioneFornitore: estraiDescrizione(html),
  };
}

// --- Rete: login e download -----------------------------------------------------------------

// Header da browser reale: il sito non ha anti-bot ma serve un UA credibile.
const HEADER_BROWSER: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
};

const URL_LOGIN = `https://${HOST_FORNITORE}/customer/account/login/`;
const URL_LOGIN_POST = `https://${HOST_FORNITORE}/customer/account/loginPost/`;

/** Legge i set-cookie di una risposta (con fallback se getSetCookie manca). */
function leggiSetCookie(res: Response): string[] {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const grezzo = res.headers.get("set-cookie");
  // Split prudente: la virgola dentro Expires non e seguita da "nome=".
  return grezzo ? grezzo.split(/,(?=\s*[A-Za-z0-9_.-]+=)/) : [];
}

/** Accumula i cookie "nome=valore" di una risposta nella mappa. */
function accumulaCookie(res: Response, barattolo: Map<string, string>): void {
  for (const riga of leggiSetCookie(res)) {
    const coppia = riga.split(";")[0];
    const uguale = coppia.indexOf("=");
    if (uguale <= 0) continue;
    const nome = coppia.slice(0, uguale).trim();
    const valore = coppia.slice(uguale + 1).trim();
    if (nome && valore && valore.toLowerCase() !== "deleted") {
      barattolo.set(nome, valore);
    }
  }
}

function headerCookie(barattolo: Map<string, string>): string {
  return [...barattolo].map(([n, v]) => `${n}=${v}`).join("; ");
}

/**
 * Login sul sito del fornitore. UN SOLO tentativo per run (il captcha di
 * Magento si attiva dopo ripetuti fallimenti): niente retry, mai throw.
 * Ritorna l'header Cookie pronto per fetchProdottoBlt, o null se fallito.
 */
export async function loginBlt(
  email: string,
  password: string,
): Promise<string | null> {
  try {
    const barattolo = new Map<string, string>();

    // 1. GET pagina login: form_key + cookie iniziali (seguendo a mano al
    //    massimo 3 redirect, per non perdere i set-cookie intermedi).
    //    Timeout 8s per fetch: il budget totale della action resta sotto i 60s.
    let urlCorrente = URL_LOGIN;
    let paginaLogin = "";
    for (let salto = 0; salto < 3; salto++) {
      const res = await fetch(urlCorrente, {
        headers: { ...HEADER_BROWSER, Cookie: headerCookie(barattolo) },
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      });
      accumulaCookie(res, barattolo);
      if (res.status >= 300 && res.status < 400) {
        const destinazione = res.headers.get("location");
        if (!destinazione) return null;
        urlCorrente = new URL(destinazione, urlCorrente).toString();
        // Mai inoltrare i cookie fuori dal sito del fornitore (SSRF/leak).
        if (!urlFornitoreValido(urlCorrente)) return null;
        continue;
      }
      if (!res.ok) return null;
      paginaLogin = await res.text();
      break;
    }
    const formKey =
      paginaLogin.match(/name="form_key"[^>]*value="([^"]+)"/) ??
      paginaLogin.match(/value="([^"]+)"[^>]*name="form_key"/);
    if (!formKey) return null;

    // 2. POST credenziali (1 solo tentativo, redirect manuale per leggere
    //    Location e cookie della risposta).
    const corpo = new URLSearchParams({
      form_key: formKey[1],
      "login[username]": email,
      "login[password]": password,
      send: "",
    });
    const res = await fetch(URL_LOGIN_POST, {
      method: "POST",
      headers: {
        ...HEADER_BROWSER,
        Cookie: headerCookie(barattolo),
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: `https://${HOST_FORNITORE}`,
        Referer: URL_LOGIN,
      },
      body: corpo.toString(),
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    accumulaCookie(res, barattolo);

    // Successo: redirect verso l'area cliente (NON di nuovo sul login) e
    // sessione presente nel barattolo.
    if (res.status < 300 || res.status >= 400) return null;
    const destinazione = res.headers.get("location") ?? "";
    if (!destinazione || /login/i.test(destinazione)) return null;
    if (!barattolo.has("PHPSESSID")) return null;
    return headerCookie(barattolo);
  } catch {
    return null; // rete, timeout, HTML inatteso: mai lanciare
  }
}

/**
 * Scarica l'HTML di una pagina del fornitore (UA browser, timeout 15s, corpo
 * troncato a ~3MB). I redirect sono seguiti A MANO e ogni salto e riverificato
 * contro la whitelist: con redirect:"follow" un 3xx del fornitore trascinerebbe
 * la fetch su host arbitrari (SSRF). Lancia su URL non valido o errore HTTP:
 * il chiamante (server action) traduce in un errore parlante.
 */
export async function fetchProdottoBlt(
  url: string,
  cookie?: string | null,
): Promise<string> {
  if (!urlFornitoreValido(url)) {
    throw new Error("URL non del fornitore supportato.");
  }
  let urlCorrente = url;
  let res: Response | null = null;
  for (let salto = 0; salto < 5; salto++) {
    const r = await fetch(urlCorrente, {
      headers: cookie ? { ...HEADER_BROWSER, Cookie: cookie } : HEADER_BROWSER,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (r.status >= 300 && r.status < 400) {
      const destinazione = r.headers.get("location");
      if (!destinazione) throw new Error("Redirect senza destinazione.");
      urlCorrente = new URL(destinazione, urlCorrente).toString();
      if (!urlFornitoreValido(urlCorrente)) {
        throw new Error("Redirect fuori dal sito del fornitore.");
      }
      continue;
    }
    res = r;
    break;
  }
  if (!res) throw new Error("Troppi redirect dal fornitore.");
  if (!res.ok) {
    throw new Error(`Il fornitore ha risposto ${res.status}.`);
  }

  // Lettura a pezzi con tetto ~3MB: la pagina prodotto sta ampiamente sotto,
  // e i dati utili al parser sono comunque nella prima parte del documento.
  const MAX_BYTE = 3 * 1024 * 1024;
  if (!res.body) return (await res.text()).slice(0, MAX_BYTE);
  const lettore = res.body.getReader();
  const pezzi: Uint8Array[] = [];
  let totale = 0;
  while (totale < MAX_BYTE) {
    const { done, value } = await lettore.read();
    if (done) break;
    pezzi.push(value);
    totale += value.byteLength;
  }
  if (totale >= MAX_BYTE) await lettore.cancel().catch(() => {});
  const unito = new Uint8Array(Math.min(totale, MAX_BYTE));
  let offset = 0;
  for (const pezzo of pezzi) {
    const spazio = unito.length - offset;
    if (spazio <= 0) break;
    unito.set(spazio >= pezzo.length ? pezzo : pezzo.subarray(0, spazio), offset);
    offset += Math.min(pezzo.length, spazio);
  }
  return new TextDecoder("utf-8").decode(unito);
}
