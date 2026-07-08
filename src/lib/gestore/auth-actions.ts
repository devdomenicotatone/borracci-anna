"use server";

import { redirect } from "next/navigation";

import { createServerSupabase } from "@/lib/supabase/server";

export type StatoLogin =
  | { error?: string; richiedeCodice?: boolean }
  | undefined;

/**
 * Login del gestore (email + password) — primo passo.
 * La barriera reale e la RLS: questo controllo di ruolo serve solo a dare un
 * errore chiaro e a non lasciare una sessione attiva a un utente non abilitato.
 * Il check legge `profili` con l'uid certo restituito da signInWithPassword
 * (piu affidabile di rpc/auth.uid() nello stesso request).
 *
 * Se l'utente ha un authenticator TOTP verificato NON si entra: si torna al
 * form con `richiedeCodice` e il secondo passo (codice a 6 cifre, verificato
 * dal client come in GestiShop) porta la sessione ad aal2. Finche' non
 * succede, verifySession e la RLS (is_gestore, migration mfa_gestore)
 * trattano la sessione come non autorizzata.
 */
export async function loginGestore(
  _stato: StatoLogin,
  formData: FormData,
): Promise<StatoLogin> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Inserisci email e password." };
  }

  const supabase = await createServerSupabase();
  if (!supabase) return { error: "Supabase non configurato." };

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) return { error: "Credenziali non valide." };

  const { data: profilo } = await supabase
    .from("profili")
    .select("id")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profilo) {
    await supabase.auth.signOut();
    return { error: "Account non abilitato all'area gestore." };
  }

  // Secondo fattore configurato? Allora la password da sola non basta.
  // (data.totp = solo i fattori TOTP gia' verificati.)
  const { data: fattori } = await supabase.auth.mfa.listFactors();
  if ((fattori?.totp ?? []).length > 0) return { richiedeCodice: true };

  // redirect() lancia NEXT_REDIRECT: va tenuto fuori da eventuali try/catch.
  redirect("/gestore/prodotti");
}

/** Logout del gestore. */
export async function logoutGestore(): Promise<void> {
  const supabase = await createServerSupabase();
  if (supabase) await supabase.auth.signOut();
  redirect("/gestore/login");
}
