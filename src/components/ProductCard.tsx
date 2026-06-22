// Card prodotto per la griglia della vetrina.
// Mostra immagine (placeholder se mancante), nome, prezzo formattato e
// rimanda alla PDP /prodotti/[slug].

import Link from "next/link";
import type { Prodotto } from "@/lib/types";
import { formatPrezzo } from "@/lib/format";

export default function ProductCard({ prodotto }: { prodotto: Prodotto }) {
  return (
    <Link
      href={`/prodotti/${prodotto.slug}`}
      className="group flex flex-col"
      aria-label={`Vedi ${prodotto.nome}`}
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl border border-line bg-surface">
        {prodotto.immagine_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- url esterne arbitrarie dal DB
          <img
            src={prodotto.immagine_url}
            alt={prodotto.nome}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          // Placeholder elegante quando manca l'immagine.
          <div className="flex h-full w-full items-center justify-center bg-[repeating-linear-gradient(45deg,var(--surface),var(--surface)_14px,var(--background)_14px,var(--background)_28px)]">
            <span className="wordmark text-3xl text-line select-none">
              by Frody
            </span>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium text-foreground transition-colors group-hover:text-muted">
          {prodotto.nome}
        </h3>
        <span className="shrink-0 text-sm tabular-nums text-foreground">
          {formatPrezzo(prodotto.prezzo_cents, prodotto.valuta)}
        </span>
      </div>
    </Link>
  );
}
