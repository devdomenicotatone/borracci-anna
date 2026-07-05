import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Categoria } from "@/lib/types";

/**
 * Carica le categorie ordinate per `ordine`. Helper condiviso dalle pagine
 * gestore (nuovo / genera / modifica prodotto), che prima ripetevano la stessa
 * query. Degrada a [] se la lettura fallisce.
 */
export async function caricaCategorie(
  supabase: SupabaseClient<Database>,
): Promise<Categoria[]> {
  const { data } = await supabase
    .from("categorie")
    .select("id, slug, nome, parent_id, ordine")
    .order("ordine", { ascending: true })
    // Tie-break per id: ordine stabile anche con `ordine` duplicati (coerente
    // col pannello gestore e con gli altri consumatori).
    .order("id", { ascending: true });
  return (data as Categoria[] | null) ?? [];
}

/**
 * Categorie per la vetrina pubblica, memoizzate per richiesta (React cache):
 * header, home, pagina categoria e generateMetadata le leggono tutte nello
 * stesso render senza ripetere la query. Degrada a [] senza env o su errore.
 */
export const caricaCategoriePubbliche = cache(
  async (): Promise<Categoria[]> => {
    try {
      const supabase = await createServerSupabase();
      if (!supabase) return [];
      return await caricaCategorie(supabase);
    } catch {
      return [];
    }
  },
);
