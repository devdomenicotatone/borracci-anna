"use client";

// Blocco acquisto (modalita vendita diretta): selettore quantita + bottone
// "Aggiungi al carrello". La scelta di colore/taglia avviene a monte
// (ProdottoDettaglio); qui arriva gia la variante risolta. Delega al
// CartProvider (badge ottimistico, mini-cart, toast gestiti li).

import { useState, useTransition } from "react";

import { useCarrello } from "@/components/cart/CartProvider";
import type { Prodotto, Variante } from "@/lib/types";

export default function BloccoAcquisto({
  prodotto,
  variante,
}: {
  prodotto: Prodotto;
  variante: Variante | null;
}) {
  const { aggiungi } = useCarrello();
  const [quantitaScelta, setQuantitaScelta] = useState<number>(1);
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, startTransition] = useTransition();

  const stockMax = variante?.stock ?? 0;
  const stockBasso = stockMax > 0 && stockMax <= 3;

  // Quantita EFFETTIVA: la scelta dell'utente cappata allo stock della variante
  // corrente, derivata al render (niente effetti). Al cambio taglia/colore
  // l'input mostra cosi SEMPRE un valore acquistabile: prima continuava a
  // mostrare la quantita della variante precedente (es. 5) mentre al click ne
  // venivano aggiunte meno (stock 2), in silenzio.
  const quantita = Math.min(Math.max(1, quantitaScelta), stockMax || 1);
  const puoAggiungere = !!variante && stockMax > 0 && quantita >= 1;

  function handleAggiungi() {
    if (!variante) {
      setErrore("Seleziona colore e taglia.");
      return;
    }
    setErrore(null);
    startTransition(async () => {
      await aggiungi({ prodotto, variante, quantita });
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Selettore quantita */}
      <div>
        <label
          htmlFor="quantita"
          className="mb-3 block font-display text-sm font-bold uppercase tracking-wide text-muted"
        >
          Quantità
        </label>
        <div className="inline-flex items-center gap-1 rounded-full bg-white p-1.5 ring-2 ring-surface-2">
          <button
            type="button"
            aria-label="Diminuisci quantita"
            disabled={quantita <= 1}
            onClick={() => setQuantitaScelta(Math.max(1, quantita - 1))}
            className="grid h-11 w-11 place-items-center rounded-full text-xl font-bold leading-none text-sea transition-colors hover:bg-surface disabled:opacity-40"
          >
            -
          </button>
          <input
            id="quantita"
            type="number"
            min={1}
            max={stockMax || 1}
            value={quantita}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value, 10);
              if (Number.isNaN(n)) {
                setQuantitaScelta(1);
                return;
              }
              setQuantitaScelta(Math.min(Math.max(1, n), stockMax || 1));
            }}
            className="w-12 bg-transparent text-center font-display text-lg font-bold text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <button
            type="button"
            aria-label="Aumenta quantita"
            disabled={quantita >= stockMax}
            onClick={() => setQuantitaScelta(Math.min(stockMax || 1, quantita + 1))}
            className="grid h-11 w-11 place-items-center rounded-full text-xl font-bold leading-none text-sea transition-colors hover:bg-surface disabled:opacity-40"
          >
            +
          </button>
        </div>
        {variante && (
          <p
            className={`mt-2 text-xs ${stockBasso ? "font-semibold text-coral-ink" : "text-muted"}`}
          >
            {stockBasso ? `Solo ${stockMax} rimasti` : `${stockMax} disponibili`}
          </p>
        )}
      </div>

      {/* Azione */}
      <button
        type="button"
        onClick={handleAggiungi}
        disabled={!puoAggiungere || inCorso}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-coral px-6 font-display font-bold text-white shadow-coral transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 sm:w-auto"
      >
        <svg
          className="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="9" cy="20" r="1.4" />
          <circle cx="18" cy="20" r="1.4" />
          <path d="M2.5 3h2l2.3 12.2a1.6 1.6 0 0 0 1.6 1.3h8.5a1.6 1.6 0 0 0 1.6-1.3L21 7H6" />
        </svg>
        {inCorso ? "Aggiunta in corso..." : "Aggiungi al carrello"}
      </button>

      {errore && (
        <p role="alert" className="text-sm font-semibold text-coral-ink">
          {errore}
        </p>
      )}
    </div>
  );
}
