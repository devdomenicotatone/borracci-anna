// Tassonomia di catalogo condivisa (vetrina + area gestore): scala taglie e
// palette colori. UNICA fonte di verita cosi editor gestore e scheda vendita
// mostrano gli stessi colori/taglie e generano gli stessi SKU.

import { slugify } from "@/lib/gestore/slug";

// ===========================================================================
// TAGLIE — scala ordinata dalla S alla 6XL (oltre la XL si usa la forma "nXL").
// ===========================================================================

export const TAGLIE = [
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

export type Taglia = (typeof TAGLIE)[number];

/** Indice di ordinamento di una taglia (le sconosciute vanno in fondo). */
export function ordineTaglia(t: string | null | undefined): number {
  const i = TAGLIE.indexOf((t ?? "").toUpperCase() as Taglia);
  return i === -1 ? TAGLIE.length : i;
}

/** Ordina una lista di taglie secondo la scala (S → 6XL), ignorando i duplicati. */
export function ordinaTaglie(taglie: Iterable<string>): string[] {
  return [...new Set(taglie)].sort((a, b) => ordineTaglia(a) - ordineTaglia(b));
}

// ===========================================================================
// COLORI — palette fissa con campioni. I nomi seguono i dati reali (femminili
// dove concordano con "polo": Bianca, Grigia). Per un colore fuori palette il
// chip degrada a un campione neutro: nessun errore, solo niente swatch dedicato.
// ===========================================================================

export interface Colore {
  /** Nome mostrato e salvato su `varianti.colore` (es. "Bluette"). */
  nome: string;
  /** Campione esadecimale. */
  hex: string;
}

export const COLORI: readonly Colore[] = [
  { nome: "Bianca", hex: "#ffffff" },
  { nome: "Panna", hex: "#f3ece0" },
  { nome: "Beige", hex: "#d9c6a5" },
  { nome: "Cammello", hex: "#c19a6b" },
  { nome: "Giallo", hex: "#f4c430" },
  { nome: "Senape", hex: "#c9a227" },
  { nome: "Arancione", hex: "#ef7d1a" },
  { nome: "Corallo", hex: "#ff6f61" },
  { nome: "Rosso", hex: "#d22f27" },
  { nome: "Bordeaux", hex: "#6d1a2d" },
  { nome: "Rosa", hex: "#f5a3c7" },
  { nome: "Fucsia", hex: "#d6336c" },
  { nome: "Viola", hex: "#6f42c1" },
  { nome: "Celeste", hex: "#9fd8ef" },
  { nome: "Azzurro", hex: "#5bb8e6" },
  { nome: "Bluette", hex: "#3f7fd6" },
  { nome: "Blu", hex: "#1f3a8a" },
  { nome: "Navy", hex: "#1b2545" },
  { nome: "Menta", hex: "#9fe3c8" },
  { nome: "Verde", hex: "#2e8b57" },
  { nome: "Verde militare", hex: "#4b5320" },
  { nome: "Grigia", hex: "#9aa3ab" },
  { nome: "Antracite", hex: "#3a3f44" },
  { nome: "Marrone", hex: "#6f4e37" },
  { nome: "Nero", hex: "#111418" },
] as const;

const COLORE_HEX = new Map(COLORI.map((c) => [c.nome.toLowerCase(), c.hex]));

// Alias per i nomi a testo libero (es. dalla feature AI): forme maschili,
// composti e sfumature comuni che non sono voci della palette ma vanno
// comunque mostrate con un campione sensato.
const ALIAS_HEX: Record<string, string> = {
  bianco: "#ffffff",
  grigio: "#9aa3ab",
  "grigio melange": "#c2c8cd",
  "grigio chiaro": "#ced4d9",
  "grigio scuro": "#5b6168",
  nero: "#111418",
  rosso: "#d22f27",
  verde: "#2e8b57",
  "verde acqua": "#73c8b8",
  "verde militare": "#4b5320",
  "blu navy": "#1b2545",
  "blu notte": "#1b2545",
  "blu elettrico": "#2a52be",
  giallo: "#f4c430",
  arancio: "#ef7d1a",
  marrone: "#6f4e37",
  viola: "#6f42c1",
  rosa: "#f5a3c7",
};

/** Campione neutro per i colori fuori palette (es. dati legacy a testo libero). */
const HEX_FALLBACK = "#d4d4d8";

/**
 * Esadecimale di un colore per nome. Prova: match esatto in palette/alias,
 * poi scansione per parola (l'ultima parola riconosciuta vince, es. "Blu navy"
 * -> "navy"). Fallback neutro se proprio ignoto.
 */
export function coloreHex(nome: string | null | undefined): string {
  if (!nome) return HEX_FALLBACK;
  const k = nome.trim().toLowerCase();
  const esatto = COLORE_HEX.get(k) ?? ALIAS_HEX[k];
  if (esatto) return esatto;
  const parole = k.split(/[\s/-]+/).filter(Boolean);
  for (let i = parole.length - 1; i >= 0; i--) {
    const h = COLORE_HEX.get(parole[i]) ?? ALIAS_HEX[parole[i]];
    if (h) return h;
  }
  return HEX_FALLBACK;
}

// Forme a testo libero (generi maschili/femminili, composti, sfumature) che NON
// sono voci di palette ma vanno ricondotte a quella giusta. Serve a normalizzare
// l'output della feature AI: "Azzurra" -> "Azzurro", "Blu navy" -> "Navy".
const NOME_CANONICO: Record<string, string> = {
  bianco: "Bianca",
  grigio: "Grigia",
  nera: "Nero",
  rossa: "Rosso",
  gialla: "Giallo",
  azzurra: "Azzurro",
  arancio: "Arancione",
  arancia: "Arancione",
  "blu navy": "Navy",
  "blu notte": "Navy",
  "blu marino": "Navy",
  "blu scuro": "Navy",
  "blu elettrico": "Blu",
  "verde acqua": "Menta",
  "grigio chiaro": "Grigia",
  "grigio melange": "Grigia",
  "grigio scuro": "Antracite",
};

const COLORE_NOME = new Map(COLORI.map((c) => [c.nome.toLowerCase(), c.nome]));

/**
 * Riporta un nome di colore (anche a testo libero, es. dalla AI) al nome esatto
 * della palette. Prova: match in palette/sinonimi, poi scansione per parola
 * (l'ultima riconosciuta vince, es. "Blu navy" -> "Navy"). Se proprio fuori
 * palette tiene il testo originale ripulito (niente perdita di dato).
 */
export function coloreCanonico(nome: string | null | undefined): string {
  const raw = (nome ?? "").trim();
  if (!raw) return "";
  const k = raw.toLowerCase();
  const diretto = COLORE_NOME.get(k) ?? NOME_CANONICO[k];
  if (diretto) return diretto;
  const parole = k.split(/[\s/-]+/).filter(Boolean);
  for (let i = parole.length - 1; i >= 0; i--) {
    const p = COLORE_NOME.get(parole[i]) ?? NOME_CANONICO[parole[i]];
    if (p) return p;
  }
  return raw;
}

/**
 * Vero se il campione e molto chiaro: il chip allora vuole un bordo/contrasto
 * scuro per restare visibile sul bianco. Luminanza percettiva (Rec. 709).
 */
export function coloreChiaro(hex: string): boolean {
  const h = hex.replace("#", "");
  if (h.length < 6) return true;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.8;
}

// ===========================================================================
// SKU — generato da una base (codice prodotto o, in mancanza, slug) + colore +
// taglia (parti vuote saltate).
//   ABC123 + Blu + M  -> "abc123-blu-m"
//   coreana + Blu     -> "coreana-blu"
// ===========================================================================

export function skuVariante(
  base: string,
  colore: string | null | undefined,
  taglia: string | null | undefined,
): string {
  return slugify(
    [base, colore ?? "", taglia ?? ""].filter(Boolean).join("-"),
  );
}
