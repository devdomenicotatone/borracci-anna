"use client";

// Bottone "Paga ora" sulla pagina /ordine/[token] (solo ordini confermati).
// Crea la Checkout Session Stripe on-demand e reindirizza al pagamento.
// Come CheckoutButton (CartItem.tsx): timeout di 15s + gestione errori, così su
// rete lenta o caduta il bottone non resta "Avvio pagamento…" per sempre e
// l'errore compare accanto (role="alert") lasciando riprovare.

import { useState, useTransition } from "react";

import StatoInvio from "@/components/StatoInvio";
import { conTimeout, ErroreTimeout } from "@/lib/con-timeout";
import { creaCheckoutOrdineAction } from "@/lib/ordini";

export default function PulsantePaga({ token }: { token: string }) {
  const [inCorso, startTransition] = useTransition();
  const [errore, setErrore] = useState<string | null>(null);

  function paga() {
    setErrore(null);
    startTransition(async () => {
      try {
        const esito = await conTimeout(creaCheckoutOrdineAction(token), 15000);
        if (esito.ok && esito.url) {
          window.location.href = esito.url;
          return;
        }
        setErrore(esito.error ?? "Impossibile avviare il pagamento.");
      } catch (err) {
        // Rete caduta o timeout: niente error boundary, si mostra il messaggio
        // vicino al bottone e si lascia riprovare.
        setErrore(
          err instanceof ErroreTimeout
            ? "Il pagamento sta impiegando troppo tempo. Riprova."
            : "Si è verificato un problema. Riprova.",
        );
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={paga}
        disabled={inCorso}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-coral-ink px-6 font-display font-bold text-white shadow-coral transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="h-5 w-5"
        >
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
        </svg>
        {inCorso ? "Avvio pagamento…" : "Paga ora"}
      </button>
      <StatoInvio attivo={inCorso} testo="Avvio del pagamento in corso" />
      {errore && (
        <p role="alert" className="text-sm font-semibold text-coral-ink">
          {errore}
        </p>
      )}
    </div>
  );
}
