// Storico ordini del cliente, paginato (10 per pagina, piu recenti prima).
// Le letture passano dal client di sessione: le RLS filtrano per utente.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import CardOrdine from "@/components/account/CardOrdine";
import { requireCliente } from "@/lib/account/auth";
import { leggiOrdiniCliente } from "@/lib/account/ordini";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "I miei ordini",
};

const PER_PAGINA = 10;

export default async function PaginaOrdiniAccount({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string }>;
}) {
  const [{ pagina: paginaParam }, sessione] = await Promise.all([
    searchParams,
    requireCliente(),
  ]);
  const pagina = Math.max(1, Number.parseInt(paginaParam ?? "1", 10) || 1);
  const { ordini, totale } = await leggiOrdiniCliente(
    sessione,
    pagina,
    PER_PAGINA,
  );
  const pagine = Math.max(1, Math.ceil(totale / PER_PAGINA));
  // Pagina oltre l'ultima (URL manomesso o ordine cancellato): riporta
  // all'ultima valida invece di mostrare il falso "Non hai ancora ordini".
  if (ordini.length === 0 && totale > 0 && pagina > pagine) {
    redirect(`/account/ordini?pagina=${pagine}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-xl font-extrabold text-foreground">
          I miei ordini
        </h2>
        {totale > 0 && (
          <span className="text-sm text-muted">
            {totale === 1 ? "1 ordine" : `${totale} ordini`}
          </span>
        )}
      </div>

      {ordini.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-line bg-surface px-6 py-16 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-white text-sea shadow-soft">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-7 w-7"
              aria-hidden="true"
            >
              <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
              <path d="m3.3 7 8.7 5 8.7-5" />
              <path d="M12 22V12" />
            </svg>
          </span>
          <div>
            <p className="font-display text-lg font-extrabold text-foreground">
              Non hai ancora ordini
            </p>
            <p className="mt-1 text-sm text-muted">
              Quando compri qualcosa lo ritrovi qui, con lo stato sempre
              aggiornato.
            </p>
          </div>
          <Link
            href="/prodotti"
            className="flex h-12 items-center justify-center rounded-full bg-coral px-6 font-display font-bold text-white shadow-coral transition hover:-translate-y-0.5"
          >
            Scopri la collezione
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {ordini.map((ordine) => (
              <CardOrdine key={ordine.id} ordine={ordine} />
            ))}
          </div>

          {pagine > 1 && (
            <nav
              aria-label="Pagine dello storico ordini"
              className="mt-2 flex items-center justify-between"
            >
              {/* Un bordo disabilitato deve essere davvero inerte: aria-disabled
                  su un <Link> lascia il tab e l'Invio funzionanti. Quando non c'e
                  pagina precedente/successiva renderizziamo uno <span>. */}
              {pagina > 1 ? (
                <Link
                  href={`/account/ordini?pagina=${pagina - 1}`}
                  className="rounded-full px-4 py-2 font-display text-sm font-bold text-sea ring-1 ring-line transition hover:bg-surface"
                >
                  ← Più recenti
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className="rounded-full px-4 py-2 font-display text-sm font-bold text-muted opacity-40 ring-1 ring-line"
                >
                  ← Più recenti
                </span>
              )}
              <span className="text-sm tabular-nums text-muted">
                {pagina} / {pagine}
              </span>
              {pagina < pagine ? (
                <Link
                  href={`/account/ordini?pagina=${pagina + 1}`}
                  className="rounded-full px-4 py-2 font-display text-sm font-bold text-sea ring-1 ring-line transition hover:bg-surface"
                >
                  Meno recenti →
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className="rounded-full px-4 py-2 font-display text-sm font-bold text-muted opacity-40 ring-1 ring-line"
                >
                  Meno recenti →
                </span>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
