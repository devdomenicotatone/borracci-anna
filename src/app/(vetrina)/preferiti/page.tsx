// Pagina "I tuoi preferiti": i cuoricini salvati su QUESTO dispositivo.
// Gli id vivono in localStorage, quindi il contenuto e tutto client
// (ElencoPreferiti); qui solo il guscio statico con titolo e nota.

import type { Metadata } from "next";

import ElencoPreferiti from "@/components/preferiti/ElencoPreferiti";

export const metadata: Metadata = {
  title: "I tuoi preferiti",
  description:
    "I prodotti che hai salvato col cuoricino su Anna Shop: ritrovali qui e mettili nel carrello quando vuoi.",
  robots: { index: false }, // pagina personale del dispositivo, non indicizzabile
};

export default function PaginaPreferiti() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <p className="mb-1 font-display text-xs font-bold uppercase tracking-wide text-sea">
        Salvati con il cuoricino
      </p>
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
        I tuoi preferiti
      </h1>
      <p className="mt-2 text-sm text-muted">
        Restano salvati su questo dispositivo, senza bisogno di un account.
      </p>

      <div className="mt-8">
        <ElencoPreferiti />
      </div>
    </div>
  );
}
