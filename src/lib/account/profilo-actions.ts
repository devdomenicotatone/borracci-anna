"use server";

// Server Actions del profilo cliente (dati personali). Email e password
// vivono in auth-actions.ts (toccano Supabase Auth), qui i dati anagrafici.

import { refresh } from "next/cache";

import { verificaSessioneCliente } from "@/lib/account/auth";

export interface EsitoProfilo {
  ok?: boolean;
  error?: string;
  errors?: { nome?: string };
}

/** Aggiorna il nome del cliente (unica colonna scrivibile dal client, vedi
 *  grant di colonna nella migration area_clienti). */
export async function aggiornaProfiloAction(
  _stato: EsitoProfilo,
  formData: FormData,
): Promise<EsitoProfilo> {
  const sessione = await verificaSessioneCliente();
  if (!sessione) return { error: "Sessione scaduta: accedi di nuovo." };

  const nome = String(formData.get("nome") ?? "").trim().slice(0, 200);
  if (!nome) return { errors: { nome: "Inserisci nome e cognome." } };

  const { error } = await sessione.supabase
    .from("clienti")
    .update({ nome })
    .eq("id", sessione.userId);
  if (error) {
    console.error("[account] aggiornamento profilo fallito:", error.message);
    return { error: "Non è stato possibile salvare. Riprova." };
  }
  // Rinfresca la UI del client corrente (Header + IntestazioneAccount leggono
  // il nome via cache() per-request): senza questo il saluto resta stantio.
  refresh();
  return { ok: true };
}
