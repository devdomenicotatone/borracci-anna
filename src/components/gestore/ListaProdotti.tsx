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
        <h1 className="text-xl font-semibold text-foreground">Prodotti</h1>
        <Link
          href="/gestore/prodotti/nuovo"
          className="inline-flex h-10 items-center rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/85"
        >
          + Nuovo
        </Link>
      </div>

      {/* Toolbar: ricerca + filtro */}
      <div className="sticky top-14 z-10 -mx-4 mb-4 flex flex-col gap-2 bg-background/95 px-4 py-2 backdrop-blur md:top-0 md:mx-0 md:px-0">
        <input
          type="search"
          inputMode="search"
          placeholder="Cerca per nome o slug…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-11 w-full rounded-full border border-line bg-surface px-4 text-base text-foreground outline-none transition-colors focus-visible:border-foreground"
        />
        <div className="flex gap-1 rounded-full border border-line bg-surface p-1 text-sm">
          {(["tutti", "attivi", "nascosti"] as Filtro[]).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filtro === f}
              onClick={() => setFiltro(f)}
              className={[
                "flex-1 rounded-full py-1.5 font-medium capitalize transition-colors",
                filtro === f
                  ? "bg-foreground text-background"
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
        <ul className="flex flex-col gap-2">
          {visibili.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3"
            >
              <Link
                href={`/gestore/prodotti/${p.id}`}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <Miniatura url={p.immagine_url} nome={p.nome} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {p.nome}
                  </p>
                  <p className="truncate font-mono text-xs text-muted">
                    /{p.slug}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="text-sm tabular-nums text-foreground">
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
                    "text-xs font-medium",
                    p.attivo ? "text-foreground" : "text-muted",
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
    <div className="relative aspect-[4/5] w-14 shrink-0 overflow-hidden rounded-lg border border-line bg-surface">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- url da Storage con cache-bust
        <img
          src={url}
          alt={nome}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="h-full w-full bg-[repeating-linear-gradient(45deg,var(--surface),var(--surface)_8px,var(--background)_8px,var(--background)_16px)]" />
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
      <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted">
        Nessuna variante
      </span>
    );
  }
  if (stock === 0) {
    return (
      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
        Esaurito
      </span>
    );
  }
  if (stock <= SOGLIA_SCORTE) {
    return (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        Scorte basse · {stock}
      </span>
    );
  }
  return (
    <span className="text-xs text-muted">{stock} pz</span>
  );
}

function StatoVuoto({ haProdotti }: { haProdotti: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface px-6 py-12 text-center">
      <p className="text-sm text-muted">
        {haProdotti
          ? "Nessun prodotto corrisponde alla ricerca."
          : "Non ci sono ancora prodotti."}
      </p>
      {!haProdotti && (
        <Link
          href="/gestore/prodotti/nuovo"
          className="mt-4 inline-flex h-10 items-center rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/85"
        >
          + Crea il primo prodotto
        </Link>
      )}
    </div>
  );
}
