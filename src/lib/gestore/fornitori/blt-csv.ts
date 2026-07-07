// Catalogo CSV di Ingrosso BLT: download dall'area riservata + parsing.
// Il fornitore rigenera il file ogni mattina alle 5:00 ed e scaricabile SOLO da
// loggati (nessun link diretto/token). Qui si riusa il login di ingrossoblt.ts
// per prendere il cookie di sessione e si scarica l'export completo.
//
// Modulo puro (niente "use server"): lo usa il cron di sync lato server. Il
// contenuto del fornitore e un DATO non fidato — si legge con un parser
// tollerante, mai eval/inject.

import {
  ACCEPT_ENCODING_FORNITORE,
  HOST_FORNITORE,
  UA_FORNITORE,
  urlFornitoreValido,
} from "@/lib/gestore/fornitori/ingrossoblt";

// URL del bottone "Scarica Catalogo CSV" (modulo Magento catalogexport),
// verificato dal vivo: risponde 200 text/csv da loggati.
export const URL_CATALOGO_CSV = `https://${HOST_FORNITORE}/catalogexport/catalog/download/`;

// Tetto di sicurezza: l'export reale e ~4MB; oltre i 64MB qualcosa e andato
// storto (pagina di errore, redirect a HTML) e si abortisce.
const MAX_CSV_BYTE = 64 * 1024 * 1024;

const HEADER_CSV: Record<string, string> = {
  "User-Agent": UA_FORNITORE,
  Accept: "text/csv,application/octet-stream,text/plain,*/*;q=0.8",
  "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
  "Accept-Encoding": ACCEPT_ENCODING_FORNITORE,
};

/**
 * Scarica l'export CSV completo del catalogo. Richiede il cookie di sessione di
 * loginBlt. Redirect seguiti A MANO e riverificati contro la whitelist host
 * (difesa SSRF, come nelle altre fetch verso il fornitore). Lancia con messaggio
 * parlante su login scaduto (torna HTML di login), URL fuori host o risposta non
 * CSV.
 */
export async function scaricaCatalogoCsv(cookie: string): Promise<string> {
  const scadenza = Date.now() + 60_000; // budget cumulativo download
  let urlCorrente = URL_CATALOGO_CSV;
  let res: Response | null = null;
  for (let salto = 0; salto < 5; salto++) {
    if (Date.now() >= scadenza) throw new Error("Download CSV troppo lento.");
    const r = await fetch(urlCorrente, {
      headers: { ...HEADER_CSV, Cookie: cookie },
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(Math.min(45_000, Math.max(1_000, scadenza - Date.now()))),
    });
    if (r.status >= 300 && r.status < 400) {
      const dest = r.headers.get("location");
      if (!dest) throw new Error("Redirect senza destinazione dal fornitore.");
      urlCorrente = new URL(dest, urlCorrente).toString();
      // Un redirect verso /customer/account/login/ = sessione scaduta.
      if (/customer\/account\/login/i.test(urlCorrente)) {
        throw new Error("Sessione BLT scaduta: il download ha reindirizzato al login.");
      }
      if (!urlFornitoreValido(urlCorrente)) {
        throw new Error("Redirect fuori dal sito del fornitore.");
      }
      continue;
    }
    res = r;
    break;
  }
  if (!res) throw new Error("Troppi redirect nel download del CSV.");
  if (!res.ok) throw new Error(`Il fornitore ha risposto ${res.status} al download del CSV.`);

  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  if (!/csv|octet-stream|text\/plain/.test(contentType)) {
    throw new Error(`Risposta non CSV (content-type: ${contentType || "assente"}).`);
  }
  const dichiarata = Number(res.headers.get("content-length") ?? 0);
  if (dichiarata > MAX_CSV_BYTE) throw new Error("CSV troppo grande.");

  const testo = await res.text();
  if (testo.length > MAX_CSV_BYTE) throw new Error("CSV troppo grande.");
  if (!testo.startsWith("sku_parent")) {
    throw new Error("Il CSV scaricato non ha l'intestazione attesa.");
  }
  return testo;
}

// --- Parsing ------------------------------------------------------------------

/** Toglie il trucco Excel `="..."` usato dal fornitore su taglia ed EAN. */
function pulisci(v: string | undefined): string {
  return (v ?? "").replace(/^="([\s\S]*)"$/, "$1").trim();
}

/**
 * Mini parser CSV con gestione virgolette (RFC 4180) e newline dentro i campi.
 * Zero dipendenze: il file e generato da Magento, formato regolare.
 */
export function parseCsv(testo: string): string[][] {
  const righe: string[][] = [];
  let campo = "";
  let record: string[] = [];
  let inQuote = false;
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    if (inQuote) {
      if (c === '"') {
        if (testo[i + 1] === '"') { campo += '"'; i++; }
        else inQuote = false;
      } else campo += c;
    } else if (c === '"') inQuote = true;
    else if (c === ",") { record.push(campo); campo = ""; }
    else if (c === "\r") { /* ignora */ }
    else if (c === "\n") { record.push(campo); righe.push(record); record = []; campo = ""; }
    else campo += c;
  }
  if (campo !== "" || record.length) { record.push(campo); righe.push(record); }
  return righe;
}

// Scala adulto del negozio (a DB mai "XXL", sempre "2XL").
const TAGLIE_ADULTO = new Set([
  "XXS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL",
]);

