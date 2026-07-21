"use client";

// Blocco "su richiesta" della PDP (Fase 2): il cliente sceglie quantità e
// AGGIUNGE ALLA RICHIESTA (carrello, senza vincolo di stock). Dal carrello
// invierà la richiesta; il negozio conferma la disponibilità e poi si paga.
// In secondo piano resta il contatto rapido ("Scrivici") di Fase 1.

import { useState, useTransition } from "react";

import { useCarrello } from "@/components/cart/CartProvider";
import StatoInvio from "@/components/StatoInvio";
import { NEGOZIO } from "@/lib/negozio";
import type { Prodotto, Variante } from "@/lib/types";

export default function BloccoRichiesta({
  prodotto,
  variante,
  colore,
  taglia,
}: {
  prodotto: Prodotto;
  variante: Variante | null;
  colore: string | null;
  taglia: string | null;
}) {
  const { aggiungi } = useCarrello();
  const [quantita, setQuantita] = useState(1);
  const [inCorso, startTransition] = useTransition();
  const [errore, setErrore] = useState<string | null>(null);

  const dettagli = [colore, taglia ? `Taglia ${taglia}` : null].filter(Boolean);
  const testo =
    `Ciao! Vorrei sapere la disponibilità di "${prodotto.nome}"` +
    (dettagli.length ? ` (${dettagli.join(", ")})` : "") +
    `. Grazie!`;
  const mailto =
    `mailto:${NEGOZIO.email}` +
    `?subject=${encodeURIComponent(`Disponibilità: ${prodotto.nome}`)}` +
    `&body=${encodeURIComponent(testo)}`;
  const whatsapp = NEGOZIO.whatsapp
    ? `https://wa.me/${NEGOZIO.whatsapp}?text=${encodeURIComponent(testo)}`
    : null;
  const tel = NEGOZIO.telefono
    ? `tel:${NEGOZIO.telefono.replace(/[^\d+]/g, "")}`
    : null;

  function handleAggiungi() {
    if (!variante) {
      // Colore E taglia scelti ma nessuna variante: e una combinazione che non
      // esiste (matrice colore/taglia sparsa), non una selezione incompleta.
      setErrore(
        colore && taglia
          ? "Questa combinazione di colore e taglia non è disponibile: scegline un'altra."
          : "Seleziona colore e taglia.",
      );
      return;
    }
    setErrore(null);
    startTransition(async () => {
      await aggiungi({ prodotto, variante, quantita });
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Quantità */}
      <div>
        <span className="mb-3 block font-display text-sm font-bold uppercase tracking-wide text-muted">
          Quantità
        </span>
        <div className="inline-flex items-center gap-1 rounded-full bg-white p-1.5 ring-2 ring-surface-2">
          <button
            type="button"
            aria-label="Diminuisci quantita"
            disabled={quantita <= 1}
            onClick={() => setQuantita((q) => Math.max(1, q - 1))}
            className="grid h-11 w-11 place-items-center rounded-full text-xl font-bold leading-none text-sea transition-colors hover:bg-surface disabled:opacity-40"
          >
            -
          </button>
          <input
            type="number"
            min={1}
            value={quantita}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value, 10);
              setQuantita(Number.isNaN(n) ? 1 : Math.max(1, n));
            }}
            aria-label="Quantità"
            className="w-12 bg-transparent text-center font-display text-lg font-bold text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <button
            type="button"
            aria-label="Aumenta quantita"
            onClick={() => setQuantita((q) => q + 1)}
            className="grid h-11 w-11 place-items-center rounded-full text-xl font-bold leading-none text-sea transition-colors hover:bg-surface"
          >
            +
          </button>
        </div>
      </div>

      {/* Il pulsante NON e disabilitato quando manca la variante: cliccandolo
          mostra il motivo (selezione incompleta o combinazione inesistente),
          invece di restare inerte e muto. Disabilitato solo durante l'invio. */}
      <button
        type="button"
        onClick={handleAggiungi}
        disabled={inCorso}
        aria-disabled={!variante}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-coral-ink px-6 font-display font-bold text-white shadow-coral transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 aria-disabled:opacity-60 sm:w-auto"
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
        {inCorso ? "Aggiunta in corso..." : "Aggiungi alla richiesta"}
      </button>
      <StatoInvio attivo={inCorso} testo="Aggiunta alla richiesta in corso" />

      {errore && (
        <p role="alert" className="text-sm font-semibold text-coral-ink">
          {errore}
        </p>
      )}

      <p className="max-w-prose text-xs text-muted">
        <span className="font-semibold text-foreground">
          Nessun pagamento ora.
        </span>{" "}
        Dal carrello invii la richiesta: confermiamo la disponibilità e solo dopo
        paghi.
      </p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-4 text-sm">
        <span className="text-muted">Preferisci chiedere prima?</span>
        <a
          href={mailto}
          className="font-semibold text-sea underline underline-offset-2 transition-colors hover:text-lagoon-ink"
        >
          Scrivici via email
        </a>
        {whatsapp && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-sea underline underline-offset-2 transition-colors hover:text-lagoon-ink"
          >
            WhatsApp
          </a>
        )}
        {tel && (
          <a
            href={tel}
            className="font-semibold text-sea underline underline-offset-2 transition-colors hover:text-lagoon-ink"
          >
            Chiamaci
          </a>
        )}
      </div>
    </div>
  );
}
