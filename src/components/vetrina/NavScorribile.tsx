"use client";

// Riga orizzontale scorribile con frecce ‹ ›: i chip di navigazione restano su
// UNA sola riga; le frecce compaiono solo quando c'e contenuto oltre il bordo
// (e indicano che si puo scorrere). Su mobile lo swipe resta primario, ma le
// frecce aiutano dove non c'e touch. Il contenuto (i chip) arriva come children
// dal Server Component che le renderizza.

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

export default function NavScorribile({
  children,
  etichetta = "le categorie",
}: {
  children: ReactNode;
  /** Cosa si scorre, per le aria-label delle frecce (es. "i temi"). */
  etichetta?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [sx, setSx] = useState(false);
  const [dx, setDx] = useState(false);

  const aggiorna = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // Margine di 1px: evita sfarfallii della freccia su arrotondamenti sub-pixel.
    setSx(el.scrollLeft > 1);
    setDx(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  }, []);

  useEffect(() => {
    aggiorna();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", aggiorna, { passive: true });
    window.addEventListener("resize", aggiorna);
    return () => {
      el.removeEventListener("scroll", aggiorna);
      window.removeEventListener("resize", aggiorna);
    };
  }, [aggiorna]);

  // Ricalcola le frecce quando cambia il contenuto (es. i chip filtro che si
  // riducono dopo una selezione): senza questo la freccia destra resterebbe
  // visibile "fantasma" pur essendo tutto ormai a schermo.
  useEffect(() => {
    aggiorna();
  }, [children, aggiorna]);

  function scorri(verso: -1 | 1) {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: verso * el.clientWidth * 0.8, behavior: "smooth" });
  }

  const frecciaCls =
    "absolute top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white text-foreground shadow-sea ring-1 ring-line transition-colors hover:ring-sea";

  return (
    <div className="relative">
      {sx && (
        <button
          type="button"
          aria-label={`Scorri ${etichetta} a sinistra`}
          onClick={() => scorri(-1)}
          className={`${frecciaCls} left-0`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
      )}

      <div
        ref={ref}
        className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>

      {dx && (
        <button
          type="button"
          aria-label={`Scorri ${etichetta} a destra`}
          onClick={() => scorri(1)}
          className={`${frecciaCls} right-0`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      )}
    </div>
  );
}
