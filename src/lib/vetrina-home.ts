import "server-only";

// Caricamento della VETRINA a fasce (home curata). Legge le sezioni visibili
// ordinate e, per ognuna di tipo prodotti, risolve i prodotti da mostrare:
//   - prodotti_manuale -> i prodotti pinnati nella pivot, nell'ordine scelto;
//   - prodotti_auto     -> una regola (novita / una categoria / solo online).
// Le sezioni hero/banner/categorie non portano prodotti. Mai throw: su DB non
// configurato o errore degrada a una vetrina d'esempio / a quel che riesce a
// leggere, cosi la home rende sempre (anche in build senza env).

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import type {
  Categoria,
  ConfigVetrina,
  Prodotto,
  TipoSezioneVetrina,
} from "@/lib/types";
import { TIPI_SEZIONE_VETRINA } from "@/lib/types";
import { FILTRI_VUOTI } from "@/lib/filtri-catalogo";
import { caricaCategoriePubbliche } from "@/lib/categorie";
import { idConDiscendenti } from "@/lib/categorie-albero";
import {
  CAMPI_CARD,
  PRODOTTI_ESEMPIO,
  caricaProdottiVetrina,
  normalizzaCard,
  type RigaCard,
} from "@/lib/vetrina";

type Supabase = SupabaseClient<Database>;

/** Prodotti di default in un carosello quando il limite non e valido. */
const LIMITE_DEFAULT = 12;
/** Tetto di sicurezza al numero di card per fascia. */
const LIMITE_MAX = 24;

/** Una fascia della home pronta per il rendering (sezione + prodotti risolti). */
export interface FasciaVetrina {
  id: string;
  tipo: TipoSezioneVetrina;
  titolo: string | null;
  sottotitolo: string | null;
  config: ConfigVetrina;
  /** Prodotti del carosello (solo tipi prodotti_*); [] per hero/banner/categorie. */
  prodotti: Prodotto[];
  /** Href del "vedi tutti" del carosello, o null se non applicabile. */
  vediTuttiHref: string | null;
}

/** Hero statico riusato nei fallback (senza env o tabella non ancora creata). */
const FASCIA_HERO: FasciaVetrina = {
  id: "fallback-hero",
  tipo: "hero",
  titolo: "L'estate si veste da Anna Shop.",
  sottotitolo:
    "Capi freschi e leggeri, scelti uno a uno. Vieni a trovarci sul lungomare o te li spediamo a casa.",
  config: {
    occhiello: "Negozio sul lungomare di Rimini",
    ctaPrimariaLabel: "Scopri la collezione",
    ctaPrimariaHref: "/prodotti",
    ctaSecondariaLabel: "Vieni a trovarci",
    ctaSecondariaHref: "/vieni-a-trovarci",
    stickerAlto: "Estate 2026",
    stickerBasso: "☀ Rimini beach",
  },
  prodotti: [],
  vediTuttiHref: null,
};

/** Scorciatoie categorie (le tessere le popola il render dai gruppi). */
const FASCIA_CATEGORIE: FasciaVetrina = {
  id: "fallback-categorie",
  tipo: "categorie",
  titolo: "Compra per categoria",
  sottotitolo: null,
  config: { occhiello: "Trova il tuo stile" },
  prodotti: [],
  vediTuttiHref: null,
};

/** Vetrina minima quando Supabase non e configurato (build/anteprima). */
const VETRINA_ESEMPIO: FasciaVetrina[] = [
  FASCIA_HERO,
  FASCIA_CATEGORIE,
  {
    id: "esempio-collezione",
    tipo: "prodotti_auto",
    titolo: "La collezione",
    sottotitolo: null,
    config: { occhiello: "Fresche di stagione", regola: "novita" },
    prodotti: PRODOTTI_ESEMPIO,
    vediTuttiHref: "/prodotti",
  },
];

/**
 * Fallback quando il DB e raggiungibile ma la tabella sezioni non c'e ancora
 * (migration non applicata): hero + categorie + una fascia "novita" coi
 * prodotti REALI, cosi la home resta quella di sempre finche non si migra.
 */
async function vetrinaFallbackReale(
  supabase: Supabase,
): Promise<FasciaVetrina[]> {
  const esito = await caricaProdottiVetrina(supabase, {
    filtri: FILTRI_VUOTI,
    pagina: 1,
  });
  const fasce: FasciaVetrina[] = [FASCIA_HERO, FASCIA_CATEGORIE];
  if (esito.prodotti.length > 0) {
    fasce.push({
      id: "fallback-collezione",
      tipo: "prodotti_auto",
      titolo: "La collezione",
      sottotitolo: null,
      config: { occhiello: "Fresche di stagione", regola: "novita" },
      prodotti: esito.prodotti.slice(0, LIMITE_DEFAULT),
      vediTuttiHref: "/prodotti",
    });
  }
  return fasce;
}

function normalizzaTipo(t: unknown): TipoSezioneVetrina | null {
  return typeof t === "string" &&
    (TIPI_SEZIONE_VETRINA as readonly string[]).includes(t)
    ? (t as TipoSezioneVetrina)
    : null;
}

/** Config jsonb -> oggetto tipizzato, tollerante (mai lancia su dati storti). */
function normalizzaConfig(config: unknown): ConfigVetrina {
  return typeof config === "object" && config !== null && !Array.isArray(config)
    ? (config as ConfigVetrina)
    : {};
}

