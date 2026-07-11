// Card di un ordine nello storico: numero + data, stato, miniature
// sovrapposte e totale. Tutta la card e un link al dettaglio.

import Link from "next/link";

import BadgeStatoOrdine from "@/components/ordini/BadgeStatoOrdine";
import MiniaturaProdotto from "@/components/ordini/MiniaturaProdotto";
import type { OrdineLista } from "@/lib/account/ordini";
import { etichettaNumeroOrdine } from "@/lib/ordini-ui";
import { formatDataLunga, formatPrezzo } from "@/lib/format";

export default function CardOrdine({ ordine }: { ordine: OrdineLista }) {
  return (
    <Link
      href={`/account/ordini/${ordine.id}`}
      className="group flex flex-col gap-3 rounded-3xl bg-white p-5 shadow-soft ring-1 ring-line transition hover:-translate-y-0.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-display text-sm font-bold text-foreground">
            {etichettaNumeroOrdine(ordine)}
          </p>
          <p className="text-xs text-muted">
            {formatDataLunga(ordine.creato_il)}
          </p>
        </div>
        <BadgeStatoOrdine stato={ordine.stato} />
      </div>

      <div className="flex items-center gap-3">
        {ordine.miniature.length > 0 && (
          <div className="flex -space-x-3">
            {ordine.miniature.map((url, i) => (
              <MiniaturaProdotto
                key={i}
                url={url}
                className="h-12 w-12 ring-2 ring-white"
              />
            ))}
          </div>
        )}
        {ordine.altriArticoli > 0 && (
          <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-bold text-muted">
            +{ordine.altriArticoli}
          </span>
        )}
        <span className="text-sm text-muted">
          {ordine.numArticoli === 1
            ? "1 articolo"
            : `${ordine.numArticoli} articoli`}{" "}
          ·{" "}
          <span className="font-display font-bold tabular-nums text-foreground">
            {formatPrezzo(ordine.totale_cents)}
          </span>
        </span>
        <span
          aria-hidden="true"
          className="ml-auto text-muted transition-transform group-hover:translate-x-0.5"
        >
          ›
        </span>
      </div>
    </Link>
  );
}
