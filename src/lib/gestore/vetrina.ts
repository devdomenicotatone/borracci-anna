import "server-only";

// Lettura delle sezioni vetrina per l'AREA GESTORE: a differenza della vetrina
// pubblica (lib/vetrina-home) qui si vedono TUTTE le sezioni (anche nascoste) e,
// per le fasce "prodotti a mano", i prodotti pinnati anche se disattivati (il
// gestore deve poterli gestire). Modulo condiviso da pagina e server action:
// NON e "use server" (esporta tipi e un helper di lettura, non solo action).

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ConfigVetrina,
  Prodotto,
  TipoSezioneVetrina,
  VetrinaSezione,
} from "@/lib/types";
import { TIPI_SEZIONE_VETRINA } from "@/lib/types";
import { CAMPI_CARD, normalizzaCard, type RigaCard } from "@/lib/vetrina";

/** Una sezione com'e vista dal pannello: include i prodotti pinnati a mano. */
export interface VetrinaSezioneAdmin extends VetrinaSezione {
  /** Prodotti pinnati (solo tipo prodotti_manuale), nell'ordine scelto. */
  prodotti: Prodotto[];
}

/**
 * Esito di un'azione vetrina: su `ok` ritorna la LISTA CANONICA delle sezioni
 * (come le action categorie ritornano categorie[]), cosi il client si riallinea
 * senza un secondo round-trip.
 */
export interface EsitoVetrina {
  ok: boolean;
  error?: string;
  sezioni?: VetrinaSezioneAdmin[];
}

function normalizzaTipo(t: unknown): TipoSezioneVetrina | null {
  return typeof t === "string" &&
    (TIPI_SEZIONE_VETRINA as readonly string[]).includes(t)
    ? (t as TipoSezioneVetrina)
    : null;
}

function normalizzaConfig(config: unknown): ConfigVetrina {
  return typeof config === "object" && config !== null && !Array.isArray(config)
    ? (config as ConfigVetrina)
    : {};
}

/** Prodotti pinnati su una sezione (gestore: anche disattivati), per ordine. */
async function pinnatiGestore(
  supabase: SupabaseClient,
  sezioneId: string,
): Promise<Prodotto[]> {
  const { data, error } = await supabase
    .from("vetrina_sezione_prodotti")
    .select(`ordine, prodotti(${CAMPI_CARD})`)
    .eq("sezione_id", sezioneId)
    .order("ordine", { ascending: true });
  if (error || !data) return [];
  return (data as unknown as Array<{ prodotti: RigaCard | null }>)
    .map((r) => r.prodotti)
    .filter((p): p is RigaCard => p !== null)
    .map(normalizzaCard);
}

/**
 * Tutte le sezioni ordinate, con i prodotti pinnati risolti per le fasce a
 * mano. Throw su errore: il chiamante (action in try/catch) ritorna ok:false.
 */
export async function leggiSezioniAdmin(
  supabase: SupabaseClient,
): Promise<VetrinaSezioneAdmin[]> {
  const { data, error } = await supabase
    .from("vetrina_sezioni")
    .select("id, tipo, titolo, sottotitolo, ordine, visibile, config")
    .order("ordine", { ascending: true })
    .order("creato_il", { ascending: true });
  if (error) throw error;

  const sezioni: VetrinaSezioneAdmin[] = [];
  for (const riga of (data ?? []) as Array<{
    id: string;
    tipo: string;
    titolo: string | null;
    sottotitolo: string | null;
    ordine: number;
    visibile: boolean;
    config: unknown;
  }>) {
    const tipo = normalizzaTipo(riga.tipo);
    if (!tipo) continue; // riga con tipo sconosciuto: ignorata
    sezioni.push({
      id: riga.id,
      tipo,
      titolo: riga.titolo,
      sottotitolo: riga.sottotitolo,
      ordine: riga.ordine,
      visibile: riga.visibile,
      config: normalizzaConfig(riga.config),
      prodotti: [],
    });
  }

  // Prodotti pinnati solo per le fasce a mano (le altre restano con []).
  await Promise.all(
    sezioni
      .filter((s) => s.tipo === "prodotti_manuale")
      .map(async (s) => {
        s.prodotti = await pinnatiGestore(supabase, s.id);
      }),
  );

  return sezioni;
}
