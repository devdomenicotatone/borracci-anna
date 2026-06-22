"use client";

// Lista prodotti del gestore: ricerca (client-side) + filtro stato + card.
// I dati arrivano gia pronti dal server component padre.

import { useMemo, useState } from "react";
import Link from "next/link";

import { formatPrezzo } from "@/lib/format";
import ToggleAttivo from "@/components/gestore/ToggleAttivo";

export interface ProdottoLista {
  id: string;
  slug: string;
  nome: string;
  prezzo_cents: number;
  valuta: string;
  immagine_url: string | null;
  attivo: boolean;
  numVarianti: number;
  stockTotale: number;
}

type Filtro = "tutti" | "attivi" | "nascosti";

/** Soglia sotto la quale si segnala "scorte basse". */
const SOGLIA_SCORTE = 5;

export default function ListaProdotti({
  prodotti,
}: {
  prodotti: ProdottoLista[];
}) {
  const [query, setQuery] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("tutti");

  const visibili = useMemo(() => {
    const q = query.trim().toLowerCase();
    return prodotti.filter((p) => {
      if (filtro === "attivi" && !p.attivo) return false;
      if (filtro === "nascosti" && p.attivo) return false;
      if (!q) return true;
      return (
        p.nome.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q)
      );
    });
  }, [prodotti, query, filtro]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-lagoon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <rect x="3" y="4" width="7" height="7" rx="1.5" />
              <rect x="14" y="4" width="7" height="7" rx="1.5" />
              <rect x="3" y="15" width="7" height="5" rx="1.5" />
              <rect x="14" y="15" width="7" height="5" rx="1.5" />
            </svg>
            Catalogo
          </span>
          <h1 className="font-display text-2xl font-extrabold text-foreground">
            Prodotti
          </h1>
        </div>
        <Link
          href="/gestore/prodotti/nuovo"
          className="inline-flex h-11 items-center gap-1.5 rounded-full bg-sea px-5 font-display text-sm font-bold text-white shadow-sea transition-all hover:-translate-y-0.5"
        >
          + Nuovo
        </Link>
      </div>

      {/* Toolbar: ricerca + filtro */}
      <div className="sticky top-14 z-10 -mx-4 mb-4 flex flex-col gap-2.5 bg-background/95 px-4 py-2 backdrop-blur md:top-0 md:mx-0 md:px-0">
        <div className="relative">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute inset-y-0 left-4 my-auto h-5 w-5 text-muted"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            inputMode="search"
            placeholder="Cerca per nome o slug…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-12 w-full rounded-full bg-white pl-11 pr-4 text-base text-foreground ring-1 ring-line outline-none transition-shadow"
          />
        </div>
        <div className="flex gap-1 rounded-full bg-surface-2 p-1 text-sm">
          {(["tutti", "attivi", "nascosti"] as Filtro[]).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filtro === f}
              onClick={() => setFiltro(f)}
              className={[
                "flex-1 rounded-full py-2 font-display font-bold capitalize transition-all",
                filtro === f
                  ? "bg-sea text-white shadow-sea"
                  : "text-muted hover:text-foreground",
              ].join(" ")}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {visibili.length === 0 ? (
        <StatoVuoto haProdotti={prodotti.length > 0} />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {visibili.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-soft ring-1 ring-line transition-all hover:-translate-y-0.5 hover:shadow-sea"
            >
              <Link
                href={`/gestore/prodotti/${p.id}`}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <Miniatura url={p.immagine_url} nome={p.nome} />
                <div className="min-w-0">
                  <p className="truncate font-display text-sm font-bold text-foreground">
                    {p.nome}
                  </p>
                  <p className="truncate font-mono text-xs text-muted">
                    /{p.slug}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold tabular-nums text-sea">
                      {formatPrezzo(p.prezzo_cents, p.valuta)}
                    </span>
                    <BadgeStock
                      stock={p.stockTotale}
                      numVarianti={p.numVarianti}
                    />
                  </div>
                </div>
              </Link>
              <div className="flex flex-col items-end gap-2">
                <span
                  className={[
                    "font-display text-xs font-bold",
                    p.attivo ? "text-sea" : "text-muted",
                  ].join(" ")}
                >
                  {p.attivo ? "In vendita" : "Nascosto"}
                </span>
                <ToggleAttivo id={p.id} attivo={p.attivo} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Miniatura({ url, nome }: { url: string | null; nome: string }) {
  return (
    <div className="relative aspect-[3/3.4] w-14 shrink-0 overflow-hidden rounded-xl bg-surface ring-1 ring-line">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- url da Storage con cache-bust
        <img
          src={url}
          alt={nome}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="tile-cyan grid h-full w-full place-items-center text-white">
          <svg
            viewBox="0 0 100 100"
            fill="currentColor"
            aria-hidden="true"
            className="w-1/2 drop-shadow-[0_4px_8px_rgba(0,40,70,0.25)]"
          >
            <path d="M32 18 L18 28 L24 40 L31 35 L31 84 L69 84 L69 35 L76 40 L82 28 L68 18 C64 24 56 26 50 26 C44 26 36 24 32 18 Z" />
          </svg>
        </div>
      )}
    </div>
  );
}

function BadgeStock({
  stock,
  numVarianti,
}: {
  stock: number;
  numVarianti: number;
}) {
  if (numVarianti === 0) {
    return (
      <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted">
        Nessuna variante
      </span>
    );
  }
  if (stock === 0) {
    return (
      <span className="rounded-full bg-coral/15 px-2.5 py-0.5 text-xs font-bold text-coral">
        Esaurito
      </span>
    );
  }
  if (stock <= SOGLIA_SCORTE) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-sun/30 px-2.5 py-0.5 text-xs font-bold text-[#8a6500]">
        <span
          aria-hidden="true"
          className="h-2 w-2 rounded-full bg-sun"
        />
        Scorte basse · {stock}
      </span>
    );
  }
  return <span className="text-xs text-muted">{stock} pz</span>;
}

function StatoVuoto({ haProdotti }: { haProdotti: boolean }) {
  return (
    <div className="rounded-3xl bg-surface px-6 py-12 text-center ring-1 ring-dashed ring-line">
      <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-surface-2 text-sea">
        <svg
          viewBox="0 0 100 100"
          fill="currentColor"
          aria-hidden="true"
          className="h-8 w-8"
        >
          <path d="M32 18 L18 28 L24 40 L31 35 L31 84 L69 84 L69 35 L76 40 L82 28 L68 18 C64 24 56 26 50 26 C44 26 36 24 32 18 Z" />
        </svg>
      </span>
      <p className="text-sm text-muted">
        {haProdotti
          ? "Nessun prodotto corrisponde alla ricerca."
          : "Non ci sono ancora prodotti."}
      </p>
      {!haProdotti && (
        <Link
          href="/gestore/prodotti/nuovo"
          className="mt-4 inline-flex h-11 items-center rounded-full bg-sea px-5 font-display text-sm font-bold text-white shadow-sea transition-all hover:-translate-y-0.5"
        >
          + Crea il primo prodotto
        </Link>
      )}
    </div>
  );
}
