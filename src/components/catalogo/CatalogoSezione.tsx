// Blocco catalogo condiviso da home e pagine categoria: toolbar (ordinamento +
// filtri), griglia di card, stati vuoti e paginazione a scorrimento infinito
// (CaricamentoAutomatico: append incrementale via Server Action, con link
// "Mostra altri" ?pagina=N+1 come fallback senza JS).
// Server component: riceve dati gia caricati; l'interattivita sta nella
// ToolbarCatalogo (client), lo stato dei filtri nell'URL.

import Link from "next/link";

import ProductCard from "@/components/ProductCard";
import CaricamentoAutomatico from "@/components/catalogo/CaricamentoAutomatico";
import ToolbarCatalogo from "@/components/catalogo/ToolbarCatalogo";
import TornaSu from "@/components/catalogo/TornaSu";
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

  // Base dell'esplorazione corrente: percorso + filtri SENZA `pagina`
  // (serializzaFiltri non la include mai). Fa da key di CaricamentoAutomatico:
  // filtri/ricerca/ordinamento nuovi = rimonta = pagine appese e tetto auto
  // azzerati.
  const filtriQs = serializzaFiltri(filtri);
  const chiaveFiltri = `${basePath}?${filtriQs}`;
  // Slug per la Server Action dell'append: la risoluzione in id+discendenti
  // resta sul server (lib/catalogo-actions), dal client viaggia solo lo slug.
  const categoriaSlug = basePath.startsWith("/categoria/")
    ? basePath.slice("/categoria/".length)
    : "";

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
            className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 xl:grid-cols-5"
          >
            {prodotti.map((prodotto, i) => (
              // Su mobile la griglia e a 2 colonne: fetchPriority high SOLO
              // alle prime 2 card (le vere candidate LCP); le card 3-4
              // (seconda riga, spesso sotto la piega) restano eager ma senza
              // high, per non rubare banda alla LCP; lazy dalla quinta in poi.
              <ProductCard
                key={prodotto.id}
                prodotto={prodotto}
                priorita={i < 2 ? "alta" : i < 4 ? "eager" : undefined}
              />
            ))}
          </div>

          {prodotti.length < totale && (
            <CaricamentoAutomatico
              key={chiaveFiltri}
              basePath={basePath}
              categoriaSlug={categoriaSlug}
              filtriQs={filtriQs}
              pagina={pagina}
              idsServer={prodotti.map((p) => p.id)}
              totale={totale}
            />
          )}
        </>
      )}

      {/* Risalita rapida a ricerca/filtri: compare dopo ~2 viewport di scroll. */}
      <TornaSu />
    </div>
  );
}
