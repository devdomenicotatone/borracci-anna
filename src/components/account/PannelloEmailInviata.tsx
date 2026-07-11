"use client";

// Pannello "controlla la posta": busta in cerchio + messaggio. Usato dal form
// di registrazione (post-signUp) e dal recupero password (esito neutro).
// Client component: al mount sposta il focus sul titolo cosi gli screen reader
// annunciano il cambio di contesto (il form e sparito, e arrivata la conferma);
// la sola aria-live non basta perche il pannello viene montato gia pieno.

import { useEffect, useRef, type ReactNode } from "react";

export default function PannelloEmailInviata({
  titolo,
  children,
}: {
  titolo: string;
  children: ReactNode;
}) {
  const titoloRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titoloRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span className="grid h-14 w-14 animate-pop place-items-center rounded-full bg-sea/10 text-sea">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-7 w-7"
          aria-hidden="true"
        >
          <rect x="2" y="4" width="20" height="16" rx="3" />
          <path d="m2 7 10 7 10-7" />
        </svg>
      </span>
      <h2
        ref={titoloRef}
        tabIndex={-1}
        className="font-display text-xl font-extrabold text-foreground outline-none"
      >
        {titolo}
      </h2>
      <div className="text-sm leading-relaxed text-muted">{children}</div>
    </div>
  );
}
