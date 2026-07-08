"use client";

// Primitivi di form condivisi dall'area gestore (pannello admin). Prima erano
// ricopiati in fondo a piu file (RevisioneBozza, ImportaDaUrl, GestoreVetrina,
// ListaProdotti, ImportaBatch, GestoreMedia) con stili leggermente divergenti:
// un ritocco al design system andava replicato a mano e le copie restavano
// indietro. Fonte unica qui, cosi select, toggle e spinner restano coerenti.

import type { ReactNode } from "react";

// Stile base dei campi input/select del pannello. Include il focus ring (era
// presente solo nella vetrina): unificarlo verso l'alto non toglie la
// visibilita del focus a nessun form.
export const inputCls =
  "h-12 w-full rounded-2xl bg-white px-4 text-base text-foreground ring-1 ring-line outline-none transition-shadow focus:ring-2 focus:ring-sea";

/** Etichetta + campo + hint. Con `htmlFor` l'etichetta e un <label> associato;
 *  senza (es. quando il controllo non ha un id) degrada a <span>. */
export function Campo({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {htmlFor ? (
        <label
          htmlFor={htmlFor}
          className="font-display text-sm font-bold text-foreground"
        >
          {label}
        </label>
      ) : (
        <span className="font-display text-sm font-bold text-foreground">
          {label}
        </span>
      )}
      {children}
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

/** Freccia dei <select> con `appearance-none`: va posta in un contenitore
 *  `relative` (il select tiene lo spazio a destra con `pr-9`/`pr-10`). */
export function ChevronSelect() {
  return (
    <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-muted">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </span>
  );
}

/** Interruttore a riga intera: titolo + descrizione a sinistra, toggle a
 *  destra. Per le opzioni on/off con spiegazione. */
export function SwitchRiga({
  titolo,
  descrizione,
  acceso,
  onToggle,
  disabled = false,
}: {
  titolo: ReactNode;
  descrizione: ReactNode;
  acceso: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={acceso}
      onClick={onToggle}
      disabled={disabled}
      className="flex w-full items-center justify-between gap-4 rounded-2xl bg-white px-4 py-3 text-left ring-1 ring-line transition-all hover:ring-lagoon disabled:opacity-50"
    >
      <span className="min-w-0">
        <span className="block font-display text-sm font-bold text-foreground">
          {titolo}
        </span>
        <span className="mt-0.5 block text-xs text-muted">{descrizione}</span>
      </span>
      <span
        aria-hidden="true"
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
          acceso ? "bg-sea" : "bg-line"
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
            acceso ? "left-6" : "left-1"
          }`}
        />
      </span>
    </button>
  );
}

/** Interruttore compatto (accanto a una label), senza testo proprio. */
export function SwitchMini({
  on,
  onClick,
  label,
  disabled = false,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
        on ? "bg-sea" : "bg-line"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all ${
          on ? "left-6" : "left-1"
        }`}
      />
    </button>
  );
}

/** Spinner (arco che ruota). Colore via `currentColor`, dimensione via
 *  `className` (es. "h-4 w-4 text-sea"). */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      className={`animate-spin ${className}`}
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-6.2-8.56" />
    </svg>
  );
}
