// Blocco catalogo condiviso da home e pagine categoria: toolbar (ordinamento +
// filtri), griglia di card, stati vuoti e paginazione a scorrimento infinito
// (sentinella CaricamentoAutomatico + link "Mostra altri" come fallback).
// Server component: riceve dati gia caricati; l'interattivita sta nella
// ToolbarCatalogo (client), lo stato dei filtri nell'URL.

import Link from "next/link";

import ProductCard from "@/components/ProductCard";
import CaricamentoAutomatico from "@/components/catalogo/CaricamentoAutomatico";
import EtichettaMostraAltri from "@/components/catalogo/EtichettaMostraAltri";
import ToolbarCatalogo from "@/components/catalogo/ToolbarCatalogo";
import Wordmark from "@/components/Wordmark";
import {
  contaFiltriAttivi,
  serializzaFiltri,
  type FacetteCatalogo,
  type FiltriCatalogo,
} from "@/lib/filtri-catalogo";
import type { Prodotto } from "@/lib/types";

export default function CatalogoSezione({
  basePath,
  filtri,
  pagina,
  facette,
  prodotti,
  totale,
  messaggioVuoto = "La vetrina è in aggiornamento. Torna presto.",
}: {
  basePath: string;
  filtri: FiltriCatalogo;
  pagina: number;
  facette: FacetteCatalogo;
  prodotti: Prodotto[];
  totale: number;
  /** Messaggio quando il catalogo e vuoto SENZA filtri attivi. */
  messaggioVuoto?: string;
}) {
  const attivi = contaFiltriAttivi(filtri);

  // Link "Mostra altri": stessi filtri, pagina successiva. scroll={false}
  // perche la griglia si estende sotto la posizione corrente. La chiave dei
  // soli filtri (serializzaFiltri non include mai `pagina`) dice alla
  // sentinella quando l'esplorazione riparte e il tetto auto si azzera.
  const qsFiltri = new URLSearchParams(serializzaFiltri(filtri));
  const chiaveFiltri = `${basePath}?${qsFiltri.toString()}`;
  const qsAltri = new URLSearchParams(qsFiltri);
  qsAltri.set("pagina", String(pagina + 1));

  return (
    <div>
      <ToolbarCatalogo
        basePath={basePath}
        filtri={filtri}
        facette={facette}
        totale={totale}
      />

      {prodotti.length === 0 ? (
        attivi > 0 ? (
          // Nessun risultato per i filtri correnti: si offre l'uscita rapida.
          <div className="rounded-3xl border border-dashed border-line bg-surface px-6 py-16 text-center shadow-soft">
            <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-surface-2 text-2xl">
              🔍
            </span>
            <p className="font-display text-base font-bold text-foreground">
              Nessun prodotto con questi filtri
            </p>
            <p className="mt-1 text-sm text-muted">
              Prova ad allargare la ricerca o azzera i filtri.
            </p>
            <Link
              href={basePath}
              scroll={false}
              className="mt-5 inline-flex h-11 items-center rounded-full bg-coral-ink px-6 font-display text-sm font-bold text-white shadow-coral transition-transform hover:-translate-y-0.5"
            >
              Azzera i filtri
            </Link>
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-line bg-surface px-6 py-20 text-center shadow-soft">
            <Wordmark className="select-none text-3xl opacity-60" />
            <p className="mt-4 text-sm text-muted">{messaggioVuoto}</p>
          </div>
        )
      ) : (
        <>
          <div
            aria-label="Prodotti in vetrina"
            className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4"
          >
            {prodotti.map((prodotto, i) => (
              // Prima riga (fino a 4 col): priorita alta, candidate LCP.
              <ProductCard
                key={prodotto.id}
                prodotto={prodotto}
                priorita={i < 4}
              />
            ))}
          </div>

          {prodotti.length < totale && (
            <div className="mt-8 flex flex-col items-center gap-2">
              <p className="text-sm tabular-nums text-muted">
                Hai visto {prodotti.length} prodotti su {totale}
              </p>
              <CaricamentoAutomatico
                pagina={pagina}
                urlPaginaSuccessiva={`${basePath}?${qsAltri.toString()}`}
                chiaveFiltri={chiaveFiltri}
              >
                <Link
                  href={`${basePath}?${qsAltri.toString()}`}
                  scroll={false}
                  className="inline-flex h-12 items-center rounded-full bg-white px-7 font-display text-sm font-bold text-sea ring-2 ring-sea transition-all hover:-translate-y-0.5 hover:bg-surface"
                >
                  <EtichettaMostraAltri />
                </Link>
              </CaricamentoAutomatico>
            </div>
          )}
        </>
      )}
    </div>
  );
}
