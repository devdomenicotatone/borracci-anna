// Fascia CAROSELLO PRODOTTI (manuale o automatica): intestazione con occhiello,
// titolo, eventuale "vedi tutti", e una riga di card che scorre in orizzontale.
// Server component: nessuna interattivita JS, lo scroll e nativo (overflow-x).

import Link from "next/link";

import ProductCard from "@/components/ProductCard";
import type { FasciaVetrina } from "@/lib/vetrina-home";
import OcchielloSezione from "@/components/vetrina/OcchielloSezione";

export default function CaroselloProdotti({
  fascia,
  prioritaPrimi = false,
}: {
  fascia: FasciaVetrina;
  /** true per la prima fascia prodotti above-the-fold (LCP delle prime card). */
  prioritaPrimi?: boolean;
}) {
  if (fascia.prodotti.length === 0) return null;

  return (
    <section
      aria-labelledby={`sez-${fascia.id}`}
      className="mx-auto max-w-6xl px-5 pt-12 sm:pt-14"
    >
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          {fascia.config.occhiello && (
            <OcchielloSezione>{fascia.config.occhiello}</OcchielloSezione>
          )}
          {fascia.titolo && (
            <h2
              id={`sez-${fascia.id}`}
              className="mt-2 font-display text-3xl font-extrabold leading-tight text-foreground sm:text-4xl"
            >
              {fascia.titolo}
            </h2>
          )}
          {fascia.sottotitolo && (
            <p className="mt-1.5 max-w-[52ch] text-sm text-muted sm:text-base">
              {fascia.sottotitolo}
            </p>
          )}
        </div>
        {fascia.vediTuttiHref && (
          <Link
            href={fascia.vediTuttiHref}
            className="hidden shrink-0 items-center gap-1.5 font-display text-sm font-bold text-sea transition-colors hover:text-foreground sm:inline-flex"
          >
            Vedi tutti
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        )}
      </div>

      {/* Track orizzontale: le card sbordano fino al bordo schermo (-mx-5 px-5)
          e si allineano allo scroll (snap). Su desktop entrano ~4-5 card. */}
      <div className="-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-3 sm:gap-5 [scrollbar-width:thin]">
        {fascia.prodotti.map((prodotto, i) => (
          <div
            key={prodotto.id}
            className="w-[44vw] max-w-[15rem] shrink-0 snap-start sm:w-52 lg:w-56"
          >
            <ProductCard prodotto={prodotto} priorita={prioritaPrimi && i < 3} />
          </div>
        ))}
      </div>

      {fascia.vediTuttiHref && (
        <div className="mt-4 sm:hidden">
          <Link
            href={fascia.vediTuttiHref}
            className="inline-flex items-center gap-1.5 font-display text-sm font-bold text-sea"
          >
            Vedi tutti
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>
      )}
    </section>
  );
}
