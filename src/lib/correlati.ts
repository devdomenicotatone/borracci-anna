import "server-only";

// Prodotti correlati per la scheda prodotto ("Ti potrebbe piacere anche").
// Il calcolo della pertinenza vive tutto in Postgres (funzione
// public.prodotti_correlati, vedi migration 20260707120000): combina similarita
// del nome, prefisso codice, categoria e prezzo. Qui c'e solo la chiamata RPC,
// cachata per slug perche i correlati cambiano di rado (nuovi prodotti/modifiche).

import { unstable_cache } from "next/cache";

import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Prodotto } from "@/lib/types";

/** Tag per invalidare a mano la cache dei correlati (revalidateTag). */
export const TAG_CORRELATI = "prodotti-correlati";

/** Durata cache: i correlati sono stabili, si ricalcolano di rado. */
const CORRELATI_REVALIDATE_S = 60 * 30; // 30 minuti

/** Quanti correlati mostrare di default (griglia 2/3/4 colonne). */
export const CORRELATI_LIMITE = 8;

/**
 * Interroga la funzione Postgres. Isolata perche gira DENTRO unstable_cache:
 * non puo ricevere il client Supabase (non serializzabile) ne leggere i cookie,
 * quindi crea un client cookieless (service role). Legge solo dati pubblici del
 * catalogo attivo (la funzione e SECURITY INVOKER e filtra attivo=true), coerenti
 * con cio' che vede l'anon. Su env assenti o errore: lista vuota (mai crash).
 */
async function queryCorrelati(slug: string, limite: number): Promise<Prodotto[]> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return [];

  try {
    const supabase = createAdminSupabase();
    const { data, error } = await supabase.rpc("prodotti_correlati", {
      p_slug: slug,
      p_limit: limite,
    });
    if (error || !data) return [];
    return data as unknown as Prodotto[];
  } catch {
    return [];
  }
}

/**
 * Prodotti correlati a `slug`, cachati (revalidate breve + tag). Vuoto se
 * Supabase non e configurato o la funzione non e ancora applicata al DB: in quel
 * caso la sezione semplicemente non si mostra (degrado con grazia).
 */
export async function caricaProdottiCorrelati(
  slug: string,
  limite: number = CORRELATI_LIMITE,
): Promise<Prodotto[]> {
  const cached = unstable_cache(
    () => queryCorrelati(slug, limite),
    ["prodotti-correlati", slug, String(limite)],
    { revalidate: CORRELATI_REVALIDATE_S, tags: [TAG_CORRELATI] },
  );
  return cached();
}
