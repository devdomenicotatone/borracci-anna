"use server";

// Server Action dello scorrimento infinito del catalogo (vedi
// CaricamentoAutomatico): riceve i filtri correnti serializzati e un numero di
// pagina, ritorna SOLO le card di quella pagina (il delta) — non il cumulato
// che viaggia sul percorso URL ?pagina=N. Endpoint PUBBLICO richiamato dal
// client (pattern card-actions): input sempre validato/cappato, lettura dal
// client anon (RLS: solo catalogo attivo). Ritorna null su errore imprevisto,
// cosi il client distingue "riprova" da un genuino fine lista.

import { caricaCategoriePubbliche } from "@/lib/categorie";
import { categoriaPerSlug, idConDiscendenti } from "@/lib/categorie-albero";
import { parseFiltri, type SearchParamsCatalogo } from "@/lib/filtri-catalogo";
import { createServerSupabase } from "@/lib/supabase/server";
import { caricaProdottiVetrina, type EsitoCatalogo } from "@/lib/vetrina";

/** Tetto alle pagine richiedibili: 200 * 24 card coprono ben oltre il catalogo. */
const MAX_PAGINA = 200;
/** Cap alla query string dei filtri (quelle vere restano molto piu corte). */
const MAX_QS = 1000;
/** Cap allo slug categoria (colonna slug, kebab-case corto). */
const MAX_SLUG = 100;

/**
 * Le card della sola pagina `pagina` del catalogo, per i filtri dati.
 *
 * - `categoriaSlug`: slug della pagina categoria, "" per il catalogo completo
 *   (/prodotti). Si risolve qui in id+discendenti, come fa la pagina server:
 *   dal client viaggia solo lo slug, mai id arbitrari.
 * - `filtriQs`: i filtri come query string dell'URL SENZA `pagina` (l'output
 *   di serializzaFiltri): si reinterpreta con parseFiltri, che degrada gli
 *   input malformati esattamente come farebbe la pagina.
 *
 * Ritorna { prodotti, totale } (stessi campi card della griglia server) oppure
 * null su errore imprevisto — il chiamante mostra il "riprova", non un finto
 * fine lista.
 */
export async function paginaCatalogo(input: {
  categoriaSlug: string;
  filtriQs: string;
  pagina: number;
}): Promise<EsitoCatalogo | null> {
  // Endpoint pubblico: l'input puo essere qualsiasi cosa, non ci si fida del tipo.
  if (input == null || typeof input !== "object") return null;
  const { categoriaSlug, filtriQs, pagina } = input;
  if (
    typeof categoriaSlug !== "string" ||
    categoriaSlug.length > MAX_SLUG ||
    typeof filtriQs !== "string" ||
    filtriQs.length > MAX_QS ||
    !Number.isInteger(pagina) ||
    pagina < 1 ||
    pagina > MAX_PAGINA
  ) {
    return null;
  }

  try {
    // Query string -> searchParams (chiavi ripetute = array, come Next) ->
    // filtri validati: stesso percorso di interpretazione delle pagine.
    const qs = new URLSearchParams(filtriQs);
    const sp: SearchParamsCatalogo = {};
    for (const chiave of new Set(qs.keys())) sp[chiave] = qs.getAll(chiave);
    const filtri = parseFiltri(sp);

    const supabase = await createServerSupabase();

    let categoriaIds: string[] | undefined;
    if (categoriaSlug) {
      const categorie = await caricaCategoriePubbliche();
      const cat = categoriaPerSlug(categorie, categoriaSlug);
      // Slug ignoto (categoria rimossa mentre l'utente scorreva): fine lista
      // genuino, non un errore da riprovare.
      if (!cat) return { prodotti: [], totale: 0 };
      categoriaIds = idConDiscendenti(categorie, cat.id);
    }

    return await caricaProdottiVetrina(supabase, {
      filtri,
      categoriaIds,
      pagina,
      soloPagina: true,
    });
  } catch {
    return null;
  }
}
