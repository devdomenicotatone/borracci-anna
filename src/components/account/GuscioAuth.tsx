// Guscio comune delle pagine auth della vetrina (/accedi, /registrati, ...):
// kicker + titolo + card. Server component: le pagine restano sottili.

import type { ReactNode } from "react";

export default function GuscioAuth({
  kicker,
  titolo,
  sottotitolo,
  children,
  footer,
}: {
  kicker: string;
  titolo: string;
  sottotitolo?: string;
  children: ReactNode;
  /** Riga sotto la card (es. link a registrazione/accesso). */
  footer?: ReactNode;
}) {
  return (
    // <div>, non <main>: il layout vetrina fornisce gia il landmark <main
    // id="contenuto"> e annidarne un secondo e markup non valido.
    <div className="mx-auto w-full max-w-md px-5 py-14">
      <p className="font-display text-sm font-bold uppercase tracking-wide text-sea">
        {kicker}
      </p>
      <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-foreground">
        {titolo}
      </h1>
      {sottotitolo && <p className="mt-2 text-sm text-muted">{sottotitolo}</p>}
      <div className="mt-6 animate-pop-in rounded-3xl bg-white p-7 shadow-soft ring-1 ring-line">
        {children}
      </div>
      {footer && (
        <p className="mt-6 text-center text-sm text-muted">{footer}</p>
      )}
    </div>
  );
}
