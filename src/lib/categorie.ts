import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
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
