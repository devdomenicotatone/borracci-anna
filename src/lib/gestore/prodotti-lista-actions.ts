"use server";

// Server Action dello scroll infinito della lista prodotti del GESTORE (vedi
// ListaProdotti): riceve i filtri correnti serializzati e un numero di pagina,
// ritorna SOLO le righe di quella pagina (il delta) — non il cumulato che
// viaggia sul percorso URL ?pagina=N. Gemella di lib/catalogo-actions.ts
// (vetrina), ma dietro verifySession(): i POST delle action sono raggiungibili
// direttamente, quindi il check gestore va ripetuto qui come in ogni action di
// lib/gestore/actions.ts. Ritorna null su errore (RPC fallita, input non
// valido, non autorizzato), cosi il client distingue "riprova" da un genuino
// fine lista.

import { verifySession } from "@/lib/gestore/auth";
import { caricaCategorie } from "@/lib/categorie";
import {
  PAGINA_MAX_GESTORE,
  parseFiltriGestore,
  type SearchParamsGestore,
} from "@/lib/filtri-gestore";
import {
  caricaProdottiGestore,
  type EsitoListaGestore,
} from "@/lib/gestore/prodotti-lista";

/** Cap alla query string dei filtri (quelle vere restano molto piu corte). */
const MAX_QS = 1000;

/**
 * Le righe della sola pagina `pagina` della lista prodotti, per i filtri dati.
 *
 * `filtriQs` sono i filtri come query string SENZA `pagina` (l'output di
 * serializzaFiltriGestore): si reinterpretano con parseFiltriGestore, che
 * degrada gli input malformati esattamente come farebbe la pagina server.
 *
 * Ritorna { prodotti, totale } (stesse righe del cumulato server) oppure null
 * su errore — il chiamante mette in pausa l'automatico e lascia il bottone
 * per riprovare, non un finto fine lista.
 */
export async function paginaProdottiGestoreAction(input: {
  filtriQs: string;
  pagina: number;
}): Promise<EsitoListaGestore | null> {
  // Endpoint POST raggiungibile direttamente: input mai fidato sul tipo.
  if (input == null || typeof input !== "object") return null;
  const { filtriQs, pagina } = input;
  if (
    typeof filtriQs !== "string" ||
    filtriQs.length > MAX_QS ||
    !Number.isInteger(pagina) ||
    pagina < 1 ||
    pagina > PAGINA_MAX_GESTORE
  ) {
    return null;
  }

  const sessione = await verifySession();
  if (!sessione) return null;

  try {
    // Query string -> searchParams (chiavi ripetute = array, come Next) ->
    // filtri validati: stesso percorso di interpretazione della pagina server.
    const qs = new URLSearchParams(filtriQs);
    const sp: SearchParamsGestore = {};
    for (const chiave of new Set(qs.keys())) sp[chiave] = qs.getAll(chiave);
    const filtri = parseFiltriGestore(sp);

    // Le categorie servono SOLO all'espansione del filtro categoria ai
    // discendenti (argomentiCategoria le ignora con "" e "none"): senza quel
    // filtro si evita una query per ogni pagina dello scroll (~36 su tutto
    // il catalogo).
    const conCategoria =
      filtri.categoria !== "" && filtri.categoria !== "none";
    const categorie = conCategoria
      ? await caricaCategorie(sessione.supabase)
      : [];
    const esito = await caricaProdottiGestore(sessione.supabase, {
      filtri,
      pagina,
      categorie,
      soloPagina: true,
    });
    return esito.errore ? null : esito;
  } catch {
    return null;
  }
}
