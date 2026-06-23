"use client";

// Badge contatore del carrello, vive dentro il Link carrello dell'Header.
// Legge il conteggio dal CartProvider: si aggiorna all'istante a ogni
// add/rimuovi (ottimistico). `key={count}` rimonta lo span cosi l'animazione
// "pop" si ripete a ogni cambio (neutralizzata da prefers-reduced-motion).

import { useCarrello } from "@/components/cart/CartProvider";

export default function CartBadge() {
  const { count } = useCarrello();

  return (
    <>
      {count > 0 && (
        <span
          key={count}
          aria-hidden="true"
          className="animate-pop absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-coral px-1 font-display text-[11px] font-bold leading-none text-white shadow-coral ring-2 ring-background"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
      {/* Annuncio per screen reader, separato dal pallino visivo. */}
      <span className="sr-only" aria-live="polite">
        {count === 0
          ? "Carrello vuoto"
          : `${count} ${count === 1 ? "articolo" : "articoli"} nel carrello`}
      </span>
    </>
  );
}
