// Parser e login del fornitore Ingrosso BLT (www.ingrossoblt.com, Magento 2).
// Modulo puro senza "use server": le server action di import lo usano lato
// server (le credenziali e il cookie di sessione non passano MAI dal client).
//
// L'HTML del fornitore e server-rendered: qui si estrae tutto con regex e
// bracket-matching tolleranti (zero dipendenze nuove). Ogni campo e best
// effort: se un pezzo di pagina cambia o manca, si degrada a null/[]/"" senza
// mai lanciare da parseProdottoBlt.

import {
  TAGLIA_UNICA,
  TAGLIE,
  eTagliaCappello,
  eTagliaPallone,
  ordinaTaglie,
  tagliaCanonica,
} from "@/lib/catalogo";

// --- Contratto condiviso ------------------------------------------------------

export interface ProdottoBlt {
  nome: string; //                  es. "Maglia Calcio Palermo 25/26"
  codice: string | null; //         es. "PA0126"
  prezzoIngrossoCents: number | null; //  IVA esclusa (finalPrice)
  prezzoIvatoCents: number | null; //     ingrosso × 1.22 arrotondato
  prezzoConsigliatoCents: number | null; // prezzo consigliato al pubblico, se visibile
  foto: string[]; //                URL assoluti, deduplicati, in ordine galleria
  taglie: string[]; //              [] se non rilevabili
  colore: string | null; //         un solo colore per scheda (ogni URL = un colore); null se non rilevato
  target: TargetBlt | null; //      pubblico dichiarato dal fornitore; null se non rilevato
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

/**
 * Normalizza una candidata taglia o null se non e una taglia. Riconosce:
 * adulto ("m", "XXL"→"2XL"), bambino per eta ("6 Anni"→"6 anni"), range del
 * fornitore ("3-4", "9-11", "3/4"→"3-4") e numero singolo sportswear ("6".."16").
 * Le taglie bambino restano VERBATIM (una etichetta fornitore = una taglia): il
 * fornitore usa entrambi i sistemi e vanno mappati 1:1, senza spezzarli.
 */
function normalizzaTaglia(grezza: string): string | null {
  const testo = decodificaEntita(grezza).replace(/\s+/g, " ").trim();
  // Adulto: scala del negozio con l'alias del fornitore ("XXL"→"2XL") applicato
  // da tagliaCanonica, unica sorgente in lib/catalogo.
  const maiuscola = tagliaCanonica(testo);
  if ((TAGLIE as readonly string[]).includes(maiuscola)) {
    return maiuscola;
  }
  // Taglia unica esposta dal fornitore ("Unica", "Taglia unica", "TU", "One
  // size"): normalizzata sull'etichetta del negozio (TAGLIA_UNICA in
  // lib/catalogo). Un solo valore, mai una scala.
  if (/^(taglia\s*)?unica$|^tu$|^one[\s-]?size$/i.test(testo)) {
    return TAGLIA_UNICA;
  }
  const anni = maiuscola.match(/^(\d{1,2})\s*ANNI$/);
  if (anni) return `${parseInt(anni[1], 10)} anni`;
  // Bambino: range per eta ("3-4", "9-11", anche con "/").
  const range = testo.match(/^(\d{1,2})\s*[-/]\s*(\d{1,2})$/);
  if (range) return `${parseInt(range[1], 10)}-${parseInt(range[2], 10)}`;
  // Bambino: numero singolo sportswear (fino a 16).
  const num = testo.match(/^(\d{1,2})$/);
  if (num && parseInt(num[1], 10) <= 16) return String(parseInt(num[1], 10));
  // Cappello: misura di circonferenza (40–70 cm), tenuta come numero.
  if (eTagliaCappello(testo)) return String(parseInt(testo, 10));
  // Pallone: "Misura N" (1–5). Il fornitore vende ogni misura come prodotto a se
  // (la misura e nel nome), ma se comparisse come opzione la si tiene com'e.
  if (eTagliaPallone(testo)) return `Misura ${testo.replace(/^\D+/, "")}`;
  return null;
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
  //    data-status "1" = disponibile; le taglie a "0" vengono scartate. Il
  //    trattino nel gruppo cattura i range bambino interi ("bundle-options-3-4"
  //    -> "3-4"), altrimenti si troncherebbero a un numero singolo spurio.
  for (const m of html.matchAll(
    /data-status="(\d)"[^>]*class="[^"]*bundle-options-([A-Za-z0-9-]{1,8})/g,
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

  const taglie: string[] = [];
  for (const c of candidate) {
    const t = normalizzaTaglia(c);
    if (t) taglie.push(t);
  }
  // ordinaTaglie deduplica e ordina con la stessa scala della vetrina/gestore.
  return ordinaTaglie(taglie);
}

// --- Target (pubblico) ----------------------------------------------------------

// Pubblico dichiarato dal fornitore: compare come "Target - Colore" nel div
// `product_detail_sku target`, presente sia sulla scheda sia sulle card dei
// listing (verificato dal vivo: tutte le 25 card di una pagina listing lo
// avevano valorizzato). E la chiave dello smistamento per categoria del
// flusso massivo di import.
export type TargetBlt = "uomo" | "donna" | "bambino" | "unisex";

/**
 * Testo del sottotitolo "Target - Colore" (div `product_detail_sku target`),
 * normalizzato negli spazi, o null se il div manca o e vuoto.
 */
function testoTargetColore(html: string): string | null {
  const div = html.match(/product_detail_sku target"[^>]*>\s*([^<]{1,80}?)\s*</);
  if (!div) return null;
  const testo = decodificaEntita(div[1]).replace(/\s+/g, " ").trim();
  return testo || null;
}

/** Normalizza il testo target sui quattro valori noti del fornitore, o null. */
function normalizzaTarget(testo: string): TargetBlt | null {
  const t = testo.trim().toLowerCase();
  return t === "uomo" || t === "donna" || t === "bambino" || t === "unisex"
    ? (t as TargetBlt)
    : null;
}

/**
 * Target dal sottotitolo "Target - Colore": la parte PRIMA del primo " - "
 * (es. "Uomo - Grigio Antracite" -> "uomo"). Sulla scheda ci si ancora al
 * blocco principale (product-info-main) quando c'e: anche le card dei prodotti
 * correlati hanno un div target e la prima occorrenza del documento potrebbe
 * essere la loro. Sui frammenti di card listing l'ancora manca e si cerca
 * dall'inizio. Best effort: null se il div manca o il testo non e un target noto.
 */
function estraiTarget(html: string): TargetBlt | null {
  const inizio = html.indexOf('class="product-info-main"');
  const testo = testoTargetColore(inizio === -1 ? html : html.slice(inizio));
  if (!testo) return null;
  return normalizzaTarget(testo.split(/\s[-–]\s/)[0]);
}

// --- Colore -------------------------------------------------------------------------

/**
 * Colore della scheda: ogni URL del fornitore e un solo colore (il suffisso SKU
 * ".NR"/".BI"/...). Due fonti leggibili sulla pagina LOGGATA, in ordine di
 * fiducia: (1) il JSON di tracking `productData` con la chiave "color":"Nero";
 * (2) il sottotitolo `<div class="product_detail_sku target">Bambino - Nero</div>`
 * (formato "Target - Colore"). Ritorna il NOME grezzo del colore (es. "Nero",
 * "Verde") o null; la mappatura sulla palette del negozio la fa l'import
 * (coloreCanonico). Verificato dal vivo: il JSON productData porta il colore
 * anche sugli articoli adulti (dove il div "target" e vuoto), quindi la fonte #1
 * copre praticamente sempre; null solo se manca del tutto (si sceglie a mano in
 * revisione). NON si deduce dal suffisso SKU: i codici a 2 lettere (BN, ...) sono
 * ambigui e un colore sbagliato e peggio di nessun colore.
 */
function estraiColore(html: string): string | null {
  // 1. JSON productData: {..., "color":"Nero"}. La chiave "color" compare solo
  //    li (finestra corta ancorata a productData, per non pescare altri JSON).
  const prod = html.indexOf("productData");
  if (prod !== -1) {
    const finestra = html.slice(prod, prod + 800);
    const m = finestra.match(/"color"\s*:\s*"([^"]{1,40})"/);
    if (m) {
      const c = decodificaEntita(m[1]).replace(/\s+/g, " ").trim();
      if (c) return c;
    }
  }
  // 2. Sottotitolo "Target - Colore": si prende la parte dopo l'ultimo " - ".
  //    "Colore: Non definito" e il testo del fornitore per "nessun colore"
  //    (verificato dal vivo): va scartato, non e un nome di colore.
  const testo = testoTargetColore(html);
  if (testo) {
    const parti = testo.split(/\s[-–]\s/);
    const c = parti.length > 1 ? parti[parti.length - 1].trim() : "";
    if (c && !/non definito/i.test(c)) return c;
  }
  return null;
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
    colore: estraiColore(html),
    target: estraiTarget(html),
    attributi,
    descrizioneFornitore: estraiDescrizione(html),
  };
}

// --- Listing / pagine categoria ---------------------------------------------------

export interface VoceListingBlt {
  /** URL assoluto della scheda prodotto. */
  url: string;
  /** SKU mostrato sulla card (es. "ITA003.BI"), null se non leggibile. */
  sku: string | null;
  /** Titolo della card, ripulito. */
  nome: string | null;
  /** Pubblico dichiarato sulla card ("Uomo - Nero"), null se non leggibile. */
  target: TargetBlt | null;
}

export interface ListingBlt {
  voci: VoceListingBlt[];
  /** Totale articoli della categoria (toolbar "Articoli X-Y di Z"), se leggibile. */
  totale: number | null;
  /** True se la pagina dichiara "nessun prodotto" (oltre l'ultima pagina o filtro vuoto). */
  vuota: boolean;
}

/**
 * True se l'HTML e una SCHEDA prodotto (e non una pagina listing). I marker
 * sono della scheda Magento (product-info-main / og:type=product): il listing
 * non li ha, e la scheda contiene si card "product-item" ma solo tra i correlati.
 * Le regex girano su una finestra iniziale e con quantificatori limitati: su
 * HTML ostile (host compromesso) `[^>]*` ripetuto degenererebbe in backtracking
 * quadratico, bloccando l'event loop per minuti (il fetch listing arriva a 8MB).
 */
export function eSchedaProdottoBlt(html: string): boolean {
  if (html.includes('class="product-info-main"')) return true; // includes: lineare
  const testa = html.slice(0, 500_000); // le meta og: stanno nell'head
  return (
    /<meta[^>]{0,300}property=["']og:type["'][^>]{0,300}content=["']product["']/i.test(
      testa,
    ) ||
    /<meta[^>]{0,300}content=["']product["'][^>]{0,300}property=["']og:type["']/i.test(
      testa,
    )
  );
}

/**
 * URL della pagina `pagina` di un listing: preserva i filtri della query
 * (target, product_typology, ...) e imposta/rimuove il parametro `p` di Magento.
 */
export function paginaListingBlt(url: string, pagina: number): string {
  const u = new URL(url);
  if (pagina <= 1) u.searchParams.delete("p");
  else u.searchParams.set("p", String(pagina));
  return u.toString();
}

/**
 * Estrae le card prodotto da una pagina listing Magento. Best effort, mai
 * throw: ogni card e il blocco che inizia a `product-item-info`; dentro si
 * leggono il link scheda (anchor `product-item-link`, l'unico con quella
 * classe), il titolo, lo SKU della card (`product_detail_sku_inside`) e il
 * target (`product_detail_sku target`).
 */
export function parseListingBlt(html: string): ListingBlt {
  // Totale dal toolbar ("Articoli 1-25 di 60", o "10 Articoli" su pagina
  // unica): l'ultimo numero del blocco e in entrambi i casi il totale.
  let totale: number | null = null;
  const toolbar = html.match(/class="toolbar-amount"[^>]*>([\s\S]{0,400}?)<\/p>/);
  if (toolbar) {
    const numeri = [...toolbar[1].matchAll(/toolbar-number"[^>]*>\s*(\d[\d.]*)/g)]
      .map((m) => parseInt(m[1].replace(/\./g, ""), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (numeri.length > 0) totale = numeri[numeri.length - 1];
  }

  const voci: VoceListingBlt[] = [];
  const visti = new Set<string>();
  // Il primo segmento (prima della prima card) si scarta; l'ultimo arriva a
  // fine documento ma dopo le card non ci sono altri anchor product-item-link.
  const segmenti = html.split(/class="product-item-info"/).slice(1);
  for (const segmento of segmenti) {
    // Link e SKU stanno nei primi KB della card: finestra corta e quantificatori
    // limitati, per non degenerare in backtracking quadratico su HTML ostile.
    const finestra = segmento.slice(0, 30_000);
    // Anchor del titolo, tollerante all'ordine degli attributi.
    const anchor = finestra.match(
      /<a\s[^>]{0,500}product-item-link[^>]{0,500}>([\s\S]{0,1000}?)<\/a>/,
    );
    if (!anchor) continue;
    const href = anchor[0].match(/href="([^"]+)"/);
    if (!href) continue;
    const url = decodificaEntita(href[1]).trim();
    // Solo schede del fornitore (.html, eventuale query ignorabile ma sospetta:
    // le schede reali non ne hanno).
    if (!urlFornitoreValido(url) || !/\.html$/.test(url)) continue;
    if (visti.has(url)) continue;
    visti.add(url);

    const nome = testoPiano(anchor[1]) || null;
    const skuMatch = finestra.match(
      /product_detail_sku_inside[^>]*>[\s\S]{0,80}?Sku:\s*([^<\s][^<]*?)\s*</i,
    );
    const sku = skuMatch
      ? decodificaEntita(skuMatch[1]).trim().toUpperCase().slice(0, 40) || null
      : null;
    voci.push({ url, sku, nome, target: estraiTarget(finestra) });
  }

  // "Nessun prodotto": il banner "message info empty" compare nella SIDEBAR di
  // OGNI pagina della categoria (verificato sul sito reale), quindi da solo non
  // dice nulla. La pagina e vuota solo se non c'e nemmeno una card.
  const vuota =
    voci.length === 0 && /class="message info empty"/.test(html);
  return { voci, totale, vuota };
}

// --- Rete: login e download -----------------------------------------------------------------

/**
 * Errore di download dal fornitore. `status` e lo status HTTP (se c'e stata
 * una risposta); `throttled` segnala un blocco temporaneo — 403 del WAF quando
 * arrivano troppe richieste, 429, o un 5xx passeggero — per cui ha senso
 * rallentare e riprovare, invece di trattarlo come un errore definitivo del
 * singolo prodotto. Il chiamante lo usa per mettere in cooldown il batch.
 */
export class ErroreFornitore extends Error {
  readonly status?: number;
  readonly throttled: boolean;
  /** Attesa suggerita dal fornitore (header Retry-After) in ms, se presente. */
  readonly retryAfterMs?: number;
  constructor(
    messaggio: string,
    opzioni?: { status?: number; throttled?: boolean; retryAfterMs?: number },
  ) {
    super(messaggio);
    this.name = "ErroreFornitore";
    this.status = opzioni?.status;
    this.throttled = opzioni?.throttled ?? false;
    this.retryAfterMs = opzioni?.retryAfterMs;
  }
}

// Status per cui conviene rallentare e riprovare invece di arrendersi: il
// fornitore ci sta frenando (403 dal WAF su troppe richieste ravvicinate, 429)
// o ha un intoppo temporaneo (5xx, 408). Ogni altro status e un errore vero.
const STATUS_THROTTLING = new Set([403, 408, 429, 500, 502, 503, 504]);

/** True se lo status merita rallentamento+retry (WAF/5xx passeggero) invece di errore. */
export function eStatoThrottlingFornitore(status: number): boolean {
  return STATUS_THROTTLING.has(status);
}

/**
 * Retry-After della risposta convertito in ms. Gestisce sia il formato a secondi
 * ("30") sia la data HTTP ("Wed, 21 Oct 2026 07:28:00 GMT"); null se assente o
 * illeggibile. A differenza di prima NON cappa a 8s: chi lo usa decide il tetto
 * (il limiter ne applica uno sano), così un "Retry-After: 30" non viene tradito.
 */
export function retryAfterMsDaRisposta(res: Response): number | null {
  const v = res.headers.get("retry-after");
  if (!v) return null;
  const sec = Number(v);
  if (Number.isFinite(sec)) return sec > 0 ? sec * 1000 : 0;
  const data = Date.parse(v);
  if (Number.isFinite(data)) {
    const diff = data - Date.now();
    return diff > 0 ? diff : 0;
  }
  return null;
}

function dormi(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// --- Rate limiter globale adattivo (leaky-bucket + AIMD) ---------------------
// Un SOLO ritmo per tutto il traffico verso il fornitore (pagine, listing,
// foto): ogni richiesta prenota uno "slot" spaziato di `intervalloMs` dal
// precedente, così la sequenza pagina→foto→foto non parte a raffica — ed è il
// burst, non il volume medio, che fa scattare il 403 del WAF. L'intervallo è
// ADATTIVO (AIMD): parte prudente, scende dopo una serie di successi (additive
// decrease) e RADDOPPIA a ogni blocco (multiplicative increase), scoprendo da
// solo il ritmo che il fornitore tollera invece di ripartire a manetta. Lo
// stato vive per istanza serverless (best-effort, come cacheLogin): poiché il
// client dispatcha le action in serie, una istanza calda vede quasi tutto il
// traffico. Non coordina fra istanze diverse: quello è compito della coda in
// background (fase successiva).
const RATE_MIN_MS = 700; //         ritmo più veloce concesso (~85 req/min)
const RATE_MAX_MS = 9_000; //       freno massimo dopo blocchi ripetuti
const RATE_START_MS = 1_800; //     partenza prudente (~33 req/min)
const RATE_DECREMENTO_MS = 120; //  di quanto accelera a ogni tacca
const RATE_SUCCESSI_PER_TACCA = 12; // successi consecutivi per una tacca

const rateFornitore = {
  intervalloMs: RATE_START_MS,
  prossimoSlot: 0,
  successi: 0,
};

/**
 * Prenota il prossimo slot e attende fin lì. Con `scadenza` (epoch ms), se lo
 * slot cadrebbe OLTRE il budget non prenota e ritorna false: il chiamante lo
 * tratta come throttling temporaneo (rimanda l'item) invece di sforare il
 * maxDuration della action. Le richieste concorrenti (foto + pagina) restano
 * spaziate: la prenotazione dello slot è sincrona, prima dell'await.
 */
export async function attendiTurnoFornitore(scadenza?: number): Promise<boolean> {
  const ora = Date.now();
  const slot = Math.max(ora, rateFornitore.prossimoSlot);
  if (scadenza !== undefined && slot > scadenza) return false;
  rateFornitore.prossimoSlot = slot + rateFornitore.intervalloMs;
  const attesa = slot - ora;
  if (attesa > 0) await dormi(attesa);
  return true;
}

/** Esito positivo: dopo abbastanza successi consecutivi si accelera di una tacca. */
export function segnalaSuccessoFornitore(): void {
  if (++rateFornitore.successi >= RATE_SUCCESSI_PER_TACCA) {
    rateFornitore.successi = 0;
    rateFornitore.intervalloMs = Math.max(
      RATE_MIN_MS,
      rateFornitore.intervalloMs - RATE_DECREMENTO_MS,
    );
  }
}

/**
 * Blocco dal fornitore (403/429/5xx): raddoppia l'intervallo (fino a RATE_MAX_MS)
 * e rinvia il prossimo slot di `retryAfterMs` se noto (tetto 60s), altrimenti del
 * nuovo intervallo. Ritorna i ms di rinvio applicati, così il chiamante decide se
 * stanno nel proprio budget.
 */
export function segnalaBloccoFornitore(retryAfterMs?: number | null): number {
  rateFornitore.successi = 0;
  rateFornitore.intervalloMs = Math.min(
    RATE_MAX_MS,
    rateFornitore.intervalloMs * 2,
  );
  const rinvio =
    retryAfterMs != null && retryAfterMs > 0
      ? Math.min(retryAfterMs, 60_000)
      : rateFornitore.intervalloMs;
  rateFornitore.prossimoSlot = Math.max(
    rateFornitore.prossimoSlot,
    Date.now() + rinvio,
  );
  return rinvio;
}

// Header minimi da browser. NON inviamo i "client hints" (sec-ch-ua) né i
// Sec-Fetch-*: dichiarerebbero "sono Chrome 126" mentre l'impronta TLS (JA3) di
// Node/undici NON è quella di Chrome — un WAF che incrocia client-hints e TLS
// vede la discrepanza e ci marca come bot (verificato: aggiungerli non aiuta e
// può peggiorare). UA credibile + Accept + lingua bastano; Accept-Encoding è
// neutro (nessuna finta identità) e undici decomprime gzip/deflate/br da solo
// (MAI zstd: non lo decomprime e il corpo arriverebbe illeggibile).
export const CHROME_MAJOR_FORNITORE = "126";
export const UA_FORNITORE = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_MAJOR_FORNITORE}.0.0.0 Safari/537.36`;
export const ACCEPT_ENCODING_FORNITORE = "gzip, deflate, br";

const HEADER_BROWSER: Record<string, string> = {
  "User-Agent": UA_FORNITORE,
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
  "Accept-Encoding": ACCEPT_ENCODING_FORNITORE,
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

    // Budget CUMULATIVO dell'intero login (GET + redirect + POST): senza,
    // una catena di risposte lente sommerebbe i timeout per-fetch ben oltre
    // il budget della action (maxDuration 60s della pagina importa).
    const scadenza = Date.now() + 16_000;
    const timeoutResiduo = () =>
      AbortSignal.timeout(Math.min(8_000, Math.max(1_000, scadenza - Date.now())));

    // 1. GET pagina login: form_key + cookie iniziali (seguendo a mano al
    //    massimo 3 redirect, per non perdere i set-cookie intermedi).
    let urlCorrente = URL_LOGIN;
    let paginaLogin = "";
    for (let salto = 0; salto < 3; salto++) {
      if (Date.now() >= scadenza) return null;
      const res = await fetch(urlCorrente, {
        headers: { ...HEADER_BROWSER, Cookie: headerCookie(barattolo) },
        redirect: "manual",
        cache: "no-store",
        signal: timeoutResiduo(),
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
      signal: timeoutResiduo(),
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
 * troncato a `maxByte`). I redirect sono seguiti A MANO e ogni salto e
 * riverificato contro la whitelist: con redirect:"follow" un 3xx del fornitore
 * trascinerebbe la fetch su host arbitrari (SSRF). Lancia su URL non valido o
 * errore HTTP: il chiamante (server action) traduce in un errore parlante.
 */
async function fetchPaginaBlt(
  url: string,
  cookie: string | null | undefined,
  maxByte: number,
): Promise<string> {
  if (!urlFornitoreValido(url)) {
    throw new Error("URL non del fornitore supportato.");
  }
  // Budget CUMULATIVO su tutta la catena di redirect: il timeout per-fetch da
  // solo permetterebbe fino a 5 x 15s per un singolo download, sforando il
  // maxDuration della action chiamante.
  const scadenza = Date.now() + 20_000;
  let urlCorrente = url;
  let res: Response | null = null;
  let tentativiRetry = 0;
  // Il loop copre sia i redirect sia i retry da throttling: il tetto un po'
  // piu alto li lascia coesistere senza mai girare all'infinito (le schede
  // reali hanno 0-1 redirect, i retry sono al massimo 3).
  for (let salto = 0; salto < 9; salto++) {
    if (Date.now() >= scadenza) {
      throw new ErroreFornitore("Il fornitore e troppo lento.", {
        throttled: true,
      });
    }
    // Pacing globale: prenota il turno (spaziato e adattivo), redirect e retry
    // inclusi. Se non c'e turno entro il budget e come un throttling: si rimanda
    // l'item invece di sforare il maxDuration della action.
    if (!(await attendiTurnoFornitore(scadenza))) {
      throw new ErroreFornitore("Coda verso il fornitore troppo lunga.", {
        throttled: true,
      });
    }
    const r = await fetch(urlCorrente, {
      headers: cookie ? { ...HEADER_BROWSER, Cookie: cookie } : HEADER_BROWSER,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(
        Math.min(15_000, Math.max(1_000, scadenza - Date.now())),
      ),
    });
    if (r.status >= 300 && r.status < 400) {
      const destinazione = r.headers.get("location");
      if (!destinazione) throw new ErroreFornitore("Redirect senza destinazione.");
      urlCorrente = new URL(destinazione, urlCorrente).toString();
      if (!urlFornitoreValido(urlCorrente)) {
        throw new ErroreFornitore("Redirect fuori dal sito del fornitore.");
      }
      continue;
    }
    // Throttling (403/429/5xx): penalizza il rate limiter UNA SOLA volta per
    // risposta (raddoppia l'intervallo e rinvia il prossimo slot, rispettando
    // Retry-After), poi UN SOLO retry se il rinvio sta nel budget — prima erano 3
    // retry, che sparavano richieste ravvicinate proprio mentre il WAF frenava.
    // Se non si ritenta (retry esaurito o budget insufficiente), l'errore
    // throttled esce di qui col Retry-After: il chiamante mette in cooldown.
    if (STATUS_THROTTLING.has(r.status)) {
      await r.body?.cancel().catch(() => {});
      const retryAfterMs = retryAfterMsDaRisposta(r);
      const rinvio = segnalaBloccoFornitore(retryAfterMs);
      if (tentativiRetry < 1 && Date.now() + rinvio < scadenza) {
        tentativiRetry++;
        continue;
      }
      throw new ErroreFornitore(`Il fornitore ha risposto ${r.status}.`, {
        status: r.status,
        throttled: true,
        retryAfterMs: retryAfterMs ?? undefined,
      });
    }
    res = r;
    break;
  }
  if (!res) throw new ErroreFornitore("Troppi redirect dal fornitore.");
  if (!res.ok) {
    // Errore non-throttling (es. 404/410): nessuna penalità al rate limiter.
    throw new ErroreFornitore(`Il fornitore ha risposto ${res.status}.`, {
      status: res.status,
      throttled: false,
    });
  }
  segnalaSuccessoFornitore();

  // Lettura a pezzi con tetto: oltre `maxByte` si tronca (i dati utili ai
  // parser stanno comunque prima del tetto scelto dal chiamante).
  if (!res.body) return (await res.text()).slice(0, maxByte);
  const lettore = res.body.getReader();
  const pezzi: Uint8Array[] = [];
  let totale = 0;
  while (totale < maxByte) {
    const { done, value } = await lettore.read();
    if (done) break;
    pezzi.push(value);
    totale += value.byteLength;
  }
  if (totale >= maxByte) await lettore.cancel().catch(() => {});
  const unito = new Uint8Array(Math.min(totale, maxByte));
  let offset = 0;
  for (const pezzo of pezzi) {
    const spazio = unito.length - offset;
    if (spazio <= 0) break;
    unito.set(spazio >= pezzo.length ? pezzo : pezzo.subarray(0, spazio), offset);
    offset += Math.min(pezzo.length, spazio);
  }
  return new TextDecoder("utf-8").decode(unito);
}

/** Scarica una SCHEDA prodotto: sta ampiamente sotto i 3MB. */
export async function fetchProdottoBlt(
  url: string,
  cookie?: string | null,
): Promise<string> {
  return fetchPaginaBlt(url, cookie, 3 * 1024 * 1024);
}

/**
 * Scarica una pagina LISTING. Tetto piu alto delle schede: le pagine categoria
 * reali superano i 3MB (misurate fino a ~3,5MB) e con il tetto basso le ultime
 * card della pagina andrebbero perse in silenzio.
 */
export async function fetchListingBlt(
  url: string,
  cookie?: string | null,
): Promise<string> {
  return fetchPaginaBlt(url, cookie, 8 * 1024 * 1024);
}