/** Limite valido nel range [1, LIMITE_MAX], default LIMITE_DEFAULT. */
function limiteValido(limite: number | undefined): number {
  if (typeof limite !== "number" || !Number.isFinite(limite) || limite < 1) {
    return LIMITE_DEFAULT;
  }
  return Math.min(Math.floor(limite), LIMITE_MAX);
}

/** Prodotti pinnati a mano su una sezione, attivi, nell'ordine scelto. */
async function prodottiPinnati(
  supabase: Supabase,
  sezioneId: string,
  limite: number,
): Promise<Prodotto[]> {
  const { data, error } = await supabase
    .from("vetrina_sezione_prodotti")
    // Embed sul FK singolo prodotto_id: `!inner` + attivo=true esclude i
    // pinnati nel frattempo disattivati (non devono comparire in vetrina).
    .select(`ordine, prodotti!inner(${CAMPI_CARD})`)
    .eq("sezione_id", sezioneId)
    .eq("prodotti.attivo", true)
    .order("ordine", { ascending: true })
    .limit(limite);
  if (error || !data) return [];
  return data
    .map((r) => (r as unknown as { prodotti: RigaCard }).prodotti)
    .filter(Boolean)
    .map(normalizzaCard);
}

/** Prodotti di una fascia automatica secondo la regola, + href "vedi tutti". */
async function prodottiAuto(
  supabase: Supabase,
  config: ConfigVetrina,
  categorie: Categoria[],
  limite: number,
): Promise<{ prodotti: Prodotto[]; href: string }> {
  const regola = config.regola ?? "novita";
  let query = supabase.from("prodotti").select(CAMPI_CARD).eq("attivo", true);
  let href = "/prodotti";

  if (regola === "categoria") {
    // Difesa: regola per categoria SENZA categoria scelta (config incompleta
    // salvata prima della validazione, o categoria eliminata): fascia vuota
    // (omessa in home) invece di degradare in silenzio a tutto il catalogo
    // sotto un titolo sbagliato. La validazione vera e in salvaSezioneAction.
    if (!config.categoriaId) return { prodotti: [], href };
    const ids = idConDiscendenti(categorie, config.categoriaId);
    query = query.in("categoria_id", ids);
    const cat = categorie.find((c) => c.id === config.categoriaId);
    if (cat) href = `/categoria/${cat.slug}`;
  } else if (regola === "solo_online") {
    query = query.eq("solo_online", true);
  }

  // Sempre i piu recenti prima (come il default "Novita" del catalogo), con
  // tie-break stabile per id.
  const { data, error } = await query
    .order("creato_il", { ascending: false })
    .order("id", { ascending: true })
    .limit(limite);
  if (error || !data) return { prodotti: [], href };
  return {
    prodotti: (data as unknown as RigaCard[]).map(normalizzaCard),
    href,
  };
}

/** True per i tipi che mostrano un carosello di prodotti. */
function eTipoProdotti(tipo: TipoSezioneVetrina): boolean {
  return tipo === "prodotti_manuale" || tipo === "prodotti_auto";
}

/**
 * Carica la vetrina a fasce: sezioni visibili ordinate, con i prodotti gia
 * risolti per i caroselli. Le fasce prodotti che risultano vuote vengono
 * omesse (niente caroselli spogli); hero/banner/categorie restano sempre.
 */
export async function caricaVetrina(
  supabase: Supabase | null,
): Promise<FasciaVetrina[]> {
  if (!supabase) return VETRINA_ESEMPIO;

  const { data: righe, error } = await supabase
    .from("vetrina_sezioni")
    .select("id, tipo, titolo, sottotitolo, ordine, visibile, config")
    .eq("visibile", true)
    .order("ordine", { ascending: true })
    .order("creato_il", { ascending: true });

  // Tabella assente (DB non ancora migrato) o errore: la home non si rompe,
  // ripiega su hero + categorie + novita reali (com'era prima).
  if (error) return vetrinaFallbackReale(supabase);
  // Nessuna sezione visibile: scelta del gestore, si mostra lo stato vuoto.
  if (!righe || righe.length === 0) return [];

  // Le categorie servono per i href "vedi tutti" e per espandere una regola
  // categoria ai suoi discendenti. Caricate una volta (cache di richiesta).
  const categorie = await caricaCategoriePubbliche();

  const fasce = await Promise.all(
    righe.map(async (riga): Promise<FasciaVetrina | null> => {
      const tipo = normalizzaTipo(riga.tipo);
      if (!tipo) return null; // tipo sconosciuto: si salta
      const config = normalizzaConfig(riga.config);
      const base = {
        id: riga.id,
        tipo,
        titolo: riga.titolo,
        sottotitolo: riga.sottotitolo,
        config,
      };

      if (!eTipoProdotti(tipo)) {
        return { ...base, prodotti: [], vediTuttiHref: null };
      }

      const limite = limiteValido(config.limite);
      if (tipo === "prodotti_manuale") {
        const prodotti = await prodottiPinnati(supabase, riga.id, limite);
        return { ...base, prodotti, vediTuttiHref: null };
      }
      const { prodotti, href } = await prodottiAuto(
        supabase,
        config,
        categorie,
        limite,
      );
      return { ...base, prodotti, vediTuttiHref: href };
    }),
  );

  // Scarta i tipi sconosciuti e i caroselli rimasti senza prodotti.
  return fasce.filter(
    (f): f is FasciaVetrina =>
      f !== null && (!eTipoProdotti(f.tipo) || f.prodotti.length > 0),
  );
}
