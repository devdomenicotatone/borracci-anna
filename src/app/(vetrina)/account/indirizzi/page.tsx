// Rubrica indirizzi del cliente: /account/indirizzi.

import type { Metadata } from "next";

import RubricaIndirizzi from "@/components/account/RubricaIndirizzi";
import { requireCliente } from "@/lib/account/auth";
import { leggiIndirizzi } from "@/lib/account/dati";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "I miei indirizzi",
};

export default async function PaginaIndirizzi() {
  const sessione = await requireCliente();
  const indirizzi = await leggiIndirizzi(sessione);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-xl font-extrabold text-foreground">
          I miei indirizzi
        </h2>
        <p className="mt-1 text-sm text-muted">
          L&apos;indirizzo predefinito viene proposto automaticamente al
          checkout. Massimo 10 indirizzi.
        </p>
      </div>
      <RubricaIndirizzi iniziali={indirizzi} />
    </div>
  );
}