/**
 * Normalizza la taglia del CSV sulla scala del negozio, per poterla confrontare
 * con `varianti.taglia`. Adulto ("XXL"→"2XL"), taglia unica, bambino per eta
 * ("5-6", "9-11"), numero singolo (≤16). Le sconosciute (es. numeri cappello
 * "58") si tengono in MAIUSCOLO cosi possono comunque combaciare 1:1 col DB.
 * Logica gia validata sui dati reali nei dry-run.
 */
export function normalizzaTagliaBlt(grezza: string): string {
  const t = pulisci(grezza).replace(/\s+/g, " ").trim();
  if (!t) return "";
  let U = t.toUpperCase();
  if (U === "XXL") U = "2XL";
  if (U === "XXXL") U = "3XL";
  if (U === "XXXXL") U = "4XL";
  if (TAGLIE_ADULTO.has(U)) return U;
  if (/^(taglia\s*)?unica$|^tu$|^one[\s-]?size$/i.test(t)) return "Taglia unica";
  const anni = U.match(/^(\d{1,2})\s*ANNI$/);
  if (anni) return `${Number(anni[1])} anni`;
  const range = t.match(/^(\d{1,2})\s*[-/]\s*(\d{1,2})$/);
  if (range) return `${Number(range[1])}-${Number(range[2])}`;
  const num = t.match(/^(\d{1,2})$/);
  if (num && Number(num[1]) <= 16) return String(Number(num[1]));
  return U;
}

/** Prezzo ingrosso testuale ("17,00", "3,45") in centesimi; null se non numerico. */
function prezzoIngrossoCents(testo: string): number | null {
  const pulito = pulisci(testo).replace(/[^\d.,]/g, "").replace(/[.,]+$/, "");
  if (!pulito) return null;
  const normalizzato = pulito.includes(",")
    ? pulito.replace(/\./g, "").replace(",", ".")
    : pulito;
  const n = Number(normalizzato);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

export interface VoceCatalogoBlt {
  /** Semaforo grezzo del fornitore: "In stock" | "Low stock" | "No stock" | "". */
  semaforo: string;
  /** Costo ingrosso in centesimi (per prodotto), null se non leggibile. */
  costoCents: number | null;
}

export interface IndiceCatalogoBlt {
  /** chiave `PARENT||tagliaNorm` -> voce (per il match giacenza). */
  perVariante: Map<string, VoceCatalogoBlt>;
  /** PARENT -> costo ingrosso in centesimi (per gli avvisi prezzo). */
  costoPerParent: Map<string, number | null>;
  /** Tutti gli sku_parent presenti (per il match a livello prodotto). */
  parents: Set<string>;
  righeDati: number;
  prodotti: number;
}

/**
 * Indicizza il CSV per il sync: una voce per (parent, taglia) col semaforo e il
 * costo. Considera le righe "Sku Child" (una per taglia) e "Sku Standalone"
 * (accessori a taglia unica); ignora le righe "Sku Parent" riassuntive (senza
 * giacenza). I parent sono normalizzati in MAIUSCOLO (come i codici a DB).
 */
export function indicizzaCatalogoCsv(testo: string): IndiceCatalogoBlt {
  const righe = parseCsv(testo);
  const H = Object.fromEntries(righe[0].map((h, i) => [h, i]));
  const perVariante = new Map<string, VoceCatalogoBlt>();
  const costoPerParent = new Map<string, number | null>();
  const parents = new Set<string>();
  let righeDati = 0;

  for (const r of righe.slice(1)) {
    const parent = pulisci(r[H.sku_parent]).toUpperCase();
    if (!parent) continue;
    const tipo = (r[H.sku_type] ?? "").trim();
    if (tipo !== "Sku Child" && tipo !== "Sku Standalone") continue;
    righeDati++;
    parents.add(parent);
    const taglia = tipo === "Sku Standalone" ? "Taglia unica" : normalizzaTagliaBlt(r[H.taglia]);
    const costoCents = prezzoIngrossoCents(r[H.price]);
    perVariante.set(`${parent}||${taglia}`, { semaforo: pulisci(r[H.stock]), costoCents });
    // Costo del prodotto: primo valore valido incontrato per il parent.
    if (costoCents !== null && !costoPerParent.has(parent)) {
      costoPerParent.set(parent, costoCents);
    } else if (!costoPerParent.has(parent)) {
      costoPerParent.set(parent, null);
    }
  }
  return { perVariante, costoPerParent, parents, righeDati, prodotti: parents.size };
}

/**
 * Aggancia il codice prodotto del sito allo sku_parent del CSV. Match diretto,
 * oppure — per le schede BAMBINO create dallo split uomo/bambino col suffisso
 * "-B" — riprova senza il "-B". Null se il codice non e nel CSV.
 */
export function parentDaCodice(
  codice: string | null | undefined,
  parents: Set<string>,
): string | null {
  const c = (codice ?? "").trim().toUpperCase();
  if (!c) return null;
  if (parents.has(c)) return c;
  if (c.endsWith("-B") && parents.has(c.slice(0, -2))) return c.slice(0, -2);
  return null;
}

/** Disponibile a scaffale? Solo "No stock" (o vuoto) = esaurito. */
export function giacenzaDisponibile(semaforo: string): boolean {
  const s = semaforo.trim().toLowerCase();
  return s !== "" && s !== "no stock" && s !== "out of stock";
}
