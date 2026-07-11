// Richiesta reset password: /password-dimenticata.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import GuscioAuth from "@/components/account/GuscioAuth";
import FormPasswordDimenticata from "@/components/account/FormPasswordDimenticata";
import { verificaSessioneCliente } from "@/lib/account/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Password dimenticata",
  robots: { index: false, follow: false },
};

export default async function PaginaPasswordDimenticata() {
  const sessione = await verificaSessioneCliente();
  if (sessione) redirect("/account");

  return (
    <GuscioAuth
      kicker="Recupero accesso"
      titolo="Password dimenticata?"
      sottotitolo="Nessun problema: ti mandiamo un link per sceglierne una nuova."
      footer={
        <>
          Te la sei ricordata?{" "}
          <Link
            href="/accedi"
            className="font-bold text-sea underline-offset-2 hover:underline"
          >
            Accedi
          </Link>
        </>
      }
    >
      <FormPasswordDimenticata />
    </GuscioAuth>
  );
}
