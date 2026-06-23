"use client";

// Contenuto della pagina /carrello, guidato dal CartProvider (stessa fonte di
// verita di badge e mini-cart). Aggiunge: barra spedizione gratuita, riepilogo
// con breakdown dei costi, trust signals vicino al CTA (pagamento sicuro,
// acquisto come ospite) — leve note contro l'abbandono.

import Link from "next/link";

import CartItem, { CheckoutButton } from "@/components/CartItem";
import FreeShippingBar from "@/components/cart/FreeShippingBar";
import { useCarrello } from "@/components/cart/CartProvider";
import { formatPrezzo } from "@/lib/format";

export default function CarrelloContenuto() {
  const { righe, count, subtotaleCents, valuta } = useCarrello();

  if (count === 0) {
    return <StatoVuoto />;
  }

  return (
    <div className="mt-8">
      <ul className="divide-y divide-line">
        {righe.map((riga) => (
          <CartItem key={riga.id} riga={riga} />
        ))}
      </ul>

      {/* Riepilogo */}
      <div className="mt-8 rounded-3xl bg-surface p-6 shadow-soft ring-1 ring-line">
        <FreeShippingBar />

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-sm text-muted">
            <span>
              Subtotale ({count} {count === 1 ? "articolo" : "articoli"})
            </span>
            <span className="tabular-nums text-foreground">
              {formatPrezzo(subtotaleCents, valuta)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm text-muted">
            <span>Spedizione</span>
            <span>Calcolata al pagamento</span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
          <span className="font-display font-bold text-foreground">Totale</span>
          <span className="font-display text-2xl font-extrabold text-sea">
            {formatPrezzo(subtotaleCents, valuta)}
          </span>
        </div>

        <div className="mt-6">
          <CheckoutButton />
        </div>

        {/* Trust signals vicino al CTA */}
        <div className="mt-4 space-y-2">
          <p className="flex items-center justify-center gap-2 text-xs text-muted">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="h-4 w-4 text-sea"
            >
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            Pagamento sicuro gestito da Stripe
          </p>
          <p className="text-center text-xs text-muted">
            Acquisti come ospite, senza registrazione.
          </p>
        </div>

        <div className="mt-4 text-center">
          <Link
            href="/"
            className="text-sm font-medium text-sea underline-offset-2 transition-colors hover:text-lagoon hover:underline"
          >
            Continua lo shopping
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Stato vuoto curato quando non ci sono righe nel carrello. */
function StatoVuoto() {
  return (
    <div className="mt-12 flex flex-col items-center gap-4 rounded-3xl bg-surface py-16 text-center shadow-soft ring-1 ring-line">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 text-3xl">
        🏖️
      </div>
      <div>
        <p className="font-display text-lg font-bold text-foreground">
          Il carrello e vuoto
        </p>
        <p className="mt-1 text-sm text-muted">
          Non hai ancora aggiunto nessun articolo. Tuffati nella collezione!
        </p>
      </div>
      <Link
        href="/"
        className="mt-2 flex h-11 items-center justify-center rounded-full bg-coral px-6 font-display font-bold text-white shadow-coral transition-transform hover:-translate-y-0.5"
      >
        Scopri i prodotti
      </Link>
    </div>
  );
}
