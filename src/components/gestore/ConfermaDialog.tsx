"use client";

// Dialog di conferma per azioni distruttive (elimina prodotto, rimuovi foto).
// Componente controllato: la visibilita e gestita dal chiamante via `aperto`.
// Accessibilita: focus spostato dentro, intrappolato (Tab), Esc annulla, focus
// ripristinato in chiusura — via useDialogModale, come CartDrawer.

import { useRef } from "react";

import { useDialogModale } from "@/components/useDialogModale";

export default function ConfermaDialog({
  aperto,
  titolo,
  messaggio,
  etichettaConferma = "Elimina",
  inCorso = false,
  onConferma,
  onAnnulla,
}: {
  aperto: boolean;
  titolo: string;
  messaggio: string;
  etichettaConferma?: string;
  inCorso?: boolean;
  onConferma: () => void;
  onAnnulla: () => void;
}) {
  const pannelloRef = useRef<HTMLDivElement>(null);
  // Hook chiamato PRIMA dell'early-return (le regole degli hook lo impongono);
  // internamente non fa nulla se `aperto` e false.
  useDialogModale(aperto, pannelloRef, onAnnulla);

  if (!aperto) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-4 backdrop-blur-sm sm:items-center"
      onClick={onAnnulla}
    >
      <div
        ref={pannelloRef}
        role="dialog"
        aria-modal="true"
        aria-label={titolo}
        tabIndex={-1}
        className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-soft outline-none ring-1 ring-line"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-lg font-extrabold text-foreground">
          {titolo}
        </h2>
        <p className="mt-2 text-sm text-muted">{messaggio}</p>
        <div className="mt-6 flex gap-2.5">
          <button
            type="button"
            onClick={onAnnulla}
            disabled={inCorso}
            className="h-12 flex-1 rounded-full bg-white text-sm font-bold text-muted ring-2 ring-surface-2 transition-all hover:bg-surface hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={onConferma}
            disabled={inCorso}
            className="flex h-12 flex-1 items-center justify-center rounded-full bg-coral font-display text-sm font-bold text-white shadow-coral transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
          >
            {inCorso ? "Attendi…" : etichettaConferma}
          </button>
        </div>
      </div>
    </div>
  );
}
