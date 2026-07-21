// Pagina "I tuoi preferiti": i cuoricini salvati. Gli id vivono in
// localStorage, quindi il contenuto e tutto client (ElencoPreferiti); qui il
// guscio con titolo e una nota che cambia se il cliente e loggato (preferiti
// sincronizzati sull'account, vedi SincronizzaPreferiti nel layout vetrina).

import type { Metadata } from "next";
import Link from "next/link";

import ElencoPreferiti from "@/components/preferiti/ElencoPreferiti";
import { verificaSessioneCliente } from "@/lib/account/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "I tuoi preferiti",
  description:
    "I prodotti che hai salvato col cuoricino su Anna Shop: ritrovali qui e mettili nel carrello quando vuoi.",
  robots: { index: false }, // pagina personale, non indicizzabile
};

export default async function PaginaPreferiti() {
  const sessione = await verificaSessioneCliente();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8 xl:max-w-7xl">
      <p className="mb-1 font-display text-xs font-bold uppercase tracking-wide text-sea">
        Salvati con il cuoricino
      </p>
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
        I tuoi preferiti
      </h1>
      {sessione ? (
        <p className="mt-2 text-sm text-muted">
          Sincronizzati sul tuo account: li ritrovi su ogni dispositivo.
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted">
          Restano salvati su questo dispositivo.{" "}
          <Link
            href="/accedi?da=/preferiti"
            className="font-bold text-sea underline-offset-2 hover:underline"
          >
            Accedi
          </Link>{" "}
          per salvarli sul tuo account e ritrovarli ovunque.
        </p>
      )}

      <div className="mt-8">
        <ElencoPreferiti />
      </div>
    </div>
  );
}
