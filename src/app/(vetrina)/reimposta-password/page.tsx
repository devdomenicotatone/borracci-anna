// Nuova password dal link email di recovery: /reimposta-password.
// verifyOtp (in /api/auth/conferma) ha appena creato la sessione; se la
// sessione non c'e (link aperto in un altro browser, scaduto o gia usato) si
// mostra uno stato "link scaduto" curato, non un errore grezzo.

import type { Metadata } from "next";
import Link from "next/link";

import GuscioAuth from "@/components/account/GuscioAuth";
import FormReimpostaPassword from "@/components/account/FormReimpostaPassword";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reimposta la password",
  robots: { index: false, follow: false },
};

export default async function PaginaReimpostaPassword() {
  const supabase = await createServerSupabase();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;

  // La sessione deve provenire dal link di recovery (claim amr "recovery"), non
  // da un login normale: un cliente gia loggato NON deve poter reimpostare la
  // password da qui senza la password attuale (la barriera reale e nell'action).
  let daRecovery = false;
  if (user && supabase) {
    const { data: datiClaims } = await supabase.auth.getClaims();
    const amr =
      (datiClaims?.claims as { amr?: Array<{ method?: string } | string> } | undefined)
        ?.amr ?? [];
    daRecovery = amr.some((e) =>
      typeof e === "string" ? e === "recovery" : e?.method === "recovery",
    );
  }

  if (!user || !daRecovery) {
    return (
      <GuscioAuth
        kicker="Recupero accesso"
        titolo="Link scaduto"
        sottotitolo="Questo link non è più valido: è scaduto, è già stato usato oppure è stato aperto in un altro browser."
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-sm text-muted">
            Richiedi un nuovo link di recupero: arriva in pochi secondi.
          </p>
          <Link
            href="/password-dimenticata"
            className="flex h-12 items-center justify-center rounded-full bg-sea px-6 font-display font-bold text-white shadow-sea transition hover:-translate-y-0.5"
          >
            Richiedi un nuovo link
          </Link>
        </div>
      </GuscioAuth>
    );
  }

  return (
    <GuscioAuth
      kicker="Recupero accesso"
      titolo="Scegli la nuova password"
      sottotitolo={`Stai reimpostando la password per ${user.email ?? "il tuo account"}.`}
    >
      <FormReimpostaPassword />
    </GuscioAuth>
  );
}
