// Fascia SCORCIATOIE CATEGORIA: griglia di tile colorate verso le categorie
// radice. Occhiello e titolo dalla sezione; le categorie arrivano dal server.

import Link from "next/link";

import type { GruppoCategorie } from "@/lib/categorie-albero";
import type { FasciaVetrina } from "@/lib/vetrina-home";
import OcchielloSezione from "@/components/vetrina/OcchielloSezione";

// Tile gradiente per le card categoria (classi in globals.css). tile-sun e
// chiara: vuole testo scuro per il contrasto.
const TILE_CATEGORIE = [
  "tile-deep",
  "tile-coral",
  "tile-cyan",
  "tile-sunset",
  "tile-sun",
  "tile-cyan-soft",
] as const;
const TILE_CHIARE = new Set<string>(["tile-sun"]);

export default function FasciaCategorie({
  fascia,
  gruppi,
}: {
  fascia: FasciaVetrina;
  gruppi: GruppoCategorie[];
}) {
  if (gruppi.length === 0) return null;

  return (
    <section
      aria-labelledby={`sez-${fascia.id}`}
      className="mx-auto max-w-6xl px-5 pt-12 sm:pt-14"
    >
      <div className="mb-6">
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
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {gruppi.map(({ radice, figlie }, i) => {
          const tile = TILE_CATEGORIE[i % TILE_CATEGORIE.length];
          const scuro = TILE_CHIARE.has(tile);
          return (
            <Link
              key={radice.id}
              href={`/categoria/${radice.slug}`}
              className={`group relative isolate overflow-hidden rounded-3xl p-5 shadow-soft transition duration-200 hover:-translate-y-1.5 hover:shadow-sea ${tile} ${
                scuro ? "text-foreground" : "text-white"
              }`}
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-10 opacity-40 [background-image:radial-gradient(rgba(255,255,255,.35)_1.5px,transparent_2px)] [background-size:18px_18px]"
              />
              <span className="font-display text-xl font-extrabold sm:text-2xl">
                {radice.nome}
              </span>
              {figlie.length > 0 && (
                <p
                  className={`mt-1 line-clamp-2 text-xs font-medium sm:text-sm ${
                    scuro ? "text-foreground/75" : "text-white/85"
                  }`}
                >
                  {figlie.map((f) => f.nome).join(" · ")}
                </p>
              )}
              <span
                aria-hidden="true"
                className="mt-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/40 backdrop-blur transition-transform duration-200 group-hover:translate-x-1"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
