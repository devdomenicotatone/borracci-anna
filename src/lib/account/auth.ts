// Data Access Layer (DAL) dell'area clienti, modellato su lib/gestore/auth.ts.
// verificaSessioneCliente() e la verifica REALE (server-side) dell'identita
// cliente, da richiamare in OGNI Server Action dell'area account (i POST sono
// raggiungibili direttamente). Memoizzata per-richiesta con cache().
//
// Separazione dei ruoli: un CLIENTE e una riga in `public.clienti`; un GESTORE
// e una riga in `public.profili` (whitelist di is_gestore()). Le due tabelle
// sono disgiunte e questo DAL non tocca in alcun modo la logica gestore.

import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { verifySession } from "@/lib/gestore/auth";
import type { Database } from "@/lib/supabase/database.types";
import type { Cliente } from "@/lib/types";

export interface SessioneCliente {
  userId: string;
  email: string;
  cliente: Cliente;
  /** Client Supabase (anon + sessione) gia pronto: le RLS filtrano per utente. */
  supabase: SupabaseClient<Database>;
}

const CAMPI_CLIENTE =
  "id, email, nome, stripe_customer_id, stripe_customer_ambiente";

/**
 * Verifica la sessione cliente.
 * Ritorna null se: Supabase non configurato, utente non autenticato, MFA
 * incompleta, oppure utente che e un GESTORE (riga in `profili`): il pannello
 * gestore non deve mai essere trattato come account cliente.
 */
export const verificaSessioneCliente = cache(
  async (): Promise<SessioneCliente | null> => {
    const supabase = await createServerSupabase();
    if (!supabase) return null;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    // Stesso check MFA fail-closed di verifySession (vedi il commento la):
    // i clienti oggi non hanno UI di enrollment, ma il controllo e economico
    // e resta corretto se un domani i fattori arrivassero anche qui.
    const haFattoreVerificato = (user.factors ?? []).some(
      (f) => f.status === "verified",
    );
    if (haFattoreVerificato) {
      const { data: datiClaims } = await supabase.auth.getClaims();
      const aal = (datiClaims?.claims as { aal?: string } | undefined)?.aal;
      if (aal !== "aal2") return null;
    }

    const { data: cliente } = await supabase
      .from("clienti")
      .select(CAMPI_CLIENTE)
      .eq("id", user.id)
      .maybeSingle();

    if (cliente) {
      return {
        userId: user.id,
        email: user.email ?? cliente.email ?? "",
        cliente: cliente as Cliente,
        supabase,
      };
    }

    // Riga mancante: o e un gestore (profili) o il trigger di provisioning e
    // fallito alla signup. Nel secondo caso: self-heal col service role.
    const { data: profilo } = await supabase
      .from("profili")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    if (profilo) return null; // gestore: mai trattarlo da cliente

    try {
      const admin = createAdminSupabase();
      const nomeMeta = user.user_metadata?.nome;
      const { data: creato } = await admin
        .from("clienti")
        .upsert(
          {
            id: user.id,
            email: user.email ?? null,
            nome: typeof nomeMeta === "string" && nomeMeta.trim() ? nomeMeta.trim() : null,
          },
          { onConflict: "id" },
        )
        .select(CAMPI_CLIENTE)
        .single();
      if (!creato) return null;
      return {
        userId: user.id,
        email: user.email ?? creato.email ?? "",
        cliente: creato as Cliente,
        supabase,
      };
    } catch {
      // Senza service role non si puo riparare: si degrada a "non cliente".
      return null;
    }
  },
);

/**
 * Come verificaSessioneCliente ma redirige se non autorizzato:
 * anonimo -> /accedi; gestore loggato -> /gestore (il suo pannello).
 */
export async function requireCliente(): Promise<SessioneCliente> {
  const sessione = await verificaSessioneCliente();
  if (!sessione) {
    // redirect() lancia NEXT_REDIRECT: sempre fuori da try/catch.
    const gestore = await verifySession();
    if (gestore) redirect("/gestore");
    redirect("/accedi");
  }
  return sessione;
}
