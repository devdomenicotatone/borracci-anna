"use client";

// Barra di avanzamento verso la spedizione gratuita.
// Legge il subtotale dal CartProvider, quindi si aggiorna in modo ottimistico
// a ogni cambio quantita. Soglia configurata in lib/spedizione.ts.
// Leva AOV: incoraggia ad aggiungere qualcosa per superare la soglia.
// Nascosta nel flusso "su richiesta": li la spedizione e "da concordare",
// quindi non esiste una soglia da sbloccare e la barra sarebbe fuorviante.

import { useCarrello } from "@/components/cart/CartProvider";
import { formatPrezzo } from "@/lib/format";
import { statoSpedizione } from "@/lib/spedizione";

export default function FreeShippingBar() {
  const { righe, subtotaleCents, valuta, count } = useCarrello();

  // Niente barra a carrello vuoto.
  if (count === 0) return null;

  // Con un articolo "su richiesta" l'intero ordine passa dal flusso richiesta
  // e la spedizione va concordata: promettere la "spedizione gratuita" qui
  // sarebbe disonesto. La guardia sta QUI (non nei consumatori) cosi vale per
  // tutti: pagina carrello e mini-cart, stessa fonte di verita.
  if (righe.some((r) => r.prodotto.disponibilita_su_richiesta)) return null;

  const { mancanteCents, raggiunta, percentuale } =
    statoSpedizione(subtotaleCents);

  return (
    <div className="rounded-2xl bg-surface p-3.5 ring-1 ring-line">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {raggiunta ? (
          <>
            <span aria-hidden="true">🎉</span>
            <span>Spedizione gratuita sbloccata!</span>
          </>
        ) : (
          <>
            <span aria-hidden="true">🚚</span>
            <span>
              Ti mancano{" "}
              <span className="text-sea">
                {formatPrezzo(mancanteCents, valuta)}
              </span>{" "}
              alla spedizione gratuita
            </span>
          </>
        )}
      </p>
      <div
        className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentuale}
        aria-label="Avanzamento verso la spedizione gratuita"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out ${
            raggiunta ? "bg-sea" : "bg-lagoon"
          }`}
          style={{ width: `${percentuale}%` }}
        />
      </div>
    </div>
  );
}
