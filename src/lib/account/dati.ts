// Letture dell'area account (client di sessione: le RLS filtrano per utente).
// Niente "use server": sono funzioni chiamate dai Server Components; l'eq su
// user_id e ridondante rispetto alla RLS ma esplicita l'intento.

import "server-only";

import type { SessioneCliente } from "@/lib/account/auth";
import type { Indirizzo } from "@/lib/types";

export const CAMPI_INDIRIZZO =
  "id, etichetta, nome, telefono, line1, line2, cap, citta, provincia, paese, predefinito";

/** Rubrica completa: predefinito in testa, poi per anzianita. */
export async function leggiIndirizzi(
  sessione: SessioneCliente,
): Promise<Indirizzo[]> {
  const { data } = await sessione.supabase
    .from("indirizzi")
    .select(CAMPI_INDIRIZZO)
    .eq("user_id", sessione.userId)
    .order("predefinito", { ascending: false })
    .order("creato_il", { ascending: true });
  return (data as Indirizzo[] | null) ?? [];
}

/** L'indirizzo predefinito, se esiste (max uno: indice unico parziale). */
export async function indirizzoPredefinito(
  sessione: SessioneCliente,
): Promise<Indirizzo | null> {
  const { data } = await sessione.supabase
    .from("indirizzi")
    .select(CAMPI_INDIRIZZO)
    .eq("user_id", sessione.userId)
    .eq("predefinito", true)
    .maybeSingle();
  return (data as Indirizzo | null) ?? null;
}
