// Registrazione clienti: /registrati. Verifica email obbligatoria: il form
// mostra il pannello "Controlla la posta" senza navigare.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import GuscioAuth from "@/components/account/GuscioAuth";
import FormRegistrazione from "@/components/account/FormRegistrazione";
import { verificaSessioneCliente } from "@/lib/account/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Crea il tuo account",
  robots: { index: false, follow: false },
};

export default async function PaginaRegistrati() {
  const sessione = await verificaSessioneCliente();
  if (sessione) redirect("/account");

  return (
    <GuscioAuth
      kicker="Nuovo account"
      titolo="Crea il tuo account"
      sottotitolo="Ritrovi i tuoi ordini, salvi gli indirizzi e i preferiti ti seguono ovunque. E puoi sempre comprare anche senza account."
      footer={
        <>
          Hai già un account?{" "}
          <Link
            href="/accedi"
            className="font-bold text-sea underline-offset-2 hover:underline"
          >
            Accedi
          </Link>
        </>
      }
    >
      <FormRegistrazione />
    </GuscioAuth>
  );
}
