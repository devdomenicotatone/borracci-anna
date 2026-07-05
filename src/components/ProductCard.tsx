// Card prodotto per la griglia della vetrina.
// Mostra immagine (tile gradiente pop con icona indumento se mancante), nome,
// prezzo formattato e rimanda alla PDP /prodotti/[slug].

import Image from "next/image";
import Link from "next/link";
import type { Prodotto } from "@/lib/types";
import { formatPrezzo } from "@/lib/format";

// Gradienti "tile" disponibili (definiti in globals.css). Si sceglie in modo
// deterministico dall'id/slug cosi la stessa card mostra sempre lo stesso colore.
const TILE_GRADIENTS = [
  "tile-cyan",
  "tile-coral",
  "tile-sun",
  "tile-deep",
  "tile-sunset",
  "tile-cyan-soft",
] as const;

// Le tile chiare (sole) vogliono testo/icona scuri per contrasto AA.
const TILE_INK = new Set<string>(["tile-sun"]);

/** Sceglie un gradiente in modo stabile a partire da una stringa. */
function gradientPer(seed: string): (typeof TILE_GRADIENTS)[number] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return TILE_GRADIENTS[hash % TILE_GRADIENTS.length];
}

export default function ProductCard({ prodotto }: { prodotto: Prodotto }) {
  const gradiente = gradientPer(prodotto.id || prodotto.slug);
  const inchiostro = TILE_INK.has(gradiente);

  return (
    <Link
      href={`/prodotti/${prodotto.slug}`}
      className="group relative block rounded-3xl bg-white p-2.5 shadow-soft transition duration-200 hover:-translate-y-1.5 hover:shadow-sea"
      aria-label={`Vedi ${prodotto.nome}`}
    >
      <div className="relative aspect-[3/3.4] w-full overflow-hidden rounded-2xl">
        {prodotto.solo_online && (
          <span className="absolute left-2 top-2 z-20 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 font-display text-[10px] font-bold text-sea ring-1 ring-sea/25 backdrop-blur">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-2.5 w-2.5"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
            </svg>
            Solo online
          </span>
        )}
        {prodotto.immagine_url ? (
          // Le copertine sono sempre url del bucket Supabase Storage (whitelisted
          // in next.config.ts): next/image negozia AVIF/WebP e genera lo srcset
          // responsive. `sizes` rispecchia la griglia 2/3/4 colonne, cosi in 2-col
          // mobile si scarica ~50vw invece del master pieno.
          <Image
            src={prodotto.immagine_url}
            alt={prodotto.nome}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            quality={75}
            className="object-cover transition-transform duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          // Tile gradiente pop + icona indumento + nome in basso.
          <div
            className={`relative flex h-full w-full items-center justify-center ${gradiente}`}
          >
            {/* texture a puntini sottili sopra il gradiente */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(rgba(255,255,255,.35)_1.5px,transparent_2px)] [background-size:18px_18px]"
            />
            <svg
              viewBox="0 0 100 100"
              fill="currentColor"
              aria-hidden="true"
              className={`relative z-10 w-[46%] max-w-[120px] drop-shadow-[0_6px_12px_rgba(0,40,70,.25)] ${
                inchiostro ? "text-foreground" : "text-white"
              }`}
            >
              <path d="M32 18 L18 28 L24 40 L31 35 L31 84 L69 84 L69 35 L76 40 L82 28 L68 18 C64 24 56 26 50 26 C44 26 36 24 32 18 Z" />
            </svg>
            <span
              className={`absolute inset-x-3 bottom-3 z-10 font-display text-sm font-bold ${
                inchiostro
                  ? "text-foreground"
                  : "text-white drop-shadow-[0_2px_8px_rgba(0,30,55,.5)]"
              }`}
            >
              {prodotto.nome}
            </span>
          </div>
        )}
      </div>

      <div className="px-2 pb-1 pt-3">
        <h3 className="font-display text-base font-bold leading-snug text-foreground">
          {prodotto.nome}
        </h3>
        <span className="mt-0.5 block font-bold tabular-nums text-sea">
          {formatPrezzo(prodotto.prezzo_cents, prodotto.valuta)}
        </span>
      </div>
    </Link>
  );
}
