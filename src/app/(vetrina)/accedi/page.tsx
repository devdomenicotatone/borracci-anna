// Login clienti: /accedi (con ritorno post-login via ?da=, dal proxy).
// Dentro il layout vetrina: header e footer restano visibili, continuita con
// lo shopping (a differenza del login gestore full-screen).

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import GuscioAuth from "@/components/account/GuscioAuth";
import FormAccesso from "@/components/account/FormAccesso";
import { verificaSessioneCliente } from "@/lib/account/auth";
import { destinazioneSicura } from "@/lib/account/url-sicuro";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Accedi",
  robots: { index: false, follow: false },
};

export default async function PaginaAccedi({
  searchParams,
}: {
  searchParams: Promise<{ da?: string; errore?: string }>;
}) {
  const params = await searchParams;
  // Con ?da=a&da=b i valori arrivano come array a runtime: normalizza a stringa
  // (evita che .startsWith su un array lanci) prima di validarli.
  const da = typeof params.da === "string" ? params.da : undefined;
  const errore = typeof params.errore === "string" ? params.errore : undefined;

  // Gia cliente loggato: dritto a destinazione (i gestori NON passano di qui:
  // verificaSessioneCliente per loro e null e vedono il form).
  const sessione = await verificaSessioneCliente();
  if (sessione) redirect(destinazioneSicura(da));

  return (
    <GuscioAuth
      kicker="Bentornata/o"
      titolo="Accedi al tuo account"
      sottotitolo="Ordini, indirizzi e preferiti, sempre con te."
      footer={
        <>
          Non hai un account?{" "}
          <Link
            href="/registrati"
            className="font-bold text-sea underline-offset-2 hover:underline"
          >
            Registrati
          </Link>
        </>
      }
    >
      <FormAccesso da={da} erroreIniziale={errore} />
    </GuscioAuth>
  );
}
