"use client";

// Contenuto della pagina /carrello, guidato dal CartProvider (stessa fonte di
// verita di badge e mini-cart). Aggiunge: barra spedizione gratuita, riepilogo
// con breakdown dei costi, trust signals vicino al CTA (pagamento sicuro,
// acquisto come ospite) — leve note contro l'abbandono.

import Link from "next/link";

import CartItem, { CheckoutButton } from "@/components/CartItem";
import FreeShippingBar from "@/components/cart/FreeShippingBar";
import ModuloRichiesta from "@/components/cart/ModuloRichiesta";
import { useCarrello } from "@/components/cart/CartProvider";
import { formatPrezzo } from "@/lib/format";

export default function CarrelloContenuto() {
  const { righe, count, subtotaleCents, valuta } = useCarrello();

  if (count === 0) {
    return <StatoVuoto />;
  }

  // Coerente col mini-cart: con un articolo "su richiesta" si passa dal flusso
  // richiesta (nessun pagamento ora, il gestore conferma la disponibilita);
  // altrimenti pagamento diretto con Stripe.
  const suRichiesta = righe.some((r) => r.prodotto.disponibilita_su_richiesta);
  // Carrello MISTO: c'e almeno un articolo su richiesta E almeno uno a magazzino.
  // In quel caso l'intero ordine passa dal flusso richiesta: va spiegato, altrimenti
  // l'articolo a magazzino "perde" il pagamento immediato senza motivo apparente.
  const misto =
    suRichiesta && righe.some((r) => !r.prodotto.disponibilita_su_richiesta);

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
            <span>{suRichiesta ? "Da concordare" : "Calcolata al pagamento"}</span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
          <span className="font-display font-bold text-foreground">
            Totale stimato
          </span>
          <span className="font-display text-2xl font-extrabold text-sea">
            {formatPrezzo(subtotaleCents, valuta)}
          </span>
        </div>

        {suRichiesta ? (
          <>
            {/* Come funziona: niente pagamento ora */}
            <div className="mt-5 flex items-start gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-line">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="mt-0.5 h-5 w-5 flex-none text-sea"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v4l2.5 2.5" />
              </svg>
              <p className="text-sm text-muted">
                <span className="font-bold text-foreground">
                  Nessun pagamento ora.
                </span>{" "}
                {misto && (
                  <>
                    Il carrello contiene articoli su richiesta, quindi{" "}
                    <span className="font-semibold">
                      l’intero ordine passa dalla richiesta
                    </span>
                    .{" "}
                  </>
                )}
                Invii la richiesta, confermiamo la disponibilità di tutti gli
                articoli e <span className="font-semibold">solo dopo</span> paghi
                in sicurezza con Stripe.
              </p>
            </div>

            <div className="mt-5">
              <ModuloRichiesta />
            </div>
          </>
        ) : (
          <>
            <div className="mt-5">
              <CheckoutButton />
            </div>
            <p className="mt-3 text-center text-xs text-muted">
              Pagamento sicuro con Stripe · Spedizione e imposte calcolate al
              pagamento
            </p>
          </>
        )}

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
          Il carrello è vuoto
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
